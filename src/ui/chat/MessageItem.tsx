"use client";

import { RefreshCcw, UserCheck } from "lucide-react";
import { useState } from "react";
import type { MessageBlock, TicketSummary } from "@/domain/conversation/message";
import type { AgentTrace, MessageDto, PendingActionDto } from "../api-types";
import { RichText } from "../components/RichText";
import { formatDayMonth, formatTime } from "../lib/format";
import { TraceChips } from "../trace/TraceChips";
import { PendingActionCard, type DraftEditsInput } from "./PendingActionCard";
import { StatusLabel, TicketCard } from "./TicketCard";

export interface ChatActions {
  sendText: (text: string) => void;
  confirm: (actionId: string) => void;
  cancel: (actionId: string) => void;
  edit: (actionId: string, edits: DraftEditsInput) => Promise<void>;
  openTrace: (trace: AgentTrace) => void;
  /** Action currently being confirmed (shows a spinner and blocks double clicks). */
  busyActionId?: string | undefined;
}

interface Props {
  message: MessageDto;
  pendingActions: Record<string, PendingActionDto>;
  /** Only the latest agent message is interactive (quick replies, selection). */
  isLast: boolean;
  readOnly: boolean;
  actions: ChatActions;
  /** The analyst console reuses the blocks but can only look at drafts. */
  viewer?: "employee" | "analyst";
}

function OptionsBlock({
  block,
  interactive,
  onPick,
}: {
  block: Extract<MessageBlock, { type: "options" }>;
  interactive: boolean;
  onPick: (text: string) => void;
}) {
  const [picked, setPicked] = useState<string | undefined>();
  return (
    <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={block.question}>
      {block.options.map((option) => (
        <button
          key={option}
          type="button"
          disabled={!interactive || picked !== undefined}
          onClick={() => {
            setPicked(option);
            onPick(option);
          }}
          className="rounded-md border border-rule bg-paper px-3 py-1.5 text-[13px] text-ink transition hover:border-cta hover:bg-primary-soft disabled:cursor-default disabled:opacity-60 disabled:hover:border-rule disabled:hover:bg-paper"
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function TicketListBlock({
  items,
  interactive,
  onPick,
}: {
  items: readonly TicketSummary[];
  interactive: boolean;
  onPick: (text: string) => void;
}) {
  const [selected, setSelected] = useState<string | undefined>();
  return (
    <ul
      className="mt-2 overflow-hidden rounded-xl border border-rule bg-paper shadow-sm"
      role="radiogroup"
      aria-label="Seus chamados"
    >
      {items.map((item) => {
        const active = selected === item.id;
        return (
          <li key={item.id} className="border-b border-rule last:border-b-0">
            <button
              type="button"
              role="radio"
              aria-checked={active}
              disabled={!interactive || selected !== undefined}
              onClick={() => {
                setSelected(item.id);
                onPick(`${item.id} · ${item.title}`);
              }}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition disabled:cursor-default ${
                active ? "bg-primary-soft" : "hover:bg-desk disabled:hover:bg-paper"
              }`}
            >
              <span
                className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${
                  active ? "border-cta bg-cta" : "border-ink-3/40 bg-paper"
                }`}
              >
                {active && <span className="size-1.5 rounded-full bg-white" />}
              </span>
              <span className="w-24 shrink-0 font-mono text-xs text-ink-3">{item.id}</span>
              <span className="min-w-0 flex-1 truncate text-ink">{item.title}</span>
              <StatusLabel status={item.status} />
              <span className="w-12 shrink-0 text-right text-xs text-ink-3">
                {formatDayMonth(item.lastUpdateAt)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function AgentBlocks({ message, pendingActions, isLast, readOnly, actions, viewer }: Props) {
  const interactive = isLast && !readOnly;
  return (
    <div className="space-y-3">
      {message.blocks.map((block, index) => {
        switch (block.type) {
          case "ticket_list":
            return (
              <TicketListBlock
                key={index}
                items={block.items}
                interactive={interactive}
                onPick={actions.sendText}
              />
            );
          case "ticket_card":
            return <TicketCard key={index} ticket={block.ticket} />;
          case "pending_action": {
            const action = pendingActions[block.actionId];
            return action ? (
              <PendingActionCard
                key={index}
                action={action}
                readOnly={viewer === "analyst"}
                busy={actions.busyActionId === action.id}
                onConfirm={() => actions.confirm(action.id)}
                onCancel={() => actions.cancel(action.id)}
                onEdit={(edits) => actions.edit(action.id, edits)}
              />
            ) : null;
          }
          case "options":
            return null; // rendered inside the text bubble
        }
      })}
    </div>
  );
}

export function MessageItem(props: Props) {
  const { message, actions } = props;
  const time = formatTime(message.createdAt);

  if (message.role === "system") {
    return (
      <div className="flex items-center gap-3 py-1 text-[11px] text-ink-3" role="status">
        <span className="h-px flex-1 bg-rule" />
        <span className="inline-flex items-center gap-1.5">
          <RefreshCcw className="size-3" />
          {message.content} · {time}
        </span>
        <span className="h-px flex-1 bg-rule" />
      </div>
    );
  }

  if (message.role === "employee") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-xl bg-ink px-4 py-2.5 text-sm leading-relaxed text-white">
          {message.content}
        </p>
      </div>
    );
  }

  if (message.role === "analyst") {
    return (
      <div className="flex max-w-[85%] flex-col gap-1">
        <div className="flex items-center gap-2 text-[11px] text-ink-3">
          <UserCheck className="size-3.5 text-success-text" />
          <span className="font-semibold text-ink">{message.authorName}</span>
          {message.authorBadge && (
            <span className="rounded bg-success-soft px-1.5 py-0.5 font-medium text-success-text">
              {message.authorBadge}
            </span>
          )}
          <span>{time}</span>
        </div>
        <p className="whitespace-pre-wrap break-words rounded-xl border border-success/30 bg-success-soft px-4 py-2.5 text-sm leading-relaxed text-ink">
          {message.content}
        </p>
      </div>
    );
  }

  const trace = message.trace;
  const options = message.blocks.find((block) => block.type === "options");
  const interactive = props.isLast && !props.readOnly;
  return (
    <div className="flex max-w-[92%] flex-col gap-1.5">
      <TraceChips
        actions={trace?.actions ?? []}
        trace={trace}
        onOpen={trace ? () => actions.openTrace(trace) : undefined}
      />
      <div className="rounded-xl border border-rule bg-paper px-4 py-3 text-sm leading-relaxed text-ink shadow-sm">
        <RichText text={message.content} />
        {options?.type === "options" && (
          <OptionsBlock block={options} interactive={interactive} onPick={actions.sendText} />
        )}
      </div>
      <AgentBlocks {...props} />
    </div>
  );
}
