import type { PendingAction } from "@/domain/conversation/pending-action";
import type { SlaPolicy } from "@/domain/ticketing/sla-policy";

/** A pending action plus what the card needs to render it. */
export interface PendingActionView {
  readonly action: PendingAction;
  /** First-response deadline for a draft, computed from when it was drafted. */
  readonly firstResponseDueAt?: Date;
}

export function toPendingActionView(action: PendingAction, sla: SlaPolicy): PendingActionView {
  if (action.payload.kind === "create_ticket") {
    return {
      action,
      firstResponseDueAt: sla.deadline(action.payload.draft.priority, action.createdAt),
    };
  }
  return { action };
}
