import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

config({ path: ".env.local" });
config();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL não definida. Copie .env.example para .env.local e preencha.");
  process.exit(1);
}

await migrate(drizzle({ client: neon(url) }), { migrationsFolder: "./drizzle" });
console.log("Migrações aplicadas.");
