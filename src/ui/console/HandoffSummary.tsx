import { Bot, Sparkles } from "lucide-react";
import type { HandoffDto } from "../api-types";
import { HANDOFF_REASON_LABEL } from "../lib/tokens";

/** What the agent handed over: the analyst should never have to ask the employee everything again. */
export function HandoffSummary({ handoff }: { handoff: HandoffDto }) {
  return (
    <section
      aria-label="Resumo do caso"
      className="mx-auto mb-4 w-full max-w-[620px] rounded-xl border border-primary/25 bg-primary-soft px-4 py-3"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold uppercase tracking-wide text-primary-text">
        <span className="inline-flex items-center gap-1.5">
          <Sparkles className="size-3.5" /> Resumo do caso
        </span>
        <span className="rounded-full bg-paper px-2 py-0.5 normal-case tracking-normal">
          {HANDOFF_REASON_LABEL[handoff.reason] ?? handoff.reason}
        </span>
        <span className="rounded-full bg-paper px-2 py-0.5 normal-case tracking-normal">
          {handoff.targetGroup}
        </span>
        {handoff.confidence !== undefined && (
          <span className="inline-flex items-center gap-1 rounded-full bg-paper px-2 py-0.5 normal-case tracking-normal">
            <Bot className="size-3" /> confiança {Math.round(handoff.confidence * 100)}%
          </span>
        )}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink">{handoff.summary}</p>
    </section>
  );
}
