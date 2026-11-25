import type { Conversation } from "@/domain/conversation/conversation";
import type { Message } from "@/domain/conversation/message";
import type { PendingAction } from "@/domain/conversation/pending-action";
import type { Article } from "@/domain/helpdesk/article";
import type { User } from "@/domain/identity/user";
import type { Ticket } from "@/domain/ticketing/ticket";
import type { TicketDraft } from "@/domain/ticketing/ticket-draft";
import { ConcurrencyError, TicketingUnavailableError } from "@/application/errors";
import type { Clock } from "@/application/ports/clock";
import type { IdGenerator } from "@/application/ports/id-generator";
import type {
  ConversationFilter,
  ConversationRepository,
  ConversationSummary,
  HelpdeskRepository,
  MessageRepository,
  PendingActionRepository,
  UserRepository,
} from "@/application/ports/repositories";
import type { TicketingGateway } from "@/application/ports/ticketing-gateway";

/** Wall-clock time in São Paulo (UTC-3). */
export const sp = (iso: string) => new Date(`${iso}-03:00`);

export class FixedClock implements Clock {
  constructor(private current: Date) {}
  now() {
    return this.current;
  }
  advance(ms: number) {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export class SequentialIds implements IdGenerator {
  private n = 0;
  next() {
    this.n += 1;
    return `id-${this.n}`;
  }
}

export class InMemoryUsers implements UserRepository {
  constructor(private readonly users: User[]) {}
  async findById(id: string) {
    return this.users.find((u) => u.id === id);
  }
  async findByEmail(email: string) {
    return this.users.find((u) => u.email === email);
  }
  async findManyByIds(ids: readonly string[]) {
    return this.users.filter((u) => ids.includes(u.id));
  }
}

export class InMemoryHelpdesk implements HelpdeskRepository {
  constructor(private readonly articles: Article[] = []) {}
  async listArticles() {
    return this.articles;
  }
}

export class InMemoryConversations implements ConversationRepository {
  readonly rows = new Map<string, Conversation>();
  constructor(private readonly users: UserRepository) {}
  async create(conversation: Conversation) {
    this.rows.set(conversation.id, conversation);
  }
  async findById(id: string) {
    return this.rows.get(id);
  }
  async save(next: Conversation, previous: Conversation) {
    const stored = this.rows.get(previous.id);
    if (
      !stored ||
      stored.status !== previous.status ||
      stored.updatedAt.getTime() !== previous.updatedAt.getTime()
    ) {
      throw new ConcurrencyError();
    }
    this.rows.set(next.id, next);
  }
  async listSummaries(filter: ConversationFilter): Promise<ConversationSummary[]> {
    const out: ConversationSummary[] = [];
    for (const conversation of this.rows.values()) {
      if (filter.employeeId && conversation.employeeId !== filter.employeeId) continue;
      const employee = await this.users.findById(conversation.employeeId);
      if (employee) out.push({ conversation, employee });
    }
    return out;
  }
}

export class InMemoryMessages implements MessageRepository {
  readonly rows: Message[] = [];
  async append(message: Message) {
    this.rows.push(message);
  }
  async list(conversationId: string) {
    return this.rows.filter((m) => m.conversationId === conversationId);
  }
  async listRecent(conversationId: string, limit: number) {
    return (await this.list(conversationId)).slice(-limit);
  }
}

export class InMemoryPendingActions implements PendingActionRepository {
  readonly rows = new Map<string, PendingAction>();
  async save(action: PendingAction) {
    this.rows.set(action.id, action);
  }
  async findById(id: string) {
    return this.rows.get(id);
  }
  async findPendingByConversation(conversationId: string) {
    return [...this.rows.values()].find(
      (a) => a.conversationId === conversationId && a.status === "pending",
    );
  }
  async findManyByIds(ids: readonly string[]) {
    return ids.flatMap((id) => {
      const action = this.rows.get(id);
      return action ? [action] : [];
    });
  }
}

/** Ticketing fake: behaves like the legacy system, with an off switch. */
export class InMemoryTicketing implements TicketingGateway {
  readonly tickets = new Map<string, Ticket>();
  down = false;
  private seq = 20500;
  constructor(
    private readonly clock: Clock,
    tickets: Ticket[] = [],
  ) {
    for (const ticket of tickets) this.tickets.set(ticket.id, ticket);
  }

  private guard() {
    if (this.down) throw new TicketingUnavailableError();
  }
  private put(ticket: Ticket) {
    this.tickets.set(ticket.id, ticket);
    return ticket;
  }
  private get(id: string): Ticket {
    const ticket = this.tickets.get(id);
    if (!ticket) throw new Error(`ticket ${id} not found`);
    return ticket;
  }

  async listByRequester(requesterId: string) {
    this.guard();
    return [...this.tickets.values()].filter((t) => t.requesterId === requesterId);
  }
  async findById(ticketId: string) {
    this.guard();
    return this.tickets.get(ticketId);
  }
  async create(input: { requesterId: string; requesterName: string; draft: TicketDraft }) {
    this.guard();
    const now = this.clock.now();
    this.seq += 1;
    const { draft } = input;
    return this.put({
      id: `${draft.type}-${this.seq}`,
      type: draft.type,
      title: draft.title,
      description: draft.description,
      category: draft.category,
      ...(draft.subcategory ? { subcategory: draft.subcategory } : {}),
      priority: draft.priority,
      status: "Novo",
      impact: draft.impact,
      requesterId: input.requesterId,
      createdAt: now,
      updatedAt: now,
      updates: [],
    });
  }
  async addRequesterUpdate(ticketId: string, input: { authorName: string; note: string }) {
    this.guard();
    const ticket = this.get(ticketId);
    const now = this.clock.now();
    return this.put({
      ...ticket,
      updatedAt: now,
      updates: [
        ...ticket.updates,
        {
          id: `u${ticket.updates.length}`,
          authorKind: "requester",
          authorName: input.authorName,
          kind: "comment",
          note: input.note,
          createdAt: now,
        },
      ],
    });
  }
  async addAnalystUpdate(
    ticketId: string,
    input: { authorName: string; note: string; status?: Ticket["status"] },
  ) {
    this.guard();
    const ticket = this.get(ticketId);
    const now = this.clock.now();
    return this.put({
      ...ticket,
      status: input.status ?? ticket.status,
      updatedAt: now,
      updates: [
        ...ticket.updates,
        {
          id: `u${ticket.updates.length}`,
          authorKind: "analyst",
          authorName: input.authorName,
          kind: "comment",
          note: input.note,
          createdAt: now,
        },
      ],
    });
  }
  async reopen(ticketId: string, input: { authorName: string; note: string }) {
    this.guard();
    const ticket = this.get(ticketId);
    const now = this.clock.now();
    return this.put({
      ...ticket,
      resolvedAt: undefined,
      status: "Em andamento",
      updatedAt: now,
      updates: [
        ...ticket.updates,
        {
          id: `u${ticket.updates.length}`,
          authorKind: "requester",
          authorName: input.authorName,
          kind: "reopened",
          note: input.note,
          createdAt: now,
        },
      ],
    });
  }
  async transfer(
    ticketId: string,
    input: { group: Ticket["assignedGroup"] & string; reason: string },
  ) {
    this.guard();
    const ticket = this.get(ticketId);
    return this.put({
      ...ticket,
      assignedGroup: input.group,
      status: "Aguardando analista",
      updatedAt: this.clock.now(),
    });
  }
}

export const ana: User = {
  id: "u-ana",
  name: "Ana Souza",
  email: "ana.souza@nexo.com.br",
  role: "employee",
  department: "Financeiro",
};
export const carla: User = {
  id: "u-carla",
  name: "Carla Mendes",
  email: "carla.mendes@nexo.com.br",
  role: "employee",
};
export const rafael: User = {
  id: "an-rafael",
  name: "Rafael Lima",
  email: "rafael.lima@nexo.com.br",
  role: "analyst",
  supportLevel: "Suporte N2",
};
export const bia: User = {
  id: "an-bia",
  name: "Bia Rocha",
  email: "bia.rocha@nexo.com.br",
  role: "analyst",
  supportLevel: "Suporte N1",
};

export function ticket(overrides: Partial<Ticket> & Pick<Ticket, "id">): Ticket {
  return {
    type: "INC",
    title: "Notebook lento após atualização do Windows",
    description: "Lentidão geral desde a atualização de 15/10. Reiniciar não resolveu.",
    category: "Hardware",
    priority: "Média",
    status: "Aguardando analista",
    impact: "individual",
    requesterId: ana.id,
    createdAt: sp("2026-11-10T14:20:00"),
    updatedAt: sp("2026-11-18T10:00:00"),
    updates: [],
    ...overrides,
  };
}
