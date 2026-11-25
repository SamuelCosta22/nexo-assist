import { redirect } from "next/navigation";
import { NexoMark } from "@/ui/components/NexoMark";
import { LoginForm } from "@/ui/login/LoginForm";
import { getSessionUser, homeFor } from "../../_server/auth";

export const metadata = { title: "Entrar · Nexo Assist" };

function Showcase() {
  return (
    <section className="relative hidden w-[55%] flex-col justify-between bg-ink px-16 py-10 text-white lg:flex">
      <div className="flex items-center gap-2.5">
        <NexoMark size={24} />
        <span className="text-[17px] font-bold tracking-tight">Nexo Assist</span>
      </div>

      <div>
        <p className="text-xs text-white/60">Service desk de TI da Nexo</p>
        <h1 className="mt-4 font-display text-[56px] leading-[1.05] tracking-tight">
          Seu problema de TI, resolvido em uma conversa.
        </h1>
        <p className="mt-6 max-w-[540px] text-[15px] leading-relaxed text-white/60">
          Descreva o que está acontecendo. O assistente consulta seus chamados, busca na central de
          ajuda e chama um analista quando precisa.
        </p>

        <div className="mt-12 w-full max-w-[650px] rounded-2xl border border-white/10 bg-white/5 p-5 m-auto">
          <div className="ml-auto w-fit rounded-lg bg-white px-3.5 py-2 text-[13px] text-ink">
            Meu notebook não conecta na VPN. Erro 809.
          </div>
          <p className="mt-3 text-[11px] text-white/50">
            <span className="font-semibold text-white/80">Nexo Assist</span> consultou seus chamados
            · criou um chamado
          </p>
          <div className="mt-1.5 max-w-[320px] rounded-lg bg-white/10 px-3.5 py-2.5 text-[13px] leading-snug text-white/90">
            Pronto: abri o chamado com prioridade alta. Um analista fala com você em até 4 h úteis.
          </div>
          <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[12px] text-ink">
            <span className="size-1.5 rounded-full bg-warning" />
            <span className="font-mono font-medium">INC-20517</span>
            <span className="text-ink-3">Rede e VPN · Alta · em até 4 h</span>
          </div>
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-6 border-t border-white/15 pt-6">
        {[
          ["8 s", "primeira resposta, em média"],
          ["72%", "resolvidos sem fila"],
          ["6", "analistas online agora"],
        ].map(([value, label]) => (
          <div key={label}>
            <dd className="font-display text-[34px] leading-none">{value}</dd>
            <dt className="mt-2 text-xs text-white/55">{label}</dt>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect(homeFor(user));

  return (
    <main className="flex min-h-screen flex-1">
      <Showcase />
      <section className="flex flex-1 flex-col bg-paper">
        <div className="flex justify-end px-8 py-6 text-xs text-ink-3">
          <span>
            Problema para entrar? <span className="font-medium text-cta">Ligue no ramal 4000</span>
          </span>
        </div>
        <div className="flex flex-1 items-center justify-center px-8 pb-12">
          <LoginForm />
        </div>
        <footer className="flex items-center justify-between px-8 py-6 text-xs text-ink-3">
          <span>© 2026 Nexo · Service desk de TI</span>
          <span>Privacidade e uso de dados</span>
        </footer>
      </section>
    </main>
  );
}
