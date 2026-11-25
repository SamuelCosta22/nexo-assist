import { describe, expect, it } from "vitest";
import { startConversation } from "@/domain/conversation/conversation";
import { ana, carla, sp, ticket } from "../support/in-memory";
import { buildHarness } from "../support/harness";

async function setup(tickets = [ticket({ id: "INC-20311" })]) {
  const h = buildHarness({
    tickets: [
      ...tickets,
      ticket({ id: "INC-99999", requesterId: carla.id, title: "Carla: acesso ao SAP" }),
    ],
    articles: [
      {
        id: "a1",
        title: "VPN com erro 809",
        content: "Reinstale o cliente. Vale apenas para Windows 10.",
        tags: ["vpn"],
      },
    ],
  });
  await h.conversations.create(
    startConversation({ id: "c1", employeeId: ana.id, now: h.clock.now() }),
  );
  return { h, toolbox: h.toolboxFor(ana, "c1") };
}

const draftInput = {
  type: "INC",
  title: "VPN não conecta no notebook, erro 809",
  description: "Desde 20/10 o notebook (Windows 11) não conecta na VPN e mostra o erro 809.",
  category: "Rede e VPN",
  impact: "individual",
  urgency: "deadline_today",
};

describe("toolbox: privacy", () => {
  it("lists only the employee's own tickets", async () => {
    const { toolbox } = await setup();
    const { data } = await toolbox.listMyTickets({ onlyOpen: false, showList: true });
    expect(data.tickets.map((t) => t.id)).toEqual(["INC-20311"]);
  });

  it("answers a stranger's ticket exactly like a missing one (no existence oracle)", async () => {
    const { toolbox } = await setup();
    const stranger = await toolbox.getTicket({ ticketId: "INC-99999" });
    const missing = await toolbox.getTicket({ ticketId: "INC-00000" });
    expect(stranger.data).toEqual(missing.data);
    expect(stranger.blocks).toBeUndefined();
  });

  it("refuses to draft an update on someone else's ticket", async () => {
    const { toolbox, h } = await setup();
    const result = await toolbox.draftTicketUpdate({ ticketId: "INC-99999", information: "teste" });
    expect(result.data.status).toBe("rejected");
    expect(h.pendingActions.rows.size).toBe(0);
  });
});

describe("toolbox: consulting", () => {
  it("returns the ticket with its SLA verdict and a card", async () => {
    const { toolbox } = await setup();
    const { data, blocks, labels } = await toolbox.getTicket({ ticketId: "inc-20311" });
    if (!("ticket" in data)) throw new Error("expected ticket");
    // Média = 3 dias úteis; last update was 6 days ago => overdue.
    expect(data.ticket.overdue).toBe(true);
    expect(data.ticket.slaLabel).toBe("3 dias úteis");
    expect(blocks?.[0]?.type).toBe("ticket_card");
    expect(labels).toEqual(["consultou o INC-20311", "calculou o prazo"]);
  });

  it("finds help-center articles", async () => {
    const { toolbox } = await setup();
    const { data } = await toolbox.searchHelpCenter({ query: "VPN erro 809" });
    expect(data.articles[0]?.id).toBe("a1");
  });
});

describe("toolbox: drafting (never creates a ticket)", () => {
  it("drafts a ticket, computing priority in code, and leaves the gateway untouched", async () => {
    const { toolbox, h } = await setup();
    const { data, blocks, labels } = await toolbox.draftTicket(draftInput);
    expect(data).toMatchObject({ status: "drafted", priority: "Alta" });
    expect(blocks?.[0]?.type).toBe("pending_action");
    expect(labels).toContain("classificou a prioridade");
    expect(h.ticketing.tickets.size).toBe(2); // nothing created
  });

  it("replaces the previous draft instead of stacking pending actions", async () => {
    const { toolbox, h } = await setup();
    await toolbox.draftTicket(draftInput);
    await toolbox.draftTicket({ ...draftInput, title: "VPN continua sem conectar, erro 809" });
    const statuses = [...h.pendingActions.rows.values()].map((a) => a.status).sort();
    expect(statuses).toEqual(["pending", "superseded"]);
  });

  it("reports invalid drafts back to the model instead of throwing", async () => {
    const { toolbox } = await setup();
    const { data } = await toolbox.draftTicket({ ...draftInput, category: "Financeiro" });
    expect(data.status).toBe("invalid");
  });

  it("detects a duplicate of an open ticket and points to an update", async () => {
    const { toolbox, h } = await setup();
    const { data } = await toolbox.draftTicket({
      ...draftInput,
      title: "Notebook lento depois da atualização do Windows",
      category: "Hardware",
    });
    expect(data).toMatchObject({ status: "duplicate", ticketId: "INC-20311" });
    expect(h.pendingActions.rows.size).toBe(0);
  });
});

describe("toolbox: updates vs reopen", () => {
  it("drafts an update for an open ticket", async () => {
    const { toolbox } = await setup();
    const { data } = await toolbox.draftTicketUpdate({
      ticketId: "INC-20311",
      information: "Agora também trava ao abrir o Excel.",
    });
    expect(data).toEqual({ status: "drafted", mode: "update" });
  });

  it("drafts a reopen for a ticket resolved within 7 days", async () => {
    const { toolbox } = await setup([
      ticket({ id: "INC-20150", status: "Resolvido", resolvedAt: sp("2026-11-20T10:00:00") }),
    ]);
    const { data } = await toolbox.draftTicketUpdate({
      ticketId: "INC-20150",
      information: "O problema voltou.",
    });
    expect(data).toEqual({ status: "drafted", mode: "reopen" });
  });

  it("rejects reopening a ticket resolved more than 7 days ago", async () => {
    const { toolbox } = await setup([
      ticket({ id: "INC-20150", status: "Resolvido", resolvedAt: sp("2026-11-10T10:00:00") }),
    ]);
    const { data } = await toolbox.draftTicketUpdate({
      ticketId: "INC-20150",
      information: "Voltou.",
    });
    expect(data.status).toBe("rejected");
  });
});

describe("toolbox: handoff and resolution", () => {
  it("transfers to an analyst, pausing the agent and moving the ticket", async () => {
    const { toolbox, h } = await setup();
    const { data } = await toolbox.transferToAnalyst({
      reason: "overdue_ticket",
      summary: "INC-20311 vencido",
      ticketId: "INC-20311",
    });
    expect(data).toEqual({ status: "transferred", group: "Suporte N2" });
    expect((await h.conversations.findById("c1"))?.status).toBe("awaiting_analyst");
    expect(h.ticketing.tickets.get("INC-20311")?.assignedGroup).toBe("Suporte N2");
    expect(h.messages.rows.at(-1)?.systemEvent).toBe("handoff");
  });

  it("still transfers the conversation when the ticketing system is down", async () => {
    const { toolbox, h } = await setup();
    h.ticketing.down = true;
    const { data } = await toolbox.transferToAnalyst({
      reason: "user_request",
      summary: "pediu analista",
    });
    expect(data.status).toBe("transferred");
  });

  it("ignores a ticket id that is not the employee's when transferring", async () => {
    const { toolbox, h } = await setup();
    await toolbox.transferToAnalyst({
      reason: "user_request",
      summary: "x",
      ticketId: "INC-99999",
    });
    expect(h.ticketing.tickets.get("INC-99999")?.assignedGroup).toBeUndefined();
  });

  it("cannot transfer twice", async () => {
    const { toolbox } = await setup();
    await toolbox.transferToAnalyst({ reason: "user_request", summary: "x" });
    const again = await toolbox.transferToAnalyst({ reason: "user_request", summary: "x" });
    expect(again.data.status).toBe("not_possible");
  });

  it("marks a conversation resolved", async () => {
    const { toolbox, h } = await setup();
    const { data } = await toolbox.markConversationResolved();
    expect(data.resolved).toBe(true);
    expect((await h.conversations.findById("c1"))?.status).toBe("resolved");
  });
});
