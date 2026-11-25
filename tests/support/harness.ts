import { SlaPolicy } from "@/domain/ticketing/sla-policy";
import type { Ticket } from "@/domain/ticketing/ticket";
import type { AgentPort } from "@/application/ports/agent";
import {
  DefaultAgentToolbox,
  type ToolboxDependencies,
} from "@/application/support/default-agent-toolbox";
import { HandoffService } from "@/application/support/handoff-service";
import type { PendingActionDependencies } from "@/application/use-cases/pending-actions";
import { SendEmployeeMessage } from "@/application/use-cases/send-employee-message";
import {
  FixedClock,
  InMemoryConversations,
  InMemoryHelpdesk,
  InMemoryMessages,
  InMemoryPendingActions,
  InMemoryTicketing,
  InMemoryUsers,
  SequentialIds,
  ana,
  bia,
  carla,
  rafael,
  sp,
} from "./in-memory";
import type { Article } from "@/domain/helpdesk/article";

/** Wires the application layer against in-memory adapters. */
export function buildHarness(
  options: { tickets?: Ticket[]; articles?: Article[]; agent?: AgentPort } = {},
) {
  const clock = new FixedClock(sp("2026-11-24T09:43:00"));
  const ids = new SequentialIds();
  const users = new InMemoryUsers([ana, carla, rafael, bia]);
  const conversations = new InMemoryConversations(users);
  const messages = new InMemoryMessages();
  const pendingActions = new InMemoryPendingActions();
  const ticketing = new InMemoryTicketing(clock, options.tickets ?? []);
  const helpdesk = new InMemoryHelpdesk(options.articles ?? []);
  const sla = new SlaPolicy();
  const handoff = new HandoffService(conversations, messages, ticketing, clock, ids);

  const toolboxDeps: ToolboxDependencies = {
    ticketing,
    helpdesk,
    conversations,
    messages,
    pendingActions,
    handoff,
    sla,
    clock,
    ids,
  };
  const toolboxFor = (employee: typeof ana, conversationId: string) =>
    new DefaultAgentToolbox(toolboxDeps, employee, conversationId);
  const pendingDeps: PendingActionDependencies = {
    pendingActions,
    conversations,
    messages,
    ticketing,
    handoff,
    sla,
    clock,
    ids,
  };

  const send = options.agent
    ? new SendEmployeeMessage({
        conversations,
        messages,
        pendingActions,
        agent: options.agent,
        toolboxFor,
        handoff,
        clock,
        ids,
        messageLimit: 30,
      })
    : undefined;

  return {
    clock,
    ids,
    users,
    conversations,
    messages,
    pendingActions,
    ticketing,
    helpdesk,
    sla,
    handoff,
    toolboxFor,
    pendingDeps,
    send,
  };
}
