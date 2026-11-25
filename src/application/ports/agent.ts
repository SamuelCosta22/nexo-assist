import type { AgentTrace, TraceAction } from "@/domain/agent/trace";
import type { Conversation } from "@/domain/conversation/conversation";
import type { Message, MessageBlock } from "@/domain/conversation/message";
import type { PendingAction } from "@/domain/conversation/pending-action";
import type { User } from "@/domain/identity/user";
import type { AgentToolbox } from "./agent-toolbox";

export interface AgentTurn {
  readonly employee: User;
  readonly conversation: Conversation;
  /** Recent history, oldest first, already including the new employee message. */
  readonly history: readonly Message[];
  readonly pendingAction?: PendingAction;
  readonly now: Date;
  /** The only way the agent can touch the world; bound to this employee. */
  readonly toolbox: AgentToolbox;
}

export type AgentEvent =
  | { readonly type: "step"; readonly action: TraceAction }
  | { readonly type: "text_delta"; readonly text: string }
  | {
      readonly type: "done";
      readonly text: string;
      readonly blocks: readonly MessageBlock[];
      readonly trace: AgentTrace;
    };

/** Port to the LLM agent (Mastra today). Streams steps and text, ends with `done`. */
export interface AgentPort {
  respond(turn: AgentTurn, signal?: AbortSignal): AsyncIterable<AgentEvent>;
}
