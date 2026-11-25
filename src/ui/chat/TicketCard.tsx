import type { TicketSnapshot } from "@/domain/conversation/message";
import { formatAgo, formatDayMonthTime } from "../lib/format";
import { PRIORITY_DOT, STATUS_STYLE } from "../lib/tokens";

export function StatusLabel({ status }: { status: TicketSnapshot["status"] }) {
  const style = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${style.text}`}>
      <span className={`size-1.5 rounded-full ${style.dot}`} />
      {status}
    </span>
  );
}

export function PriorityLabel({
  priority,
  suffix,
}: {
  priority: TicketSnapshot["priority"];
  suffix?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-ink">
      <span className={`size-1.5 rounded-full ${PRIORITY_DOT[priority]}`} />
      {priority}
      {suffix && <span className="text-ink-3">· {suffix}</span>}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-ink-3">{label}</dt>
      <dd className="mt-1 text-sm text-ink">{children}</dd>
    </div>
  );
}

/** Ticket card shown in the chat when the employee asks about a ticket. */
export function TicketCard({ ticket }: { ticket: TicketSnapshot }) {
  const category = ticket.subcategory
    ? `${ticket.category} › ${ticket.subcategory}`
    : ticket.category;
  return (
    <article className="overflow-hidden rounded-xl border border-rule bg-paper shadow-sm">
      <div className="px-5 pt-4">
        <header className="flex items-center justify-between gap-3 text-xs">
          <span className="text-ink-3">
            Chamado · <span className="font-mono">{ticket.id}</span>
          </span>
          <StatusLabel status={ticket.status} />
        </header>
        <h3 className="mt-2.5 text-base font-semibold leading-snug text-ink">{ticket.title}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{ticket.description}</p>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-rule px-5 py-4 sm:grid-cols-4">
        <Field label="Categoria">{category}</Field>
        <Field label="Prioridade">
          <PriorityLabel priority={ticket.priority} />
        </Field>
        <Field label="Aberto em">{formatDayMonthTime(ticket.createdAt)}</Field>
        <Field label="Última atualização">
          <span className={ticket.overdue ? "font-medium text-danger-text" : undefined}>
            {formatAgo(ticket.lastUpdateAt)}
          </span>
          {ticket.overdue && <span className="text-danger-text"> · prazo vencido</span>}
        </Field>
      </dl>
    </article>
  );
}
