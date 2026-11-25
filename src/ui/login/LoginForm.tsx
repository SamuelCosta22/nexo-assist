"use client";

import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";

const DEMO_ACCOUNTS = [
  { label: "Ana Souza", hint: "funcionária", email: "ana.souza@nexo.com.br" },
  { label: "Rafael Lima", hint: "analista N2", email: "rafael.lima@nexo.com.br" },
] as const;

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [forgot, setForgot] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    setLoading(true);
    try {
      const { redirectTo } = await api<{ redirectTo: string }>("/api/auth/login", {
        json: { email, password, remember },
      });
      router.replace(redirectTo);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : "Não foi possível entrar. Tente novamente.",
      );
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-[420px]">
      <h2 className="font-display text-[34px] leading-tight text-ink">Entrar</h2>
      <p className="mt-2 text-sm text-ink-3">Use seu e-mail corporativo e a senha da rede Nexo.</p>

      <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
        <div>
          <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-ink-2">
            E-mail corporativo
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nome.sobrenome@nexo.com.br"
              className="h-11 w-full rounded-md border border-rule bg-paper pl-10 pr-3 text-sm text-ink outline-none transition focus:border-cta focus:ring-2 focus:ring-cta/15"
            />
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="password" className="text-xs font-medium text-ink-2">
              Senha
            </label>
            <button
              type="button"
              onClick={() => setForgot((value) => !value)}
              className="text-xs font-medium text-cta hover:underline"
            >
              Esqueci minha senha
            </button>
          </div>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 w-full rounded-md border border-rule bg-paper pl-10 pr-10 text-sm text-ink outline-none transition focus:border-cta focus:ring-2 focus:ring-cta/15"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {forgot && (
            <p className="mt-2 rounded-md bg-desk px-3 py-2 text-xs text-ink-2" role="status">
              A senha é gerenciada pela TI. Ligue no ramal 4000 ou use o portal de autoatendimento.
            </p>
          )}
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-2">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="size-4 accent-cta"
          />
          Manter conectado neste computador
        </label>

        {error && (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-text">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !email || !password}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-cta text-sm font-semibold text-white transition hover:bg-cta/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Entrando…" : "Entrar"}
          {!loading && <ArrowRight className="size-4" />}
        </button>
      </form>

      <div className="mt-8 border-t border-rule pt-5">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-3">
          Contas de demonstração (qualquer senha)
        </p>
        <div className="flex flex-wrap gap-2">
          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.email}
              type="button"
              onClick={() => {
                setEmail(account.email);
                setPassword("demonstracao");
              }}
              className="rounded-md border border-rule px-3 py-1.5 text-left text-xs text-ink-2 transition hover:border-cta hover:text-ink"
            >
              <span className="font-medium text-ink">{account.label}</span> · {account.hint}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
