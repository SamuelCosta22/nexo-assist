import { getContainer } from "@/infrastructure/container";
import type { ModelChoices } from "@/ui/chat/useModelChoice";

/** Allowed models for the chat selector, default first. */
export function modelChoices(): ModelChoices {
  const { env } = getContainer();
  return { options: env.LLM_MODEL_OPTIONS, default: env.LLM_MODEL };
}
