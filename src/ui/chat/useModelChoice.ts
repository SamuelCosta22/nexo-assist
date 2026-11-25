"use client";

import { useSyncExternalStore } from "react";

export interface ModelChoices {
  /** Models the server allows, default first. */
  options: string[];
  default: string;
}

const STORAGE_KEY = "nexo:model";
const listeners = new Set<() => void>();
/** Keeps the choice working for this tab even when localStorage is blocked. */
let inMemory: string | null = null;

function read(): string | null {
  if (inMemory) return inMemory;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/**
 * The model picked in the chat, remembered across reloads. Read through
 * useSyncExternalStore so the server render (default model) and hydration agree.
 * The server never trusts it: every request is re-validated against the allowlist.
 */
export function useModelChoice(models: ModelChoices): [string, (model: string) => void] {
  const saved = useSyncExternalStore(subscribe, read, () => null);
  const model = saved && models.options.includes(saved) ? saved : models.default;

  const choose = (next: string) => {
    inMemory = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage blocked: the in-memory choice still applies to this tab.
    }
    listeners.forEach((listener) => listener());
  };
  return [model, choose];
}
