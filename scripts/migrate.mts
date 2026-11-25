import { config } from "dotenv";
import { runMigrations } from "../src/infrastructure/persistence/migrate";

config({ path: ".env.local" });
config();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL não definida. Copie .env.example para .env.local e preencha.");
  process.exit(1);
}

await runMigrations(url);
console.log("Migrações aplicadas.");
