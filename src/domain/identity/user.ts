import type { SupportGroup } from "../ticketing/vocabulary";

export type Role = "employee" | "analyst";

export interface User {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: Role;
  readonly department?: string;
  /** Only for analysts: N1 handles N1 queues, N2 handles both. */
  readonly supportLevel?: SupportGroup;
}

/** An N2 analyst covers N1 work too; an N1 analyst never covers N2. */
export function analystCovers(level: SupportGroup | undefined, group: SupportGroup): boolean {
  if (!level) return false;
  return level === "Suporte N2" || level === group;
}
