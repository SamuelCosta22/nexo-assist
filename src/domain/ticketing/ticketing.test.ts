import { describe, expect, it } from "vitest";
import { BusinessCalendar } from "./business-calendar";
import { decideOnExistingTicket, findLikelyDuplicate } from "./duplicate-policy";
import { decidePriority } from "./priority-policy";
import { SlaPolicy } from "./sla-policy";
import { slaAnchor, type Ticket } from "./ticket";
import { createTicketDraft } from "./ticket-draft";

/** Builds a Date from São Paulo wall-clock time (UTC-3). */
const sp = (iso: string) => new Date(`${iso}-03:00`);
const calendar = new BusinessCalendar();

describe("BusinessCalendar", () => {
  it("adds business hours inside the same day (PRD screen: 09:43 + 4h = 13:43)", () => {
    expect(calendar.addBusinessHours(sp("2026-11-24T09:43:00"), 4)).toEqual(
      sp("2026-11-24T13:43:00"),
    );
  });

  it("rolls over to the next business morning after closing time", () => {
    // Tue 16:00 + 4h => 2h left today, 2h tomorrow => Wed 10:00
    expect(calendar.addBusinessHours(sp("2026-11-24T16:00:00"), 4)).toEqual(
      sp("2026-11-25T10:00:00"),
    );
  });

  it("skips weekends when counting hours", () => {
    // Fri 17:00 + 2h => 1h Friday, 1h Monday => Mon 09:00
    expect(calendar.addBusinessHours(sp("2026-11-27T17:00:00"), 2)).toEqual(
      sp("2026-11-30T09:00:00"),
    );
  });

  it("starts counting at opening time when the request arrives off-hours", () => {
    // Sat 11:00 + 1h => Mon 09:00
    expect(calendar.addBusinessHours(sp("2026-11-28T11:00:00"), 1)).toEqual(
      sp("2026-11-30T09:00:00"),
    );
    // Tue 07:00 + 1h => Tue 09:00
    expect(calendar.addBusinessHours(sp("2026-11-24T07:00:00"), 1)).toEqual(
      sp("2026-11-24T09:00:00"),
    );
  });

  it("adds business days keeping the time of day and skipping weekends", () => {
    // Thu 14:20 + 3 dias úteis => Tue 14:20
    expect(calendar.addBusinessDays(sp("2026-10-16T14:20:00"), 3)).toEqual(
      sp("2026-10-21T14:20:00"),
    );
  });

  it("knows whether an instant is inside business hours", () => {
    expect(calendar.isWithinBusinessHours(sp("2026-11-24T10:00:00"))).toBe(true);
    expect(calendar.isWithinBusinessHours(sp("2026-11-24T18:00:00"))).toBe(false);
    expect(calendar.isWithinBusinessHours(sp("2026-11-28T10:00:00"))).toBe(false);
  });
});

describe("SlaPolicy", () => {
  const sla = new SlaPolicy();

  it("gives Crítica one wall-clock hour (24h on-call), even at night", () => {
    expect(sla.deadline("Crítica", sp("2026-11-24T22:30:00"))).toEqual(sp("2026-11-24T23:30:00"));
  });

  it("gives Média three business days and Baixa five", () => {
    expect(sla.deadline("Média", sp("2026-11-24T10:00:00"))).toEqual(sp("2026-11-27T10:00:00"));
    expect(sla.deadline("Baixa", sp("2026-11-24T10:00:00"))).toEqual(sp("2026-12-01T10:00:00"));
  });

  it("flags a ticket as overdue once the deadline has passed", () => {
    const subject = {
      priority: "Média" as const,
      status: "Aguardando analista" as const,
      slaAnchorAt: sp("2026-10-16T14:20:00"),
    };
    expect(sla.evaluate(subject, sp("2026-10-21T14:19:00")).overdue).toBe(false);
    expect(sla.evaluate(subject, sp("2026-10-21T14:21:00")).overdue).toBe(true);
  });

  it("never marks resolved tickets as overdue", () => {
    const subject = {
      priority: "Alta" as const,
      status: "Resolvido" as const,
      slaAnchorAt: sp("2026-01-01T10:00:00"),
    };
    expect(sla.evaluate(subject, sp("2026-11-24T10:00:00")).overdue).toBe(false);
  });
});

describe("decidePriority", () => {
  it("is Alta for one blocked person and for a same-day commitment (PRD screen 2)", () => {
    expect(decidePriority("individual", "blocking").priority).toBe("Alta");
    expect(decidePriority("individual", "deadline_today").priority).toBe("Alta");
  });

  it("is Crítica when a team or the company is stopped", () => {
    expect(decidePriority("team", "blocking").priority).toBe("Crítica");
    expect(decidePriority("company", "blocking").priority).toBe("Crítica");
  });

  it("is Média with a workaround and Baixa for requests without urgency", () => {
    expect(decidePriority("individual", "workaround").priority).toBe("Média");
    expect(decidePriority("individual", "none").priority).toBe("Baixa");
  });

  it("treats unknown impact as individual and explains the reason", () => {
    const decision = decidePriority("unknown", "blocking");
    expect(decision.priority).toBe("Alta");
    expect(decision.rationale).toContain("desconhecido");
  });
});

const baseTicket: Ticket = {
  id: "INC-1",
  type: "INC",
  title: "Notebook lento após atualização do Windows",
  description: "Lentidão geral desde a atualização",
  category: "Hardware",
  priority: "Média",
  status: "Aguardando analista",
  impact: "individual",
  requesterId: "u1",
  createdAt: sp("2026-10-16T14:20:00"),
  updatedAt: sp("2026-10-18T10:00:00"),
  updates: [],
};

describe("slaAnchor", () => {
  it("is the creation date until an analyst answers", () => {
    expect(slaAnchor(baseTicket)).toEqual(baseTicket.createdAt);
  });

  it("moves with analyst responses but not with requester comments", () => {
    const ticket: Ticket = {
      ...baseTicket,
      updates: [
        {
          id: "a",
          authorKind: "analyst",
          authorName: "Rafael",
          kind: "comment",
          note: "x",
          createdAt: sp("2026-10-17T09:00:00"),
        },
        {
          id: "b",
          authorKind: "requester",
          authorName: "Ana",
          kind: "comment",
          note: "y",
          createdAt: sp("2026-10-20T09:00:00"),
        },
      ],
    };
    expect(slaAnchor(ticket)).toEqual(sp("2026-10-17T09:00:00"));
  });
});

describe("decideOnExistingTicket", () => {
  const now = sp("2026-11-24T10:00:00");

  it("updates an open ticket instead of duplicating it", () => {
    expect(decideOnExistingTicket(baseTicket, now)).toBe("update");
  });

  it("reopens a ticket resolved up to 7 days ago", () => {
    const resolved: Ticket = {
      ...baseTicket,
      status: "Resolvido",
      resolvedAt: sp("2026-11-20T10:00:00"),
    };
    expect(decideOnExistingTicket(resolved, now)).toBe("reopen");
  });

  it("creates a new ticket when the resolved one is older than 7 days", () => {
    const resolved: Ticket = {
      ...baseTicket,
      status: "Resolvido",
      resolvedAt: sp("2026-11-10T10:00:00"),
    };
    expect(decideOnExistingTicket(resolved, now)).toBe("create_new");
  });
});

describe("findLikelyDuplicate", () => {
  const now = sp("2026-11-24T10:00:00");

  it("catches an open ticket about the same problem in the same category", () => {
    const found = findLikelyDuplicate(
      { title: "Notebook lento depois da atualização do Windows", category: "Hardware" },
      [baseTicket],
      now,
    );
    expect(found?.id).toBe("INC-1");
  });

  it("ignores other categories and unrelated problems", () => {
    expect(
      findLikelyDuplicate(
        { title: "Notebook lento após atualização", category: "Software" },
        [baseTicket],
        now,
      ),
    ).toBeUndefined();
    expect(
      findLikelyDuplicate({ title: "VPN com erro 809", category: "Hardware" }, [baseTicket], now),
    ).toBeUndefined();
  });
});

describe("createTicketDraft", () => {
  const valid = {
    type: "INC",
    title: "VPN não conecta no notebook, erro 809",
    description: "Desde 20/10 o notebook (Windows 11) não conecta na VPN.",
    category: "Rede e VPN",
    impact: "individual",
    urgency: "deadline_today",
  };

  it("computes priority and SLA label from impact x urgency", () => {
    const result = createTicketDraft(valid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.priority).toBe("Alta");
      expect(result.value.slaLabel).toBe("4 horas úteis");
    }
  });

  it("lists every problem when the draft is incomplete", () => {
    const result = createTicketDraft({
      ...valid,
      title: "x",
      category: "Financeiro",
      description: "curta",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_DRAFT");
      expect(result.error.problems).toHaveLength(3);
    }
  });
});
