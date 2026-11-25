/**
 * Ubiquitous language of the service desk (Anexo A of the PRD).
 * Values are Portuguese on purpose: they are what users and analysts read.
 */
export const TICKET_TYPES = ["INC", "REQ"] as const;
/** INC: algo parou ou não funciona. REQ: pedido de acesso, equipamento ou software. */
export type TicketType = (typeof TICKET_TYPES)[number];

export const CATEGORIES = [
  "Acesso",
  "Rede e VPN",
  "Hardware",
  "Software",
  "E-mail",
  "Outros",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const PRIORITIES = ["Crítica", "Alta", "Média", "Baixa"] as const;
export type Priority = (typeof PRIORITIES)[number];

/** Quantas pessoas são afetadas. "Não sei" é tratado como o caso individual. */
export const IMPACTS = ["individual", "team", "company", "unknown"] as const;
export type Impact = (typeof IMPACTS)[number];

/**
 * Quão urgente é para quem pediu:
 * - blocking: não consegue trabalhar / algo parado
 * - deadline_today: há um compromisso no mesmo dia em risco
 * - workaround: atrapalha, mas existe alternativa
 * - none: pedido ou melhoria sem urgência
 */
export const URGENCIES = ["blocking", "deadline_today", "workaround", "none"] as const;
export type Urgency = (typeof URGENCIES)[number];

export const TICKET_STATUSES = [
  "Novo",
  "Em andamento",
  "Aguardando analista",
  "Aprovado",
  "Resolvido",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const SUPPORT_GROUPS = ["Suporte N1", "Suporte N2"] as const;
export type SupportGroup = (typeof SUPPORT_GROUPS)[number];

export const IMPACT_LABELS: Record<Impact, string> = {
  individual: "Somente você",
  team: "Sua equipe",
  company: "Toda a empresa",
  unknown: "Somente você",
};
