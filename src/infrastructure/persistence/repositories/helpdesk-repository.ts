import type { Article } from "@/domain/helpdesk/article";
import type { HelpdeskRepository } from "@/application/ports/repositories";
import type { Database } from "../database";
import { helpdeskArticles } from "../schema";

export class DrizzleHelpdeskRepository implements HelpdeskRepository {
  constructor(private readonly db: Database) {}

  async listArticles(): Promise<Article[]> {
    const rows = await this.db.select().from(helpdeskArticles);
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      content: row.content,
      tags: row.tags,
    }));
  }
}
