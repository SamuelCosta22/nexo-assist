"use client";

import { ArrowUp } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";

interface Props {
  disabled: boolean;
  placeholder: string;
  onSend: (text: string) => void;
  /** "18/30 mensagens nesta sessão" */
  counter?: string | undefined;
  limitReached?: boolean | undefined;
}

export function Composer({ disabled, placeholder, onSend, counter, limitReached }: Props) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  function submit() {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
    if (ref.current) ref.current.style.height = "auto";
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div>
      <div
        className={`flex items-end gap-2 rounded-xl border bg-paper p-2 shadow-sm transition focus-within:border-cta focus-within:ring-2 focus-within:ring-cta/15 ${
          limitReached ? "border-rule opacity-60" : "border-rule"
        }`}
      >
        <textarea
          ref={ref}
          value={value}
          rows={1}
          maxLength={2000}
          disabled={disabled}
          placeholder={placeholder}
          aria-label="Mensagem"
          onChange={(event) => {
            setValue(event.target.value);
            event.target.style.height = "auto";
            event.target.style.height = `${Math.min(event.target.scrollHeight, 160)}px`;
          }}
          onKeyDown={onKeyDown}
          className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-ink outline-none placeholder:text-ink-3 disabled:cursor-not-allowed"
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || value.trim().length === 0}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-cta px-3.5 text-sm font-semibold text-white transition hover:bg-cta/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowUp className="size-4" />
          Enviar
        </button>
      </div>
      {counter && <p className="mt-1.5 text-right text-[11px] text-ink-3">{counter}</p>}
    </div>
  );
}
