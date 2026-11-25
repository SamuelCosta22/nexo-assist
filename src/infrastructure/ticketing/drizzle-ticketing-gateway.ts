import { asc, eq, inArray, sql } from "drizzle-orm";
import type { Ticket, TicketUpdate } from "@/domain/ticketing/ticket";
import type { TicketDraft } from "@/domain/ticketing/ticket-draft";
import type { SupportGroup, TicketStatus, TicketType } from "@/domain/ticketing/vocabulary";
import type { Clock } from "@/application/ports/clock";
import type { IdGenerator } from "@/application/ports/id-generator";
import type { TicketingGateway } from "@/application/ports/ticketing-gateway";
import type { Database } from "../persistence/database";
import { ticketingSequences, ticketingTickets, ticketingUpdates } from "../persistence/schema";

/** First code handed out per type when the sequence does not exist yet. */
const SEQUENCE_START: Record<TicketType, number> = { INC: 20531, REQ: 10443 };

type TicketRow = typeof ticketingTickets.$inferSelect;
type UpdateRow = typeof ticketingUpdates.$inferSelect;

function toTicket(row: TicketRow, updates: readonly UpdateRow[]): Ticket {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    category: row.category as Ticket["category"],
    ...(row.subcategory ? { subcategory: row.subcategory } : {}),
    priority: row.priority as Ticket["priority"],
    status: row.status as TicketStatus,
    impact: row.impact as Ticket["impact"],
    requesterId: row.requesterId,
    ...(row.assignedGroup ? { assignedGroup: row.assignedGroup as SupportGroup } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.resolvedAt ? { resolvedAt: row.resolvedAt } : {}),
    updates: updates.map((update): TicketUpdate => ({
      id: update.id,
      authorKind: update.authorKind,
      authorName: update.authorName,
      kind: update.kind,
      note: update.note,
      createdAt: update.createdAt,
    })),
  };
}

/**
 * Stand-in for the company's legacy ticketing system, backed by its own
 * tables. It knows nothing about conversations, agents or who is asking: it
 * just stores and returns tickets, like the real thing would.
 *
 * Writes are single, independent statements (no multi-statement transaction):
 * Neon's HTTP driver is stateless, and every step here is safe to observe on
 * its own. A real legacy integration would add idempotency keys.
 */
export class DrizzleTicketingGateway implements TicketingGateway {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async listByRequester(requesterId: string): Promise<Ticket[]> {
    const rows = await this.db
      .select()
      .from(ticketingTickets)
      .where(eq(ticketingTickets.requesterId, requesterId));
    return this.withUpdates(rows);
  }

  async findById(ticketId: string): Promise<Ticket | undefined> {
    const rows = await this.db
      .select()
      .from(ticketingTickets)
      .where(eq(ticketingTickets.id, ticketId))
      .limit(1);
    return (await this.withUpdates(rows))[0];
  }

  async create(input: {
    requesterId: string;
    requesterName: string;
    draft: TicketDraft;
  }): Promise<Ticket> {
    const { draft } = input;
    const now = this.clock.now();
    const id = `${draft.type}-${await this.nextNumber(draft.type)}`;
    await this.db.insert(ticketingTickets).values({
      id,
      type: draft.type,
      title: draft.title,
      description: draft.description,
      category: draft.category,
      subcategory: draft.subcategory ?? null,
      priority: draft.priority,
      status: "Novo",
      impact: draft.impact,
      requesterId: input.requesterId,
      createdAt: now,
      updatedAt: now,
    });
    return this.require(id);
  }

  async addRequesterUpdate(ticketId: string, input: { authorName: string; note: string }) {
    await this.record(ticketId, { authorKind: "requester", kind: "comment", ...input });
    return this.require(ticketId);
  }

  async addAnalystUpdate(
    ticketId: string,
    input: { authorName: string; note: string; status?: TicketStatus },
  ) {
    await this.record(
      ticketId,
      { authorKind: "analyst", kind: "comment", authorName: input.authorName, note: input.note },
      input.status ? { status: input.status } : {},
    );
    return this.require(ticketId);
  }

  async reopen(ticketId: string, input: { authorName: string; note: string }) {
    await this.record(
      ticketId,
      { authorKind: "requester", kind: "reopened", ...input },
      { status: "Em andamento", resolvedAt: null },
    );
    return this.require(ticketId);
  }

  async transfer(ticketId: string, input: { group: SupportGroup; reason: string }) {
    await this.record(
      ticketId,
      {
        authorKind: "system",
        kind: "transferred",
        authorName: "Nexo Assist",
        note: `Transferido para ${input.group}: ${input.reason}`,
      },
      { assignedGroup: input.group, status: "Aguardando analista" },
    );
    return this.require(ticketId);
  }

  /** Appends a history entry and touches the ticket. */
  private async record(
    ticketId: string,
    update: Pick<UpdateRow, "authorKind" | "kind" | "authorName" | "note">,
    changes: Partial<Pick<TicketRow, "status" | "assignedGroup" | "resolvedAt">> = {},
  ) {
    const now = this.clock.now();
    await this.require(ticketId);
    await this.db
      .insert(ticketingUpdates)
      .values({ id: this.ids.next(), ticketId, createdAt: now, ...update });
    await this.db
      .update(ticketingTickets)
      .set({ updatedAt: now, ...changes })
      .where(eq(ticketingTickets.id, ticketId));
  }

  private async require(ticketId: string): Promise<Ticket> {
    const ticket = await this.findById(ticketId);
    if (!ticket) throw new Error(`Chamado ${ticketId} não existe no serviço de chamados.`);
    return ticket;
  }

  /** Atomic upsert-and-increment: two simultaneous creations never share a code. */
  private async nextNumber(type: TicketType): Promise<number> {
    const [row] = await this.db
      .insert(ticketingSequences)
      .values({ name: type, value: SEQUENCE_START[type] })
      .onConflictDoUpdate({
        target: ticketingSequences.name,
        set: { value: sql`${ticketingSequences.value} + 1` },
      })
      .returning({ value: ticketingSequences.value });
    if (!row) throw new Error("Falha ao gerar o código do chamado.");
    return row.value;
  }

  private async withUpdates(rows: readonly TicketRow[]): Promise<Ticket[]> {
    if (rows.length === 0) return [];
    const updates = await this.db
      .select()
      .from(ticketingUpdates)
      .where(
        inArray(
          ticketingUpdates.ticketId,
          rows.map((row) => row.id),
        ),
      )
      .orderBy(asc(ticketingUpdates.createdAt));
    return rows.map((row) =>
      toTicket(
        row,
        updates.filter((update) => update.ticketId === row.id),
      ),
    );
  }
}
