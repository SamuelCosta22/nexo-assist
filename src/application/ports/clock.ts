/**
 * Port: source of "now".
 *
 * SLA deadlines, "overdue" checks and the 7-day reopen window all depend on the
 * current time. Injecting it keeps that logic deterministic and testable.
 */
export interface Clock {
  now(): Date;
}
