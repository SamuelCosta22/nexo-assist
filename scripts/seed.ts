import { config } from "dotenv";
import { createNeonDatabase } from "../src/infrastructure/persistence/database";
import { seedDatabase } from "../src/infrastructure/persistence/seed/seed-database";

config({ path: ".env.local" });
config();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL não definida. Copie .env.example para .env.local e preencha.");
  process.exit(1);
}

await seedDatabase(createNeonDatabase(url));
console.log("Dados de exemplo carregados.");
console.log(
  "Login: ana.souza@nexo.com.br (funcionária) ou rafael.lima@nexo.com.br (analista), qualquer senha.",
);
