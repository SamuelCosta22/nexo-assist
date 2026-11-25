"use client";

import { ChevronDown, Gauge, ShieldCheck, TriangleAlert, X } from "lucide-react";
import type { ReactNode } from "react";
import type { AgentTrace, TraceAction } from "../api-types";
import { INTENT_LABEL } from "../lib/tokens";

const percent = (value: number) => Math.round(value * 100);

function confidenceTone(confidence: number) {
  if (confidence < 0.5) return { bar: "bg-danger", text: "text-danger-text", label: "Baixa" };
  if (confidence < 0.75) return { bar: "bg-warning", text: "text-warning-text", label: "Média" };
  return { bar: "bg-success", text: "text-success-text", label: "Alta" };
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-rule px-5 py-4 last:border-b-0">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">{title}</h3>
      {children}
    </section>
  );
}

const pretty = (value: unknown) => JSON.stringify(value, null, 2);

function ActionItem({ action, index }: { action: TraceAction; index: number }) {
  const failed = action.status === "error";
  return (
    <li className="rounded-lg border border-rule">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-start gap-3 px-3 py-2.5">
          <span
            className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
              failed ? "bg-danger-soft text-danger-text" : "bg-primary-soft text-primary-text"
            }`}
          >
            {index + 1}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm text-ink">{action.labels.join(" · ")}</span>
            <span className="mt-0.5 block font-mono text-[11px] text-ink-3">
              {action.tool} · {action.durationMs} ms
              {failed && action.error ? ` · ${action.error}` : ""}
            </span>
          </span>
          <ChevronDown className="mt-1 size-4 text-ink-3 transition group-open:rotate-180" />
        </summary>
        <div className="space-y-2 border-t border-rule bg-desk px-3 py-3">
          <div>
            <p className="mb-1 text-[11px] font-medium text-ink-3">Entrada</p>
            <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-ink-2">
              {pretty(action.input)}
            </pre>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-medium text-ink-3">Resultado</p>
            <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-ink-2">
              {pretty(action.output)}
            </pre>
          </div>
        </div>
      </details>
    </li>
  );
}

/**
 * Full answer to "what did the agent understand, what did it do and why?".
 * Shared by the employee chat and the analyst console.
 */
export function TracePanel({ trace, onClose }: { trace: AgentTrace; onClose: () => void }) {
  const { decision, actions, metrics } = trace;
  const tone = confidenceTone(decision.confidence);

  return (
    <aside
      aria-label="Detalhes da decisão do assistente"
      className="flex h-full w-full flex-col overflow-hidden bg-paper"
    >
      <header className="flex items-center justify-between border-b border-rule px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-ink">Como o assistente decidiu</h2>
          <p className="text-xs text-ink-3">Registro desta resposta</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar detalhes"
          className="rounded-md p-1.5 text-ink-3 hover:bg-desk hover:text-ink"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        {!trace.decisionReported && (
          <div className="m-5 flex gap-2 rounded-lg bg-warning-soft px-3 py-2.5 text-xs text-warning-text">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />O modelo não registrou o
            entendimento desta resposta. Os valores abaixo são padrões.
          </div>
        )}

        <Section title="O que entendeu">
          <p className="text-sm leading-relaxed text-ink">{decision.understanding}</p>
          <span className="mt-2 inline-block rounded-full bg-primary-soft px-2.5 py-0.5 text-[11px] font-medium text-primary-text">
            {INTENT_LABEL[decision.intent] ?? decision.intent}
          </span>
        </Section>

        <Section title="Confiança">
          <div className="flex items-center gap-3">
            <div
              className="h-2 flex-1 overflow-hidden rounded-full bg-desk"
              role="meter"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent(decision.confidence)}
              aria-label="Confiança do assistente"
            >
              <div
                className={`h-full rounded-full ${tone.bar}`}
                style={{ width: `${percent(decision.confidence)}%` }}
              />
            </div>
            <span className={`text-sm font-semibold ${tone.text}`}>
              {percent(decision.confidence)}% · {tone.label}
            </span>
          </div>
          <p className="mt-2 text-[11px] text-ink-3">
            Autoavaliação do modelo. Abaixo de 50% a conversa é transferida a um analista.
          </p>
        </Section>

        <Section title="Por que agiu assim">
          <p className="text-sm leading-relaxed text-ink-2">{decision.rationale}</p>
        </Section>

        {decision.rulesApplied.length > 0 && (
          <Section title="Regras aplicadas">
            <ul className="space-y-1.5">
              {decision.rulesApplied.map((rule) => (
                <li key={rule} className="flex gap-2 text-sm text-ink-2">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success-text" />
                  {rule}
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title={`Ações (${actions.length})`}>
          {actions.length === 0 ? (
            <p className="text-sm text-ink-3">
              Nenhuma ferramenta foi necessária: respondeu direto.
            </p>
          ) : (
            <ol className="space-y-2">
              {actions.map((action, index) => (
                <ActionItem key={action.id} action={action} index={index} />
              ))}
            </ol>
          )}
        </Section>

        <Section title="Métricas">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <dt className="text-[11px] text-ink-3">Modelo</dt>
              <dd className="font-mono text-[12px] text-ink">{metrics.model}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-[11px] text-ink-3">
                <Gauge className="size-3" /> Latência
              </dt>
              <dd className="text-ink">{(metrics.latencyMs / 1000).toFixed(1)} s</dd>
            </div>
            {metrics.inputTokens !== undefined && (
              <div>
                <dt className="text-[11px] text-ink-3">Tokens de entrada</dt>
                <dd className="text-ink">{metrics.inputTokens}</dd>
              </div>
            )}
            {metrics.outputTokens !== undefined && (
              <div>
                <dt className="text-[11px] text-ink-3">Tokens de saída</dt>
                <dd className="text-ink">{metrics.outputTokens}</dd>
              </div>
            )}
          </dl>
        </Section>
      </div>
    </aside>
  );
}
