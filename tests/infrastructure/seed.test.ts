import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { findLikelyDuplicate } from "@/domain/ticketing/duplicate-policy";
import { SlaPolicy } from "@/domain/ticketing/sla-policy";
import { slaAnchor } from "@/domain/ticketing/ticket";
import { rankArticles } from "@/domain/helpdesk/article";
import type { Database } from "@/infrastructure/persistence/database";
import { DrizzleConversationRepository } from "@/infrastructure/persistence/repositories/conversation-repository";
import { DrizzleHelpdeskRepository } from "@/infrastructure/persistence/repositories/helpdesk-repository";
import { DrizzleUserRepository } from "@/infrastructure/persistence/repositories/user-repository";
import { seedDatabase } from "@/infrastructure/persistence/seed/seed-database";
import { DrizzleTicketingGateway } from "@/infrastructure/ticketing/drizzle-ticketing-gateway";
import { FixedClock, SequentialIds, sp } from "../support/in-memory";
import { createTestDatabase, resetDatabase } from "../support/pglite";

let db: Database;
const now = sp("2026-11-24T09:43:00");
const clock = new FixedClock(now);

beforeAll(async () => {
  db = await createTestDatabase();
}, 30_000);

beforeEach(async () => {
  await resetDatabase(db);
  await seedDatabase(db, now);
});

describe("seed data", () => {
  it("is idempotent", async () => {
    await seedDatabase(db, now);
    await seedDatabase(db, now);
    const summaries = await new DrizzleConversationRepository(db).listSummaries({});
    expect(summaries).toHaveLength(6);
  });

  it("tells the PRD story for Ana: 3 open tickets, one overdue, one reopenable", async () => {
    const gateway = new DrizzleTicketingGateway(db, clock, new SequentialIds());
    const sla = new SlaPolicy();
    const tickets = await gateway.listByRequester("u-ana");
    const open = tickets.filter((t) => t.status !== "Resolvido");
    expect(open.map((t) => t.id).sort()).toEqual(["INC-20298", "INC-20311", "REQ-10442"]);

    const overdue = open.filter(
      (t) =>
        sla.evaluate({ priority: t.priority, status: t.status, slaAnchorAt: slaAnchor(t) }, now)
          .overdue,
    );
    expect(overdue.map((t) => t.id)).toContain("INC-20311");
    expect(overdue.map((t) => t.id)).not.toContain("INC-20298");
  });

  it("continues ticket codes after the seeded ones", async () => {
    const gateway = new DrizzleTicketingGateway(db, clock, new SequentialIds());
    const ana = (await new DrizzleUserRepository(db).findById("u-ana"))!;
    const result = await gateway.create({
      requesterId: ana.id,
      requesterName: ana.name,
      draft: {
        type: "INC",
        title: "Qualquer coisa nova",
        description: "Descrição suficientemente longa aqui.",
        category: "Outros",
        impact: "individual",
        urgency: "none",
        priority: "Baixa",
        priorityRationale: "x",
        slaLabel: "5 dias úteis",
      },
    });
    expect(result.id).toBe("INC-20531");
  });

  it("has help-center coverage for the PRD examples", async () => {
    const articles = await new DrizzleHelpdeskRepository(db).listArticles();
    expect(rankArticles("VPN erro 809", articles)[0]?.article.id).toBe("kb-vpn-809");
    expect(rankArticles("qual o horário do service desk", articles)[0]?.article.id).toBe(
      "kb-horario",
    );
  });

  it("makes a new VPN problem not look like a duplicate of Ana's tickets", async () => {
    const gateway = new DrizzleTicketingGateway(db, clock, new SequentialIds());
    const tickets = await gateway.listByRequester("u-ana");
    expect(
      findLikelyDuplicate(
        { title: "VPN não conecta no notebook, erro 809", category: "Rede e VPN" },
        tickets,
        now,
      ),
    ).toBeUndefined();
  });

  it("has both kinds of users to log in with", async () => {
    const users = new DrizzleUserRepository(db);
    expect((await users.findByEmail("ana.souza@nexo.com.br"))?.role).toBe("employee");
    expect((await users.findByEmail("rafael.lima@nexo.com.br"))?.supportLevel).toBe("Suporte N2");
  });
});
