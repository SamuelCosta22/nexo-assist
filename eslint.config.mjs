import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Architecture fitness functions.
 *
 * The dependency rule of Clean/Hexagonal Architecture is enforced by the
 * linter, not by convention:
 *
 *   domain  <-  application  <-  infrastructure  <-  app (delivery) / ui
 *
 * Inner layers never import outer layers, and never import frameworks.
 */
const layer = (files, patterns) => ({
  files,
  rules: {
    "no-restricted-imports": ["error", { patterns }],
  },
});

const frameworks = [
  {
    group: ["next", "next/*", "react", "react-dom", "react/*"],
    message: "Frameworks de UI/web não pertencem a esta camada.",
  },
  {
    group: ["drizzle-orm", "drizzle-orm/*", "@neondatabase/*"],
    message: "Persistência é detalhe de infraestrutura.",
  },
  {
    group: ["ai", "@ai-sdk/*", "@mastra/*"],
    message: "LLM/agent framework é detalhe de infraestrutura.",
  },
];

const outerOfApplication = [
  {
    group: ["@/infrastructure", "@/infrastructure/*"],
    message: "Camada interna não pode depender de infrastructure.",
  },
  {
    group: ["@/app", "@/app/*", "@/ui", "@/ui/*"],
    message: "Camada interna não pode depender da camada de entrega.",
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // domain: puro. Sem frameworks, sem zod, sem outras camadas.
  layer(
    ["src/domain/**/*.ts"],
    [
      ...frameworks,
      ...outerOfApplication,
      {
        group: ["@/application", "@/application/*"],
        message: "domain não depende de application.",
      },
      {
        group: ["zod"],
        message: "Validação de borda (zod) fica em application/infrastructure, não no domínio.",
      },
    ],
  ),
  // application: casos de uso e portas. Só conhece domain.
  layer(["src/application/**/*.ts"], [...frameworks, ...outerOfApplication]),
  // infrastructure: adapters. Não conhece a camada de entrega.
  layer(
    ["src/infrastructure/**/*.ts"],
    [
      {
        group: ["@/app", "@/app/*", "@/ui", "@/ui/*"],
        message: "infrastructure não depende da camada de entrega.",
      },
    ],
  ),
  // ui: componentes. Nunca tocam infraestrutura diretamente.
  layer(
    ["src/ui/**/*.{ts,tsx}"],
    [
      {
        group: ["@/infrastructure", "@/infrastructure/*"],
        message: "ui fala com o backend por HTTP, nunca importa infrastructure.",
      },
    ],
  ),
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "coverage/**", "next-env.d.ts", "drizzle/**"]),
]);

export default eslintConfig;
