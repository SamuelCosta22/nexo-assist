import { BusinessCalendar } from "./business-calendar";
import type { Priority, TicketStatus } from "./vocabulary";

/**
 * SLA table from Anexo A. Critical tickets have 24h on-call coverage, so their
 * hour is wall-clock time; everything else counts working time only.
 */
type SlaTarget =
  | { readonly kind: "elapsed_hours"; readonly amount: number; readonly label: string }
  | { readonly kind: "business_hours"; readonly amount: number; readonly label: string }
  | { readonly kind: "business_days"; readonly amount: number; readonly label: string };

export const SLA_TARGETS: Readonly<Record<Priority, SlaTarget>> = {
  Crítica: { kind: "elapsed_hours", amount: 1, label: "1 hora" },
  Alta: { kind: "business_hours", amount: 4, label: "4 horas úteis" },
  Média: { kind: "business_days", amount: 3, label: "3 dias úteis" },
  Baixa: { kind: "business_days", amount: 5, label: "5 dias úteis" },
};

export interface SlaSubject {
  readonly priority: Priority;
  readonly status: TicketStatus;
  readonly slaAnchorAt: Date;
}

export interface SlaEvaluation {
  readonly targetLabel: string;
  readonly dueAt: Date;
  readonly overdue: boolean;
}

export class SlaPolicy {
  constructor(private readonly calendar: BusinessCalendar = new BusinessCalendar()) {}

  label(priority: Priority): string {
    return SLA_TARGETS[priority].label;
  }

  /** Deadline for the next response, counted from `from`. */
  deadline(priority: Priority, from: Date): Date {
    const target = SLA_TARGETS[priority];
    switch (target.kind) {
      case "elapsed_hours":
        return new Date(from.getTime() + target.amount * 3_600_000);
      case "business_hours":
        return this.calendar.addBusinessHours(from, target.amount);
      case "business_days":
        return this.calendar.addBusinessDays(from, target.amount);
    }
  }

  /**
   * The deadline applies to the first response and to every later update, so
   * it is always measured from the anchor (creation or last analyst response).
   */
  evaluate(subject: SlaSubject, now: Date): SlaEvaluation {
    const dueAt = this.deadline(subject.priority, subject.slaAnchorAt);
    return {
      targetLabel: this.label(subject.priority),
      dueAt,
      overdue: subject.status !== "Resolvido" && now.getTime() > dueAt.getTime(),
    };
  }
}
