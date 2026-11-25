import type { Clock } from "../ports/clock";
import type { IdGenerator } from "../ports/id-generator";

/** Common fields of every new message. */
export function newMessageBase(ids: IdGenerator, clock: Clock, conversationId: string) {
  return { id: ids.next(), conversationId, createdAt: clock.now() };
}
