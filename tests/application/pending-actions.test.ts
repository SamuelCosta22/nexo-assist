import { describe, expect, it } from "vitest";
import { startConversation } from "@/domain/conversation/conversation";
import { createTicketDraft } from "@/domain/ticketing/ticket-draft";
import { TicketingUnavailableError } from "@/application/errors";
import {
  CancelPendingAction,
  ConfirmPendingAction,
  EditPendingAction,
} from "@/application/use-cases/pending-actions";
import { ana, carla, sp, ticket } from "../support/in-memory";
import { buildHarness } from "../support/harness";

async function setup(tickets = [] as ReturnType<typeof ticket>[]) {
  const h = buildHarness({ tickets });
  await h.conversations.create(
    startConversation({ id: "c1", employeeId: ana.id, now: h.clock.now() }),
  );
  return h;
}

const input = {
  type: "INC",
  title: "VPN não conecta no notebook, erro 809",
  description: "Desde 20/10 o notebook (Windows 11) não conecta na VPN e mostra o erro 809.",
  category: "Rede e VPN",
  impact: "individual",
  urgency: "deadline_today",
};

async function draft(h: Awaited<ReturnType<typeof setup>>, overrides: Partial<typeof input> = {}) {
  await h.toolboxFor(ana, "c1").draftTicket({ ...input, ...overrides });
  const action = [...h.pendingActions.rows.values()].find((a) => a.status === "pending");
  if (!action) throw new Error("no pending action");
  return action;
}

describe("ConfirmPendingAction", () => {
  it("creates the ticket only on confirmation and answers with a card and a trace", async () => {
    const h = await setup();
    const action = await draft(h);
    expect(h.ticketing.tickets.size).toBe(0);

    const result = await new ConfirmPendingAction(h.pendingDeps).execute(ana, action.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.ticket.priority).toBe("Alta");
    expect(h.ticketing.tickets.size).toBe(1);
    expect(result.value.action.status).toBe("confirmed");
    const reply = result.value.messages[0];
    expect(reply?.content).toContain("Alta");
    expect(reply?.blocks[0]?.type).toBe("ticket_card");
    expect(reply?.trace?.actions[0]?.tool).toBe("criar_chamado");
  });

  it("cannot be confirmed twice", async () => {
    const h = await setup();
    const action = await draft(h);
    const confirm = new ConfirmPendingAction(h.pendingDeps);
    await confirm.execute(ana, action.id);
    const second = await confirm.execute(ana, action.id);
    expect(second.ok).toBe(false);
    expect(h.ticketing.tickets.size).toBe(1);
  });

  it("refuses another employee's draft", async () => {
    const h = await setup();
    const action = await draft(h);
    await expect(
      new ConfirmPendingAction(h.pendingDeps).execute(carla, action.id),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("updates the existing open ticket if a duplicate slipped past the model", async () => {
    const h = await setup([ticket({ id: "INC-20311" })]);
    // Craft a draft that bypassed the tool's duplicate check.
    const built = createTicketDraft({
      ...input,
      title: "Notebook lento depois da atualização do Windows",
      category: "Hardware",
    });
    if (!built.ok) throw built.error;
    await h.pendingActions.save({
      id: "p-dup",
      conversationId: "c1",
      employeeId: ana.id,
      status: "pending",
      createdAt: h.clock.now(),
      payload: { kind: "create_ticket", draft: built.value },
    });
    const result = await new ConfirmPendingAction(h.pendingDeps).execute(ana, "p-dup");
    expect(result.ok && result.value.ticket.id).toBe("INC-20311");
    expect(h.ticketing.tickets.size).toBe(1);
    expect(h.ticketing.tickets.get("INC-20311")?.updates).toHaveLength(1);
  });

  it("hands a critical ticket to Suporte N2 right away", async () => {
    const h = await setup();
    const action = await draft(h, {
      impact: "company",
      urgency: "blocking",
      title: "Sem acesso à internet em todo o escritório",
      category: "Rede e VPN",
      description: "Toda a empresa está sem internet desde as 9h, nenhum computador navega.",
    });
    const result = await new ConfirmPendingAction(h.pendingDeps).execute(ana, action.id);
    expect(result.ok && result.value.ticket.priority).toBe("Crítica");
    const conversation = await h.conversations.findById("c1");
    expect(conversation?.status).toBe("awaiting_analyst");
    expect(conversation?.handoff?.reason).toBe("critical_ticket");
    expect(conversation?.handoff?.targetGroup).toBe("Suporte N2");
  });

  it("keeps the draft pending when the ticketing system is down, so it can be retried", async () => {
    const h = await setup();
    const action = await draft(h);
    h.ticketing.down = true;
    await expect(
      new ConfirmPendingAction(h.pendingDeps).execute(ana, action.id),
    ).rejects.toBeInstanceOf(TicketingUnavailableError);
    expect((await h.pendingActions.findById(action.id))?.status).toBe("pending");

    h.ticketing.down = false;
    const retry = await new ConfirmPendingAction(h.pendingDeps).execute(ana, action.id);
    expect(retry.ok).toBe(true);
  });

  it("reopens a recently resolved ticket on confirmation", async () => {
    const h = await setup([
      ticket({
        id: "INC-20150",
        status: "Resolvido",
        resolvedAt: sp("2026-11-20T10:00:00"),
        title: "Senha do SAP bloqueada",
        category: "Acesso",
      }),
    ]);
    await h
      .toolboxFor(ana, "c1")
      .draftTicketUpdate({ ticketId: "INC-20150", information: "Bloqueou de novo hoje cedo." });
    const action = [...h.pendingActions.rows.values()][0]!;
    const result = await new ConfirmPendingAction(h.pendingDeps).execute(ana, action.id);
    expect(result.ok && result.value.ticket.status).toBe("Em andamento");
    expect(h.ticketing.tickets.size).toBe(1);
  });
});

describe("CancelPendingAction / EditPendingAction", () => {
  it("cancels without creating anything", async () => {
    const h = await setup();
    const action = await draft(h);
    const result = await new CancelPendingAction(h.pendingDeps).execute(ana, action.id);
    expect(result.ok).toBe(true);
    expect(h.ticketing.tickets.size).toBe(0);
    expect(h.messages.rows.at(-1)?.content).toContain("cancelei");
  });

  it("edits the draft and recomputes the priority from the new impact", async () => {
    const h = await setup();
    const action = await draft(h, { urgency: "blocking" });
    const edited = await new EditPendingAction(h.pendingDeps).execute(ana, action.id, {
      impact: "team",
    });
    expect(edited.ok).toBe(true);
    const stored = await h.pendingActions.findById(action.id);
    expect(stored?.payload.kind === "create_ticket" && stored.payload.draft.priority).toBe(
      "Crítica",
    );
  });
});
