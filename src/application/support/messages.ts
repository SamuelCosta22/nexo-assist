import type { Message, MessageBlock, SystemEventKind } from "@/domain/conversation/message";
import type { AgentTrace } from "@/domain/agent/trace";
import type { User } from "@/domain/identity/user";

interface Base {
  id: string;
  conversationId: string;
  createdAt: Date;
}

export const employeeMessage = (base: Base, author: User, content: string): Message => ({
  ...base,
  role: "employee",
  authorId: author.id,
  authorName: author.name,
  content,
  blocks: [],
});

export const agentMessage = (
  base: Base,
  content: string,
  blocks: readonly MessageBlock[] = [],
  trace?: AgentTrace,
): Message => ({
  ...base,
  role: "agent",
  authorName: "Nexo Assist",
  content,
  blocks,
  ...(trace ? { trace } : {}),
});

export const analystMessage = (base: Base, analyst: User, content: string): Message => ({
  ...base,
  role: "analyst",
  authorId: analyst.id,
  authorName: analyst.name,
  ...(analyst.supportLevel ? { authorBadge: analyst.supportLevel } : {}),
  content,
  blocks: [],
});

export const systemMessage = (base: Base, event: SystemEventKind, content: string): Message => ({
  ...base,
  role: "system",
  systemEvent: event,
  content,
  blocks: [],
});
