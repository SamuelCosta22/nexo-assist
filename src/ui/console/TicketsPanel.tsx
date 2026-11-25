import { ArrowRightLeft, X } from "lucide-react";
import type { TicketSnapshot } from "@/domain/conversation/message";
import type { ConversationViewDto, EmployeeTicketsDto } from "../api-types";
import { formatDayMonth, formatTime } from "../lib/format";
import { STATUS_STYLE } from "../lib/tokens";
import { PriorityLabel, StatusLabel } from "../chat/TicketCard";

const firstName = (name: string) => name.split(" ")[0] ?? name;

function OtherTicket({ ticket }: { ticket: TicketSnapshot }) {
  const style = STATUS_STYLE[ticket.status];
  return (
    <li className="flex items-start gap-3 border-b border-rule/60 py-3 last:border-b-0">
      <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${style.dot}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-ink">{ticket.title}</p>
        <p className="mt-0.5 text-[11px] text-ink-3">
          <span className="font-mono">{ticket.id}</span> ·{" "}
          {ticket.status === "Resolvido"
            ? `Resolvido em ${formatDayMonth(ticket.lastUpdateAt)}`
            : ticket.status}
          {ticket.overdue && <span className="font-medium text-danger-text"> · vencido</span>}
        </p>
      </div>
    </li>
  );
}

/** "Chamados da Ana": the employee's tickets next to the conversation. */
export function TicketsPanel({
  view,
  tickets,
  onClose,
}: {
  view: ConversationViewDto;
  tickets: EmployeeTicketsDto | undefined;
  onClose?: () => void;
}) {
  const handoff = view.conversation.handoff;
  const current = handoff?.ticketId
    ? tickets?.tickets.find((t) => t.id === handoff.ticketId)
    : undefined;
  const others = (tickets?.tickets ?? []).filter((t) => t.id !== current?.id);
  const analyst = view.analyst;

  return (
    <aside
      aria-label={`Chamados de ${firstName(view.employee.name)}`}
      className="flex h-full w-full flex-col bg-paper"
    >
      <header className="flex items-start justify-between border-b border-rule px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-ink">
            Chamados da {firstName(view.employee.name)}
          </h2>
          <p className="text-xs text-ink-3">
            {tickets ? `${tickets.open} abertos · ${tickets.closed} encerrados` : "Carregando…"}
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar painel"
            className="rounded-md p-1.5 text-ink-3 hover:bg-desk"
          >
            <X className="size-4" />
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {tickets && !tickets.available && (
          <p
            role="alert"
            className="mb-4 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning-text"
          >
            O sistema de chamados está indisponível agora. A conversa continua funcionando; os
            chamados voltam a aparecer assim que o sistema responder.
          </p>
        )}

        {current && (
          <section className="mb-6">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
              Desta conversa
            </h3>
            <div className="rounded-xl border border-rule bg-desk p-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono text-ink-3">{current.id}</span>
                <StatusLabel status={current.status} />
              </div>
              <p className="mt-2 text-sm font-semibold text-ink">{current.title}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
                <span>
                  {current.subcategory
                    ? `${current.category} › ${current.subcategory}`
                    : current.category}
                </span>
                <PriorityLabel priority={current.priority} />
                {current.overdue && (
                  <span className="font-medium text-danger-text">prazo vencido</span>
                )}
              </div>
              <p className="mt-3 flex items-center gap-2 border-t border-rule pt-3 text-xs text-ink-3">
                <ArrowRightLeft className="size-3.5" />
                {analyst
                  ? `Assumido por ${analyst.name}`
                  : `Transferido para um analista${handoff ? ` · ${formatTime(handoff.requestedAt)}` : ""}`}
              </p>
            </div>
          </section>
        )}

        <section>
          <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
            {current ? "Outros chamados" : "Chamados"}
          </h3>
          {others.length === 0 ? (
            <p className="py-3 text-sm text-ink-3">
              {tickets?.available === false ? "—" : "Nenhum outro chamado."}
            </p>
          ) : (
            <ul>
              {others.map((ticket) => (
                <OtherTicket key={ticket.id} ticket={ticket} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </aside>
  );
}
