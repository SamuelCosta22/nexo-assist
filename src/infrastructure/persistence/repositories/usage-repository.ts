import { and, count, eq, gte } from "drizzle-orm";
import type { UsageRepository } from "@/application/ports/repositories";
import type { Database } from "../database";
import { messages } from "../schema";

export class DrizzleUsageRepository implements UsageRepository {
  constructor(private readonly db: Database) {}

  async countEmployeeMessagesSince(employeeId: string, since: Date): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(messages)
      .where(
        and(
          eq(messages.role, "employee"),
          eq(messages.authorId, employeeId),
          gte(messages.createdAt, since),
        ),
      );
    return row?.total ?? 0;
  }
}
