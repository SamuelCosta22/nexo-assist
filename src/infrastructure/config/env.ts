import { z } from "zod";

/**
 * Typed, validated environment. Fails fast with a readable message instead of
 * letting an undefined secret surface as an obscure runtime error later.
 *
 * Parsing is lazy (first `getEnv()` call) so that importing this module during
 * `next build` does not require every secret to be present.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatória"),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1, "GOOGLE_GENERATIVE_AI_API_KEY é obrigatória"),
  LLM_MODEL: z.string().min(1).default("gemini-3.5-flash"),
  /** Models offered in the chat's selector (comma separated). The default model is always included. */
  LLM_MODEL_OPTIONS: z
    .string()
    .default("gemini-3.5-flash,gemini-3.5-flash-lite,gemini-2.5-flash"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET deve ter ao menos 32 caracteres"),
  TICKETING_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0),
  CHAT_MESSAGE_LIMIT: z.coerce.number().int().positive().default(30),
  DAILY_MESSAGE_LIMIT: z.coerce.number().int().positive().default(150),
});

export type Env = Omit<z.infer<typeof schema>, "LLM_MODEL_OPTIONS"> & {
  /** Normalised: trimmed, de-duplicated, default model first. */
  LLM_MODEL_OPTIONS: string[];
};

export function parseEnv(source: Record<string, string | undefined>): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Configuração de ambiente inválida:\n${problems}`);
  }
  const { LLM_MODEL_OPTIONS, ...rest } = parsed.data;
  const listed = LLM_MODEL_OPTIONS.split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  const options = [...new Set([rest.LLM_MODEL, ...listed])];
  return { ...rest, LLM_MODEL_OPTIONS: options };
}

let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
