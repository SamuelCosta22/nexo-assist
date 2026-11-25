import { Check, Info, TriangleAlert } from "lucide-react";
import type { AgentTrace, TraceAction } from "../api-types";

/**
 * The summary the prototype shows above each reply ("consultou seus chamados ·
 * buscou na central de ajuda"). Clicking opens the full detail panel.
 */
export function TraceChips({
  actions,
  trace,
  onOpen,
}: {
  actions: readonly TraceAction[];
  trace?: AgentTrace | undefined;
  onOpen?: (() => void) | undefined;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-3">
      <span className="font-semibold text-ink">Nexo Assist</span>
      {actions.flatMap((action) =>
        action.labels.map((label, index) => (
          <span
            key={`${action.id}-${index}`}
            className={`inline-flex items-center gap-1 ${action.status === "error" ? "text-danger-text" : ""}`}
          >
            {action.status === "error" ? (
              <TriangleAlert className="size-3" />
            ) : (
              <Check className="size-3" />
            )}
            {label}
          </span>
        )),
      )}
      {trace && onOpen && (
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex items-center gap-1 rounded px-1 font-medium text-cta hover:bg-primary-soft"
        >
          <Info className="size-3" />
          ver detalhes
        </button>
      )}
    </div>
  );
}
