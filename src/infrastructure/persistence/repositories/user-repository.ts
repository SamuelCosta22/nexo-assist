import { eq, inArray } from "drizzle-orm";
import type { User } from "@/domain/identity/user";
import type { UserRepository } from "@/application/ports/repositories";
import type { Database } from "../database";
import { users } from "../schema";

export function toUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    ...(row.department ? { department: row.department } : {}),
    ...(row.supportLevel ? { supportLevel: row.supportLevel } : {}),
  };
}

export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly db: Database) {}

  async findById(id: string) {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return row ? toUser(row) : undefined;
  }

  async findByEmail(email: string) {
    const [row] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return row ? toUser(row) : undefined;
  }

  async findManyByIds(ids: readonly string[]) {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select()
      .from(users)
      .where(inArray(users.id, [...ids]));
    return rows.map(toUser);
  }
}
