import { randomUUID } from "node:crypto";
import { SlaPolicy } from "@/domain/ticketing/sla-policy";
import type { AgentToolboxFactory } from "@/application/ports/agent-toolbox";
import type { Clock } from "@/application/ports/clock";
import type { IdGenerator } from "@/application/ports/id-generator";
import type { TicketingGateway } from "@/application/ports/ticketing-gateway";
import {
  DefaultAgentToolbox,
  type ToolboxDependencies,
} from "@/application/support/default-agent-toolbox";
import { HandoffService } from "@/application/support/handoff-service";
import { AuthenticateUser } from "@/application/use-cases/authenticate-user";
import {
  AssumeConversation,
  CloseConversation,
  HandBackConversation,
  ListConsoleConversations,
  ListEmployeeTickets,
  SendAnalystMessage,
} from "@/application/use-cases/console";
import {
  GetConversation,
  ListMyConversations,
  StartConversation,
} from "@/application/use-cases/conversations";
import {
  CancelPendingAction,
  ConfirmPendingAction,
  EditPendingAction,
  type PendingActionDependencies,
} from "@/application/use-cases/pending-actions";
import { SendEmployeeMessage } from "@/application/use-cases/send-employee-message";
import { MastraAgentAdapter } from "./agent/mastra-agent";
import { getEnv } from "./config/env";
import { createDatabase } from "./persistence/database";
import { DrizzleConversationRepository } from "./persistence/repositories/conversation-repository";
import { DrizzleHelpdeskRepository } from "./persistence/repositories/helpdesk-repository";
import { DrizzleMessageRepository } from "./persistence/repositories/message-repository";
import { DrizzlePendingActionRepository } from "./persistence/repositories/pending-action-repository";
import { DrizzleUserRepository } from "./persistence/repositories/user-repository";
import { DrizzleTicketingGateway } from "./ticketing/drizzle-ticketing-gateway";
import { FlakyTicketingGateway } from "./ticketing/flaky-ticketing-gateway";
import { RetryingTicketingGateway } from "./ticketing/retrying-ticketing-gateway";

const systemClock: Clock = { now: () => new Date() };
const uuidGenerator: IdGenerator = { next: () => randomUUID() };

/**
 * Composition root: the only place that knows every concrete class. Everything
 * else depends on ports. Built lazily and cached per server process.
 */
function build() {
  const env = getEnv();
  const db = createDatabase(env.DATABASE_URL);
  const clock = systemClock;
  const ids = uuidGenerator;
  const sla = new SlaPolicy();

  const users = new DrizzleUserRepository(db);
  const helpdesk = new DrizzleHelpdeskRepository(db);
  const conversations = new DrizzleConversationRepository(db);
  const messages = new DrizzleMessageRepository(db);
  const pendingActions = new DrizzlePendingActionRepository(db);

  // Legacy ticketing: real service -> optional simulated outages -> retries.
  const ticketing: TicketingGateway = new RetryingTicketingGateway(
    new FlakyTicketingGateway(
      new DrizzleTicketingGateway(db, clock, ids),
      env.TICKETING_FAILURE_RATE,
    ),
    { retries: 2, delayMs: 150 },
  );

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
  const toolboxFor: AgentToolboxFactory = (employee, conversationId) =>
    new DefaultAgentToolbox(toolboxDeps, employee, conversationId);

  const agent = new MastraAgentAdapter({
    model: `google/${env.LLM_MODEL}`,
    modelName: env.LLM_MODEL,
    ids,
  });

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
  const consoleDeps = { conversations, messages, ticketing, clock, ids };

  return {
    env,
    users,
    authenticate: new AuthenticateUser(users),
    startConversation: new StartConversation(conversations, clock, ids),
    listMyConversations: new ListMyConversations(conversations),
    getConversation: new GetConversation(conversations, messages, pendingActions, users, sla),
    sendEmployeeMessage: new SendEmployeeMessage({
      conversations,
      messages,
      pendingActions,
      agent,
      toolboxFor,
      handoff,
      clock,
      ids,
      messageLimit: env.CHAT_MESSAGE_LIMIT,
    }),
    confirmPendingAction: new ConfirmPendingAction(pendingDeps),
    cancelPendingAction: new CancelPendingAction(pendingDeps),
    editPendingAction: new EditPendingAction(pendingDeps),
    listConsoleConversations: new ListConsoleConversations(conversations),
    listEmployeeTickets: new ListEmployeeTickets(conversations, ticketing, sla, clock),
    assumeConversation: new AssumeConversation(consoleDeps),
    handBackConversation: new HandBackConversation(consoleDeps),
    closeConversation: new CloseConversation(consoleDeps),
    sendAnalystMessage: new SendAnalystMessage(consoleDeps),
  };
}

export type Container = ReturnType<typeof build>;

// Survives hot reloads in `next dev` so connections and clients are not rebuilt on every edit.
const globalForContainer = globalThis as unknown as { __nexoContainer?: Container };

export function getContainer(): Container {
  globalForContainer.__nexoContainer ??= build();
  return globalForContainer.__nexoContainer;
}
