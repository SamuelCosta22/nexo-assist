import { describe, expect, it } from "vitest";
import type { User } from "../identity/user";
import { createTicketDraft } from "../ticketing/ticket-draft";
import {
  assumeConversation,
  canAgentReply,
  closeConversation,
  handBackToAgent,
  markResolvedByAgent,
  registerEmployeeMessage,
  requestHandoff,
  startConversation,
  targetGroupFor,
  titleFromMessage,
  type Conversation,
} from "./conversation";
import {
  cancelAction,
  confirmAction,
  editDraft,
  supersedeAction,
  type PendingAction,
} from "./pending-action";

const now = new Date("2026-11-24T10:00:00-03:00");
const later = new Date("2026-11-24T10:05:00-03:00");
const rafael: User = {
  id: "an1",
  name: "Rafael Lima",
  email: "r@nexo",
  role: "analyst",
  supportLevel: "Suporte N2",
};
const n1Analyst: User = {
  id: "an2",
  name: "Bia",
  email: "b@nexo",
  role: "analyst",
  supportLevel: "Suporte N1",
};

const fresh = (): Conversation => startConversation({ id: "c1", employeeId: "u1", now });
const unwrap = <T, E>(r: { ok: true; value: T } | { ok: false; error: E }): T => {
  if (!r.ok) throw r.error;
  return r.value;
};

describe("registerEmployeeMessage", () => {
  it("titles the conversation from the first message and counts messages", () => {
    const c = unwrap(registerEmployeeMessage(fresh(), "Meu notebook não conecta na VPN", 30, now));
    expect(c.title).toBe("Meu notebook não conecta na VPN");
    expect(c.employeeMessageCount).toBe(1);
    expect(unwrap(registerEmployeeMessage(c, "outra", 30, now)).title).toBe(c.title);
  });

  it("blocks the employee once the agent-metered limit is reached", () => {
    const full: Conversation = { ...fresh(), employeeMessageCount: 30 };
    const result = registerEmployeeMessage(full, "mais uma", 30, now);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("MESSAGE_LIMIT_REACHED");
  });

  it("does not block messages for an analyst even at the limit", () => {
    const full: Conversation = {
      ...fresh(),
      status: "with_analyst",
      assignedAnalystId: "an1",
      employeeMessageCount: 30,
    };
    expect(registerEmployeeMessage(full, "obrigado", 30, now).ok).toBe(true);
  });

  it("brings the agent back when the employee writes in a finished conversation", () => {
    const closed: Conversation = {
      ...fresh(),
      status: "closed",
      assignedAnalystId: "an1",
      employeeMessageCount: 2,
    };
    const reopened = unwrap(registerEmployeeMessage(closed, "voltou o problema", 30, now));
    expect(reopened.status).toBe("agent");
    expect(reopened.assignedAnalystId).toBeUndefined();
  });

  it("truncates long titles", () => {
    expect(titleFromMessage("a".repeat(200))).toHaveLength(60);
  });
});

describe("handoff flow", () => {
  const request = {
    reason: "user_request" as const,
    summary: "INC-20311 parado há 5 dias",
    ticketId: "INC-20311",
  };

  it("pauses the agent when transferred", () => {
    const c = unwrap(requestHandoff(fresh(), request, now));
    expect(c.status).toBe("awaiting_analyst");
    expect(canAgentReply(c)).toBe(false);
    expect(c.handoff?.summary).toContain("INC-20311");
  });

  it("routes critical and overdue cases to N2, the rest to N1", () => {
    expect(targetGroupFor("critical_ticket")).toBe("Suporte N2");
    expect(targetGroupFor("overdue_ticket")).toBe("Suporte N2");
    expect(targetGroupFor("user_request")).toBe("Suporte N1");
    expect(targetGroupFor("low_confidence")).toBe("Suporte N1");
  });

  it("cannot transfer twice", () => {
    const c = unwrap(requestHandoff(fresh(), request, now));
    expect(requestHandoff(c, request, later).ok).toBe(false);
  });

  it("lets an analyst assume, hand back and close, only the owner", () => {
    const waiting = unwrap(requestHandoff(fresh(), request, now));
    const mine = unwrap(assumeConversation(waiting, rafael, later));
    expect(mine.status).toBe("with_analyst");
    expect(assumeConversation(mine, n1Analyst, later).ok).toBe(false);
    expect(handBackToAgent(mine, "an2", later).ok).toBe(false);
    expect(closeConversation(mine, "an2", later).ok).toBe(false);

    const back = unwrap(handBackToAgent(mine, "an1", later));
    expect(back.status).toBe("agent");
    expect(back.handoff).toBeUndefined();
    expect(unwrap(closeConversation(mine, "an1", later)).status).toBe("closed");
  });

  it("keeps N2 queues away from N1 analysts", () => {
    const waiting = unwrap(requestHandoff(fresh(), { ...request, reason: "overdue_ticket" }, now));
    const result = assumeConversation(waiting, n1Analyst, later);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_AUTHORIZED");
  });

  it("only analysts can assume", () => {
    const employee: User = { id: "u1", name: "Ana", email: "a@nexo", role: "employee" };
    expect(assumeConversation(fresh(), employee, now).ok).toBe(false);
  });
});

describe("markResolvedByAgent", () => {
  it("resolves only while the agent owns the conversation", () => {
    expect(unwrap(markResolvedByAgent(fresh(), now)).status).toBe("resolved");
    expect(markResolvedByAgent({ ...fresh(), status: "with_analyst" }, now).ok).toBe(false);
  });
});

describe("PendingAction", () => {
  const draft = unwrap(
    createTicketDraft({
      type: "INC",
      title: "VPN não conecta no notebook, erro 809",
      description: "Desde 20/10 o notebook (Windows 11) não conecta na VPN.",
      category: "Rede e VPN",
      impact: "individual",
      urgency: "deadline_today",
    }),
  );
  const action: PendingAction = {
    id: "p1",
    conversationId: "c1",
    employeeId: "u1",
    payload: { kind: "create_ticket", draft },
    status: "pending",
    createdAt: now,
  };

  it("is confirmed once, then immutable", () => {
    const confirmed = unwrap(confirmAction(action, "INC-1", later));
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.resultTicketId).toBe("INC-1");
    expect(confirmAction(confirmed, "INC-2", later).ok).toBe(false);
    expect(cancelAction(confirmed, later).ok).toBe(false);
  });

  it("is superseded only while pending", () => {
    expect(supersedeAction(action, later).status).toBe("superseded");
    const cancelled = unwrap(cancelAction(action, later));
    expect(supersedeAction(cancelled, later).status).toBe("cancelled");
  });

  it("recomputes priority when the employee edits who is affected", () => {
    const edited = unwrap(
      editDraft(action, { impact: "team", title: "VPN fora para toda a equipe, erro 809" }),
    );
    if (edited.payload.kind !== "create_ticket") throw new Error("unexpected");
    expect(edited.payload.draft.impact).toBe("team");
    expect(edited.payload.draft.priority).toBe("Alta");
    expect(edited.payload.draft.title).toContain("equipe");
  });

  it("rejects edits that make the draft invalid or target other action kinds", () => {
    expect(editDraft(action, { title: "x" }).ok).toBe(false);
    const update: PendingAction = {
      ...action,
      payload: { kind: "update_ticket", ticketId: "INC-1", note: "mais info" },
    };
    expect(editDraft(update, { title: "novo título aqui" }).ok).toBe(false);
  });
});
