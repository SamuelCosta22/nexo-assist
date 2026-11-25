"use client";

import { Check, CornerDownLeft, X } from "lucide-react";
import { useState } from "react";
import {
  CATEGORIES,
  IMPACT_LABELS,
  type Category,
  type Impact,
} from "@/domain/ticketing/vocabulary";
import type { PendingActionDto } from "../api-types";
import { formatDeadline } from "../lib/format";
import { IMPACT_OPTIONS } from "../lib/tokens";
import { PriorityLabel } from "./TicketCard";

export interface DraftEditsInput {
  title: string;
  description: string;
  category: Category;
  impact: Impact;
}

interface Props {
  action: PendingActionDto;
  /** Analysts see drafts but cannot confirm them: only the employee can. */
  readOnly?: boolean;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onEdit: (edits: DraftEditsInput) => Promise<void>;
}

const inputClass =
  "w-full rounded-md border border-rule bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-cta focus:ring-2 focus:ring-cta/15";

/** Short, stable draft number ("D-381") derived from the id; purely a display label. */
export function draftLabel(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `D-${(hash % 900) + 100}`;
}

function StatusBadge({ status }: { status: PendingActionDto["status"] }) {
  const map = {
    pending: { text: "Aguardando confirmação", style: "text-warning-text", dot: "bg-warning" },
    confirmed: { text: "Confirmado", style: "text-success-text", dot: "bg-success" },
    cancelled: { text: "Cancelado", style: "text-ink-3", dot: "bg-ink-3/50" },
    superseded: {
      text: "Substituído por um rascunho novo",
      style: "text-ink-3",
      dot: "bg-ink-3/50",
    },
  } as const;
  const { text, style, dot } = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${style}`}>
      <span className={`size-1.5 rounded-full ${dot}`} />
      {text}
    </span>
  );
}

/**
 * The draft awaiting confirmation (PRD: "o agent mostra um rascunho e só cria
 * ou atualiza o chamado depois da confirmação do funcionário").
 */
export function PendingActionCard({ action, readOnly, busy, onConfirm, onCancel, onEdit }: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | undefined>();
  const { payload } = action;
  const pending = action.status === "pending";

  if (payload.kind !== "create_ticket") {
    const reopen = payload.kind === "reopen_ticket";
    return (
      <article className="overflow-hidden rounded-xl border border-rule bg-paper shadow-sm">
        <div className="px-5 pt-4">
          <header className="flex items-center justify-between gap-3 text-xs">
            <span className="text-ink-3">
              {reopen ? "Reabertura" : "Atualização"} ·{" "}
              <span className="font-mono">{payload.ticketId}</span>
            </span>
            <StatusBadge status={action.status} />
          </header>
          <p className="mt-2.5 text-[11px] text-ink-3">Informação que será adicionada ao chamado</p>
          <p className="mt-1 pb-4 text-sm leading-relaxed text-ink">{payload.note}</p>
        </div>
        <ActionFooter
          action={action}
          readOnly={readOnly}
          busy={busy}
          onConfirm={onConfirm}
          onCancel={onCancel}
          confirmLabel={reopen ? "Reabrir chamado" : "Confirmar"}
        />
      </article>
    );
  }

  const { draft } = payload;

  async function save(form: FormData) {
    setSaving(true);
    setFormError(undefined);
    try {
      await onEdit({
        title: String(form.get("title") ?? ""),
        description: String(form.get("description") ?? ""),
        category: String(form.get("category")) as Category,
        impact: String(form.get("impact")) as Impact,
      });
      setEditing(false);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="overflow-hidden rounded-xl border border-rule bg-paper shadow-sm">
      <div className="px-5 pt-4">
        <header className="flex items-center justify-between gap-3 text-xs">
          <span className="text-ink-3">
            Novo chamado · <span className="font-mono">Rascunho {draftLabel(action.id)}</span>
          </span>
          <StatusBadge status={action.status} />
        </header>

        {editing ? (
          <form className="mt-3 space-y-3 pb-4" action={save}>
            <label className="block text-xs text-ink-3">
              Título
              <input name="title" defaultValue={draft.title} className={`${inputClass} mt-1`} />
            </label>
            <label className="block text-xs text-ink-3">
              Descrição
              <textarea
                name="description"
                defaultValue={draft.description}
                rows={3}
                className={`${inputClass} mt-1`}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs text-ink-3">
                Categoria
                <select
                  name="category"
                  defaultValue={draft.category}
                  className={`${inputClass} mt-1`}
                >
                  {CATEGORIES.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-ink-3">
                Afetados
                <select
                  name="impact"
                  defaultValue={draft.impact === "unknown" ? "individual" : draft.impact}
                  className={`${inputClass} mt-1`}
                >
                  {IMPACT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="text-[11px] text-ink-3">
              A prioridade é recalculada a partir de quem é afetado.
            </p>
            {formError && (
              <p
                role="alert"
                className="rounded-md bg-danger-soft px-3 py-2 text-xs text-danger-text"
              >
                {formError}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="h-9 rounded-md bg-cta px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? "Salvando…" : "Salvar"}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="h-9 rounded-md px-3 text-sm text-ink-2 hover:bg-desk"
              >
                Voltar
              </button>
            </div>
          </form>
        ) : (
          <>
            <h3 className="mt-2.5 text-base font-semibold leading-snug text-ink">{draft.title}</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{draft.description}</p>
            <dl className="mt-4 grid grid-cols-1 gap-3 border-t border-rule py-4 sm:grid-cols-3">
              <div>
                <dt className="text-[11px] text-ink-3">Categoria</dt>
                <dd className="mt-1 text-sm text-ink">
                  {draft.subcategory ? `${draft.category} › ${draft.subcategory}` : draft.category}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-ink-3">Prioridade</dt>
                <dd className="mt-1">
                  <PriorityLabel
                    priority={draft.priority}
                    suffix={
                      action.firstResponseDueAt
                        ? `resposta até ${formatDeadline(action.firstResponseDueAt)}`
                        : draft.slaLabel
                    }
                  />
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-ink-3">Afetados</dt>
                <dd className="mt-1 text-sm text-ink">{IMPACT_LABELS[draft.impact]}</dd>
              </div>
            </dl>
          </>
        )}
      </div>
      {!editing && (
        <ActionFooter
          action={action}
          readOnly={readOnly}
          busy={busy}
          onConfirm={onConfirm}
          onCancel={onCancel}
          onEdit={pending ? () => setEditing(true) : undefined}
          confirmLabel="Confirmar"
        />
      )}
    </article>
  );
}

function ActionFooter({
  action,
  readOnly,
  busy,
  onConfirm,
  onCancel,
  onEdit,
  confirmLabel,
}: {
  action: PendingActionDto;
  readOnly?: boolean | undefined;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onEdit?: (() => void) | undefined;
  confirmLabel: string;
}) {
  if (action.status === "confirmed") {
    return (
      <footer className="flex items-center gap-2 border-t border-rule bg-success-soft px-5 py-3 text-sm text-success-text">
        <Check className="size-4" />
        Confirmado
        {action.resultTicketId ? (
          <>
            {" "}
            · <span className="font-mono">{action.resultTicketId}</span>
          </>
        ) : null}
      </footer>
    );
  }
  if (action.status !== "pending") {
    return (
      <footer className="flex items-center gap-2 border-t border-rule bg-desk px-5 py-3 text-sm text-ink-3">
        <X className="size-4" />
        {action.status === "cancelled" ? "Rascunho cancelado" : "Este rascunho foi substituído"}
      </footer>
    );
  }
  if (readOnly) {
    return (
      <footer className="border-t border-rule bg-desk px-5 py-3 text-sm text-ink-3">
        Aguardando a confirmação do funcionário
      </footer>
    );
  }
  return (
    <footer className="flex flex-wrap items-center gap-2 border-t border-rule bg-desk px-5 py-3">
      <button
        type="button"
        onClick={onConfirm}
        disabled={busy}
        className="inline-flex h-9 items-center gap-2 rounded-md bg-cta px-4 text-sm font-semibold text-white transition hover:bg-cta/90 disabled:opacity-60"
      >
        {busy ? "Confirmando…" : confirmLabel}
        {!busy && (
          <kbd className="inline-flex items-center gap-0.5 rounded bg-white/20 px-1 py-0.5 text-[10px] font-medium">
            ⌘<CornerDownLeft className="size-2.5" />
          </kbd>
        )}
      </button>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          disabled={busy}
          className="h-9 rounded-md border border-rule bg-paper px-4 text-sm font-medium text-ink hover:bg-desk disabled:opacity-60"
        >
          Editar
        </button>
      )}
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="h-9 rounded-md px-3 text-sm text-ink-2 hover:bg-paper disabled:opacity-60"
      >
        Cancelar
      </button>
    </footer>
  );
}
