import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });
config();

// `generate` only reads the schema; `studio` needs a connection. The URL is
// therefore optional here and enforced by the commands that need it.
const url = process.env.DATABASE_URL;

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/infrastructure/persistence/schema.ts",
  out: "./drizzle",
  ...(url ? { dbCredentials: { url } } : {}),
  strict: true,
  verbose: true,
});
