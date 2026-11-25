import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { requestHandoff, startConversation } from "@/domain/conversation/conversation";
import { createTicketDraft } from "@/domain/ticketing/ticket-draft";
import { ConcurrencyError } from "@/application/errors";
import type { Database } from "@/infrastructure/persistence/database";
import { DrizzleConversationRepository } from "@/infrastructure/persistence/repositories/conversation-repository";
import { DrizzleHelpdeskRepository } from "@/infrastructure/persistence/repositories/helpdesk-repository";
import { DrizzleMessageRepository } from "@/infrastructure/persistence/repositories/message-repository";
import { DrizzlePendingActionRepository } from "@/infrastructure/persistence/repositories/pending-action-repository";
import { DrizzleUserRepository } from "@/infrastructure/persistence/repositories/user-repository";
import { helpdeskArticles, users } from "@/infrastructure/persistence/schema";
import { DrizzleTicketingGateway } from "@/infrastructure/ticketing/drizzle-ticketing-gateway";
import { FixedClock, SequentialIds, ana, rafael, sp } from "../support/in-memory";
import { createTestDatabase, resetDatabase } from "../support/pglite";

let db: Database;
const clock = new FixedClock(sp("2026-11-24T09:43:00"));

beforeAll(async () => {
  db = await createTestDatabase();
}, 30_000);

beforeEach(async () => {
  await resetDatabase(db);
  await db.insert(users).values([
    { id: ana.id, name: ana.name, email: ana.email, role: "employee", department: "Financeiro" },
    {
      id: rafael.id,
      name: rafael.name,
      email: rafael.email,
      role: "analyst",
      supportLevel: "Suporte N2",
    },
  ]);
});

describe("users and help center", () => {
  it("finds users by id, e-mail and a list of ids", async () => {
    const repo = new DrizzleUserRepository(db);
    expect((await repo.findByEmail(ana.email))?.department).toBe("Financeiro");
    expect((await repo.findById(rafael.id))?.supportLevel).toBe("Suporte N2");
    expect(await repo.findManyByIds([ana.id, rafael.id])).toHaveLength(2);
    expect(await repo.findManyByIds([])).toEqual([]);
    expect(await repo.findByEmail("ninguem@nexo.com.br")).toBeUndefined();
  });

  it("returns articles with their tags", async () => {
    await db
      .insert(helpdeskArticles)
      .values({ id: "a1", title: "VPN", content: "texto", tags: ["vpn", "rede"] });
    expect(await new DrizzleHelpdeskRepository(db).listArticles()).toEqual([
      { id: "a1", title: "VPN", content: "texto", tags: ["vpn", "rede"] },
    ]);
  });
});

describe("DrizzleTicketingGateway", () => {
  const gateway = () => new DrizzleTicketingGateway(db, clock, new SequentialIds());
  const draft = (() => {
    const result = createTicketDraft({
      type: "INC",
      title: "VPN não conecta no notebook, erro 809",
      description: "Desde 20/10 o notebook (Windows 11) não conecta na VPN.",
      category: "Rede e VPN",
      impact: "individual",
      urgency: "deadline_today",
    });
    if (!result.ok) throw result.error;
    return result.value;
  })();

  it("creates tickets with sequential codes per type", async () => {
    const g = gateway();
    const first = await g.create({ requesterId: ana.id, requesterName: ana.name, draft });
    const second = await g.create({ requesterId: ana.id, requesterName: ana.name, draft });
    expect(first.id).toBe("INC-20531");
    expect(second.id).toBe("INC-20532");
    expect(first).toMatchObject({ status: "Novo", priority: "Alta", requesterId: ana.id });
  });

  it("lists by requester only", async () => {
    const g = gateway();
    await g.create({ requesterId: ana.id, requesterName: ana.name, draft });
    expect(await g.listByRequester(ana.id)).toHaveLength(1);
    expect(await g.listByRequester(rafael.id)).toHaveLength(0);
  });

  it("records history: requester comment, analyst answer, transfer and reopen", async () => {
    const g = gateway();
    const { id } = await g.create({ requesterId: ana.id, requesterName: ana.name, draft });

    clock.advance(60_000);
    await g.addRequesterUpdate(id, { authorName: "Ana", note: "Mais um detalhe" });
    clock.advance(60_000);
    const answered = await g.addAnalystUpdate(id, {
      authorName: "Rafael",
      note: "Verificando",
      status: "Em andamento",
    });
    expect(answered.status).toBe("Em andamento");
    expect(answered.updates.map((u) => u.authorKind)).toEqual(["requester", "analyst"]);

    const transferred = await g.transfer(id, { group: "Suporte N2", reason: "vencido" });
    expect(transferred).toMatchObject({
      assignedGroup: "Suporte N2",
      status: "Aguardando analista",
    });

    await db.execute(
      `UPDATE ticketing_tickets SET status='Resolvido', resolved_at=now() WHERE id='${id}'`,
    );
    const reopened = await g.reopen(id, { authorName: "Ana", note: "voltou" });
    expect(reopened.status).toBe("Em andamento");
    expect(reopened.resolvedAt).toBeUndefined();
  });

  it("fails loudly for a ticket that does not exist", async () => {
    await expect(
      gateway().addRequesterUpdate("INC-0", { authorName: "x", note: "y" }),
    ).rejects.toThrow(/não existe/);
  });
});

describe("DrizzleConversationRepository", () => {
  const conversations = () => new DrizzleConversationRepository(db);
  const fresh = () => startConversation({ id: "c1", employeeId: ana.id, now: clock.now() });

  it("round-trips a conversation including its handoff", async () => {
    const repo = conversations();
    const base = fresh();
    await repo.create(base);
    const waiting = requestHandoff(
      base,
      { reason: "overdue_ticket", summary: "INC-1 vencido", ticketId: "INC-1", confidence: 0.41 },
      clock.now(),
    );
    if (!waiting.ok) throw waiting.error;
    await repo.save(waiting.value, base);

    const loaded = await repo.findById("c1");
    expect(loaded).toEqual(waiting.value);
    expect(loaded?.handoff?.requestedAt).toBeInstanceOf(Date);
  });

  it("rejects a stale write so two analysts cannot both win", async () => {
    const repo = conversations();
    const base = fresh();
    await repo.create(base);
    const waiting = requestHandoff(
      base,
      { reason: "user_request", summary: "x" },
      sp("2026-11-24T09:50:00"),
    );
    if (!waiting.ok) throw waiting.error;
    await repo.save(waiting.value, base);

    await expect(repo.save({ ...base, title: "intruso" }, base)).rejects.toBeInstanceOf(
      ConcurrencyError,
    );
    expect((await repo.findById("c1"))?.title).toBe("Nova conversa");
  });

  it("lists summaries with the last message and filters by employee", async () => {
    const repo = conversations();
    const messages = new DrizzleMessageRepository(db);
    await repo.create(fresh());
    await messages.append({
      id: "m1",
      conversationId: "c1",
      role: "employee",
      content: "primeira",
      blocks: [],
      createdAt: clock.now(),
    });
    await messages.append({
      id: "m2",
      conversationId: "c1",
      role: "agent",
      content: "segunda",
      blocks: [],
      createdAt: clock.now(),
    });

    const [summary] = await repo.listSummaries({ employeeId: ana.id });
    expect(summary?.lastMessage?.content).toBe("segunda");
    expect(summary?.employee.name).toBe("Ana Souza");
    expect(await repo.listSummaries({ employeeId: rafael.id })).toEqual([]);
    expect(await repo.listSummaries({ statuses: ["closed"] })).toEqual([]);
  });
});

describe("DrizzleMessageRepository", () => {
  it("keeps insertion order even when timestamps tie, and returns the recent window", async () => {
    await new DrizzleConversationRepository(db).create(
      startConversation({ id: "c1", employeeId: ana.id, now: clock.now() }),
    );
    const repo = new DrizzleMessageRepository(db);
    const same = clock.now();
    for (let i = 0; i < 5; i += 1) {
      await repo.append({
        id: `m${i}`,
        conversationId: "c1",
        role: "employee",
        content: `msg ${i}`,
        blocks: [],
        createdAt: same,
      });
    }
    expect((await repo.list("c1")).map((m) => m.content)).toEqual([
      "msg 0",
      "msg 1",
      "msg 2",
      "msg 3",
      "msg 4",
    ]);
    expect((await repo.listRecent("c1", 2)).map((m) => m.content)).toEqual(["msg 3", "msg 4"]);
  });

  it("persists blocks, system events and the agent trace", async () => {
    await new DrizzleConversationRepository(db).create(
      startConversation({ id: "c1", employeeId: ana.id, now: clock.now() }),
    );
    const repo = new DrizzleMessageRepository(db);
    await repo.append({
      id: "m1",
      conversationId: "c1",
      role: "agent",
      content: "ok",
      createdAt: clock.now(),
      blocks: [{ type: "options", question: "Quem?", options: ["Só eu", "Equipe"] }],
      trace: {
        decisionReported: true,
        decision: {
          understanding: "u",
          intent: "duvida",
          confidence: 0.8,
          rationale: "r",
          rulesApplied: ["x"],
        },
        actions: [],
        metrics: { model: "m", latencyMs: 3 },
      },
    });
    const [message] = await repo.list("c1");
    expect(message?.blocks[0]).toMatchObject({ type: "options" });
    expect(message?.trace?.decision.confidence).toBe(0.8);
  });
});

describe("DrizzlePendingActionRepository", () => {
  it("upserts, finds the pending one and loads many by id", async () => {
    await new DrizzleConversationRepository(db).create(
      startConversation({ id: "c1", employeeId: ana.id, now: clock.now() }),
    );
    const repo = new DrizzlePendingActionRepository(db);
    const action = {
      id: "p1",
      conversationId: "c1",
      employeeId: ana.id,
      status: "pending" as const,
      createdAt: clock.now(),
      payload: { kind: "update_ticket" as const, ticketId: "INC-1", note: "mais info" },
    };
    await repo.save(action);
    expect((await repo.findPendingByConversation("c1"))?.id).toBe("p1");

    await repo.save({
      ...action,
      status: "confirmed",
      resultTicketId: "INC-1",
      resolvedAt: clock.now(),
    });
    expect(await repo.findPendingByConversation("c1")).toBeUndefined();
    expect((await repo.findManyByIds(["p1", "nope"]))[0]).toMatchObject({
      status: "confirmed",
      resultTicketId: "INC-1",
    });
  });
});

describe("DrizzleUsageRepository", () => {
  it("counts only the employee's own messages inside the window", async () => {
    const { DrizzleUsageRepository } =
      await import("@/infrastructure/persistence/repositories/usage-repository");
    await new DrizzleConversationRepository(db).create(
      startConversation({ id: "c1", employeeId: ana.id, now: clock.now() }),
    );
    const messages = new DrizzleMessageRepository(db);
    const hoursAgo = (h: number) => new Date(clock.now().getTime() - h * 3_600_000);
    const base = { conversationId: "c1", blocks: [] };
    await messages.append({
      ...base,
      id: "a",
      role: "employee",
      authorId: ana.id,
      content: "recente",
      createdAt: hoursAgo(1),
    });
    await messages.append({
      ...base,
      id: "b",
      role: "employee",
      authorId: ana.id,
      content: "antiga",
      createdAt: hoursAgo(30),
    });
    await messages.append({
      ...base,
      id: "c",
      role: "agent",
      content: "resposta",
      createdAt: hoursAgo(1),
    });
    await messages.append({
      ...base,
      id: "d",
      role: "employee",
      authorId: rafael.id,
      content: "de outra pessoa",
      createdAt: hoursAgo(1),
    });

    const usage = new DrizzleUsageRepository(db);
    expect(await usage.countEmployeeMessagesSince(ana.id, hoursAgo(24))).toBe(1);
    expect(await usage.countEmployeeMessagesSince(ana.id, hoursAgo(48))).toBe(2);
  });
});
