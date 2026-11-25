"use client";

import { KeyRound, Lock, Mail, RotateCcw } from "lucide-react";
import { useState } from "react";
import type { UserDto } from "../api-types";

/**
 * "Meu perfil" (prototype screen 6). Identity is managed by IT, so the e-mail is
 * read-only. Password reset only announces the e-mail: sending real mail is out
 * of scope (README, decision 22).
 */
export function ProfileView({ user }: { user: UserDto }) {
  const [requested, setRequested] = useState(false);

  return (
    <div className="h-full overflow-y-auto px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-[520px]">
        <h1 className="font-display text-3xl text-ink">Meu perfil</h1>
        <p className="mt-1 text-sm text-ink-3">Seus dados de acesso ao service desk de TI.</p>

        <section className="mt-8 overflow-hidden rounded-xl border border-rule bg-paper shadow-sm">
          <dl>
            <div className="flex items-center justify-between border-b border-rule px-5 py-4">
              <dt className="text-sm text-ink-3">Nome</dt>
              <dd className="text-sm text-ink">{user.name}</dd>
            </div>
            <div className="flex items-center justify-between px-5 py-4">
              <dt className="text-sm text-ink-3">E-mail corporativo</dt>
              <dd className="flex items-center gap-3 text-sm text-ink">
                {user.email}
                <span className="inline-flex items-center gap-1 text-[11px] text-ink-3">
                  <Lock className="size-3" /> Gerenciado pela TI
                </span>
              </dd>
            </div>
          </dl>
        </section>

        <section className="mt-5 overflow-hidden rounded-xl border border-rule bg-paper shadow-sm">
          <div className="flex items-center gap-4 px-5 py-4">
            <span className="flex size-10 items-center justify-center rounded-full bg-desk text-ink-2">
              <KeyRound className="size-4" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-medium text-ink">Senha</p>
              <p className="text-xs text-ink-3">Alterada há 42 dias</p>
            </div>
            <button
              type="button"
              onClick={() => setRequested(true)}
              disabled={requested}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-rule bg-paper px-3 text-sm font-medium text-ink hover:bg-desk disabled:opacity-60"
            >
              <RotateCcw className="size-3.5" />
              Redefinir senha
            </button>
          </div>
          <p
            className="flex items-center gap-2 border-t border-rule bg-desk px-5 py-3 text-xs text-ink-3"
            role="status"
          >
            <Mail className="size-3.5" />
            {requested ? "Pedido registrado. " : ""}Enviaremos um link de redefinição para{" "}
            {user.email}.
          </p>
        </section>
      </div>
    </div>
  );
}
