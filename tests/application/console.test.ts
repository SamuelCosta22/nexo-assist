import { describe, expect, it } from "vitest";
import {
  startConversation,
  requestHandoff,
  type Conversation,
} from "@/domain/conversation/conversation";
import { ConcurrencyError } from "@/application/errors";
import {
  AssumeConversation,
  CloseConversation,
  HandBackConversation,
  ListConsoleConversations,
  ListEmployeeTickets,
  SendAnalystMessage,
} from "@/application/use-cases/console";
import { ana, bia, carla, rafael, ticket } from "../support/in-memory";
import { buildHarness } from "../support/harness";

async function setup() {
  const h = buildHarness({ tickets: [ticket({ id: "INC-20311" })] });
  const now = h.clock.now();
  const waiting = requestHandoff(
    startConversation({ id: "c-ana", employeeId: ana.id, now }),
    { reason: "overdue_ticket", summary: "INC-20311 vencido", ticketId: "INC-20311" },
    now,
  );
  if (!waiting.ok) throw waiting.error;
  const n1Waiting = requestHandoff(
    startConversation({ id: "c-carla", employeeId: carla.id, now }),
    { reason: "user_request", summary: "pediu analista" },
    now,
  );
  if (!n1Waiting.ok) throw n1Waiting.error;
  await h.conversations.create(waiting.value);
  await h.conversations.create(n1Waiting.value);
  await h.conversations.create(startConversation({ id: "c-agent", employeeId: ana.id, now }));
  const deps = {
    conversations: h.conversations,
    messages: h.messages,
    ticketing: h.ticketing,
    clock: h.clock,
    ids: h.ids,
  };
  return { h, deps };
}

describe("console list", () => {
  it("separates queues and counts per filter, waiting conversations first", async () => {
    const { h } = await setup();
    const list = new ListConsoleConversations(h.conversations);
    const all = await list.execute(rafael, "all");
    expect(all.counts).toEqual({ all: 3, for_you: 2, with_agent: 1, mine: 0 });
    expect(all.items[0]?.conversation.status).toBe("awaiting_analyst");

    // N1 analyst is not offered the N2 (overdue) queue.
    const forBia = await list.execute(bia, "for_you");
    expect(forBia.items.map((i) => i.conversation.id)).toEqual(["c-carla"]);
  });

  it("searches by employee name or ticket", async () => {
    const { h } = await setup();
    const list = new ListConsoleConversations(h.conversations);
    expect((await list.execute(rafael, "all", "carla")).items).toHaveLength(1);
    expect((await list.execute(rafael, "all", "INC-20311")).items).toHaveLength(1);
  });

  it("is closed to employees", async () => {
    const { h } = await setup();
    await expect(
      new ListConsoleConversations(h.conversations).execute(ana, "all"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("assume / hand back / close", () => {
  it("assumes, announces, and tells the ticketing system an analyst is on it", async () => {
    const { h, deps } = await setup();
    const result = await new AssumeConversation(deps).execute(rafael, "c-ana");
    expect(result.ok).toBe(true);
    expect((await h.conversations.findById("c-ana"))?.assignedAnalystId).toBe(rafael.id);
    expect(h.messages.rows.at(-1)?.content).toBe("Rafael Lima assumiu · agent pausado");
    expect(h.ticketing.tickets.get("INC-20311")?.status).toBe("Em andamento");
  });

  it("lets only one analyst win a race for the same conversation", async () => {
    const { h, deps } = await setup();
    const stale = (await h.conversations.findById("c-ana")) as Conversation;
    await new AssumeConversation(deps).execute(rafael, "c-ana");
    // A second analyst working from the state they loaded earlier must lose.
    await expect(
      h.conversations.save({ ...stale, status: "with_analyst", assignedAnalystId: bia.id }, stale),
    ).rejects.toBeInstanceOf(ConcurrencyError);
  });

  it("does not let an N1 analyst take an N2 conversation", async () => {
    const { deps } = await setup();
    const result = await new AssumeConversation(deps).execute(bia, "c-ana");
    expect(result.ok).toBe(false);
  });

  it("hands back to the agent and closes, only for the owner", async () => {
    const { h, deps } = await setup();
    await new AssumeConversation(deps).execute(rafael, "c-ana");
    expect((await new HandBackConversation(deps).execute(bia, "c-ana")).ok).toBe(false);

    const back = await new HandBackConversation(deps).execute(rafael, "c-ana");
    expect(back.ok && back.value.status).toBe("agent");

    await new AssumeConversation(deps).execute(rafael, "c-ana");
    const closed = await new CloseConversation(deps).execute(rafael, "c-ana");
    expect(closed.ok && closed.value.status).toBe("closed");
    expect(h.messages.rows.at(-1)?.systemEvent).toBe("closed");
  });

  it("completes the assume even if the ticketing system is down", async () => {
    const { h, deps } = await setup();
    h.ticketing.down = true;
    expect((await new AssumeConversation(deps).execute(rafael, "c-ana")).ok).toBe(true);
  });
});

describe("analyst messages", () => {
  it("accepts messages only from the analyst who has the conversation", async () => {
    const { deps } = await setup();
    const send = new SendAnalystMessage(deps);
    expect((await send.execute(rafael, "c-ana", "Oi, Ana")).ok).toBe(false); // not assumed yet
    await new AssumeConversation(deps).execute(rafael, "c-ana");

    const ok = await send.execute(rafael, "c-ana", "Oi, Ana! Aqui é o Rafael.");
    expect(ok.ok && ok.value.authorBadge).toBe("Suporte N2");
    expect((await send.execute(bia, "c-ana", "intruso")).ok).toBe(false);
    expect((await send.execute(rafael, "c-ana", "  ")).ok).toBe(false);
  });
});

describe("employee tickets panel", () => {
  it("lists the employee's tickets, and degrades gracefully when the legacy system is down", async () => {
    const { h } = await setup();
    const panel = new ListEmployeeTickets(h.conversations, h.ticketing, h.sla, h.clock);
    const up = await panel.execute(rafael, "c-ana");
    expect(up).toMatchObject({ available: true, open: 1, closed: 0 });

    h.ticketing.down = true;
    expect(await panel.execute(rafael, "c-ana")).toMatchObject({ available: false, tickets: [] });
  });
});
