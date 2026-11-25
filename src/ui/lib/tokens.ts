import type { Priority, TicketStatus } from "@/domain/ticketing/vocabulary";

/** Dot + text colors per ticket status, as in the prototype. */
export const STATUS_STYLE: Record<TicketStatus, { dot: string; text: string }> = {
  Novo: { dot: "bg-violet", text: "text-violet-text" },
  "Em andamento": { dot: "bg-primary", text: "text-primary-text" },
  "Aguardando analista": { dot: "bg-warning", text: "text-warning-text" },
  Aprovado: { dot: "bg-success", text: "text-success-text" },
  Resolvido: { dot: "bg-ink-3/50", text: "text-ink-3" },
};

export const PRIORITY_DOT: Record<Priority, string> = {
  Crítica: "bg-danger",
  Alta: "bg-warning",
  Média: "bg-ink-3",
  Baixa: "bg-ink-3/40",
};

export const INTENT_LABEL: Record<string, string> = {
  duvida: "Dúvida",
  consultar_chamado: "Consulta de chamado",
  abrir_chamado: "Abertura de chamado",
  atualizar_chamado: "Atualização de chamado",
  falar_com_analista: "Falar com analista",
  fora_de_escopo: "Fora do escopo de TI",
  conversa: "Conversa",
};

export const HANDOFF_REASON_LABEL: Record<string, string> = {
  user_request: "Pedido do funcionário",
  critical_ticket: "Caso crítico",
  overdue_ticket: "Chamado vencido",
  low_confidence: "Agent sem segurança",
};

export const IMPACT_OPTIONS = [
  { value: "individual", label: "Somente você" },
  { value: "team", label: "Sua equipe" },
  { value: "company", label: "Toda a empresa" },
] as const;
