# Nexo Assist

Agent de atendimento do service desk de TI da Nexo. O funcionário descreve o problema com as próprias palavras; o agent consulta os chamados dele, busca na central de ajuda, abre ou atualiza chamados (sempre com confirmação) e chama um analista quando precisa. Um console separado permite ao analista assumir a conversa, e **cada resposta do agent é explicável**: o que entendeu, o que fez e por quê.

**Deploy:** https://nexo-assist-psi.vercel.app

> **Para quem vai avaliar:** no formulário de entrega eu já deixei **todas as variáveis de ambiente necessárias**, inclusive uma `DATABASE_URL` do Neon. Para rodar localmente basta copiar esses valores para o `.env.local`. O deploy acima já usa a mesma configuração.

## Sumário

1. [Como rodar](#como-rodar)
2. [Arquitetura](#arquitetura)
3. [Como o agent decide o que fazer](#como-o-agent-decide-o-que-fazer)
4. [Transparência](#transparência)
5. [Como garanto a qualidade das decisões](#como-garanto-a-qualidade-das-decisões)
6. [Modelo, eficiência e custo](#modelo-eficiência-e-custo)
7. [Segurança e privacidade](#segurança-e-privacidade)
8. [Decisões e trade-offs](#decisões-e-trade-offs)
9. [O que faria com mais tempo](#o-que-faria-com-mais-tempo)
10. [Deploy](#deploy)

---

## Como rodar

Pré-requisitos: Node.js >= 20.19, [pnpm](https://pnpm.io) 10 (`corepack enable` já o habilita) e Docker (só se quiser o Postgres local).

```bash
pnpm install
cp .env.example .env.local     # preencha com as variáveis do formulário de entrega
pnpm db:migrate                # cria as tabelas
pnpm db:seed                   # funcionários, analistas, artigos e chamados de exemplo
pnpm dev                       # http://localhost:3000
```

Com a `DATABASE_URL` do Neon (formulário de entrega) não é preciso Docker. Para usar um Postgres local, rode `docker compose up -d`; o `.env.example` já aponta para ele. O código escolhe o driver pela URL (hosts `*.neon.tech` usam o driver HTTP do Neon).

**Contas de demonstração** (qualquer senha serve): `ana.souza@nexo.com.br` (funcionária) e `rafael.lima@nexo.com.br` (analista N2). A tela de login tem atalhos para as duas. Para testar o console, abra duas janelas (uma anônima), uma como Ana e outra como Rafael, peça "quero falar com um analista" na conversa da Ana e acompanhe a transferência chegando ao console.

| Comando                                     | O que faz                                                            |
| ------------------------------------------- | -------------------------------------------------------------------- |
| `pnpm check`                                | typecheck + lint (inclui as regras de camadas) + testes              |
| `pnpm eval`                                 | 11 cenários do PRD contra o **modelo real** (precisa da chave)       |
| `pnpm db:migrate` / `db:seed` / `db:studio` | Banco (Drizzle). O seed é idempotente e reancora as datas em "agora" |

Variáveis de ambiente (validadas com Zod na primeira leitura, com mensagem clara se faltar algo): `DATABASE_URL`, `GOOGLE_GENERATIVE_AI_API_KEY`, `SESSION_SECRET` (≥ 32 caracteres), `LLM_MODEL` (padrão `gemini-3.5-flash`), `LLM_MODEL_OPTIONS` (modelos do seletor do chat), `TICKETING_FAILURE_RATE` (0 a 1; use `0.3` para ver a falha do serviço legado ao vivo), `CHAT_MESSAGE_LIMIT` (30) e `DAILY_MESSAGE_LIMIT` (150).

> **Cota do Gemini gratuito:** a camada gratuita permite ~20 requisições por dia **por modelo**, e cada mensagem gasta de 2 a 4. Quando a cota acaba o app **não quebra**: a mensagem é salva e o funcionário pode **Tentar novamente** ou **Falar com um analista** (caminho que não usa o modelo). Para uma demonstração longa, use uma chave com faturamento ou troque o modelo no seletor do chat.

**Rotas** (todas em inglês; os textos da interface são pt-BR): páginas `/login`, `/chat`, `/chat/[id]`, `/profile`, `/console`, `/console/[id]`; API em `/api/auth/*`, `/api/conversations/*` (mensagens em SSE, `handoff`), `/api/pending-actions/*` (editar, confirmar, cancelar rascunhos) e `/api/console/*` (listar, assumir, devolver, encerrar, responder).

---

## Arquitetura

Eu combinei **DDD** (modelagem do domínio do service desk), **Arquitetura Hexagonal** (portas e adaptadores) e **Clean Architecture** (dependências apontando para dentro). A regra é uma só e é **verificada pelo ESLint** (`no-restricted-imports` por camada): uma violação quebra o `pnpm check` em vez de depender de revisão.

```
   domain  ←  application  ←  infrastructure  ←  app (Next.js) / ui
  (regras)    (casos de uso     (adaptadores: Postgres,   (rotas HTTP, páginas,
               e PORTAS)         Mastra/Gemini, sessão,    componentes React)
                                 serviço de chamados)
```

- **`domain/`**: entidades, políticas (SLA, prioridade, duplicidade) e a máquina de estados. TypeScript puro, sem framework, banco ou LLM.
- **`application/`**: casos de uso e **portas** (interfaces). Só conhece o `domain`.
- **`infrastructure/`**: **adaptadores** das portas e o _composition root_ (`container.ts`), o único lugar que conhece classes concretas.
- **`app/` e `ui/`**: entrega. Rotas finas (validam com Zod, chamam um caso de uso, mapeiam erros para HTTP).

Contextos delimitados: `ticketing` (chamado, prioridade, SLA, duplicidade), `conversation` (conversa, mensagens, ação pendente, transferência), `agent` (o trace), `helpdesk` (artigos e busca) e `identity` (usuários e cobertura N1/N2).

O **serviço de chamados é um sistema legado externo**: o domínio só o conhece pela porta `TicketingGateway`. A implementação simulada vive em `infrastructure/ticketing`, com tabelas próprias, decorada por `Flaky` (indisponibilidade simulada) e `Retrying` (novas tentativas), sem que o agent saiba.

**Fluxo de uma mensagem:** a rota valida a sessão e o corpo, o caso de uso `SendEmployeeMessage` confere os limites e grava a mensagem, e só então chama o agent (se a conversa estiver com ele), enviando chips e texto por SSE. A resposta e o trace são persistidos; se a confiança for < 50%, a transferência acontece em código. Confirmar um rascunho **não passa pelo modelo**: é um `POST` disparado pelo botão.

---

## Como o agent decide o que fazer

**O modelo decide _o que fazer_; o código decide _se pode_.** As regras que não podem falhar (privacidade, confirmação, SLA, limites, silêncio durante transferência) estão no código e têm testes. O prompt as explica ao agent, mas nunca é a única proteção.

| Decisão                                                                                       | Quem decide                                                                           |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Entender a intenção, escolher ferramentas, o que perguntar, redigir título e descrição        | **Modelo**                                                                            |
| Prioridade e prazo (impacto × urgência → matriz; SLA em horas úteis)                          | **Código**: o modelo só informa impacto e urgência                                    |
| Criar, atualizar ou reabrir um chamado                                                        | **Código**, só após o botão Confirmar; o modelo apenas monta o rascunho               |
| Chamado aberto sobre o mesmo problema vira atualização; resolvido há ≤ 7 dias vira reabertura | **Código** (a ferramenta recusa duplicata; a confirmação tem uma 2ª rede de proteção) |
| Isolamento entre funcionários                                                                 | **Código**: o `userId` vem da sessão e nunca é parâmetro das ferramentas              |
| O agent responde ou fica em silêncio                                                          | **Código**: fora do estado `agent`, o modelo nem é chamado                            |
| Transferir em caso crítico ou baixa confiança                                                 | **Código**; a transferência por pedido do funcionário é uma ferramenta                |

**Ciclo de cada mensagem:** no primeiro passo o modelo é obrigado a chamar ferramentas (`toolChoice: required`) e o prompt pede `registrar_decisao` (entendimento, intenção, confiança, justificativa, regras) **em paralelo** com a primeira ferramenta. Se ele esquecer, o passo seguinte é **forçado** a registrá-la: nenhuma resposta fica sem decisão. Depois vêm as ferramentas necessárias (no máximo 8 passos) e uma resposta curta; os cartões (chamado, rascunho, lista) são desenhados pela interface a partir de blocos estruturados.

**Ferramentas:** `registrar_decisao`, `consultar_meus_chamados`, `consultar_chamado`, `buscar_central_de_ajuda`, `montar_rascunho_chamado`, `montar_atualizacao_chamado`, `perguntar_com_opcoes`, `transferir_para_analista` e `marcar_conversa_resolvida`. São envoltórios finos (Zod + delegação ao `AgentToolbox`). Falhas viram resultados tipados: se o serviço de chamados cai, a ferramenta devolve `SERVICO_DE_CHAMADOS_INDISPONIVEL`, o agent diz isso com honestidade e a falha aparece no trace.

**Transferência (Anexo A):** o funcionário pede (fila N1), caso crítico confirmado (N2, automático), chamado vencido (N2, o agent oferece e transfere se o funcionário aceitar) ou confiança < 50% (N1, automático). A transferência leva um **resumo do caso** e pausa o agent. Um analista N2 atende filas N1 e N2; um N1 não atende N2.

---

## Transparência

Cada mensagem do agent carrega um **trace** estruturado e persistido:

- **Chips** acima da resposta (`consultou seus chamados`, `classificou a prioridade`...), como no protótipo, mais "ver detalhes".
- **Painel lateral de detalhe:** o que entendeu e a intenção; a confiança (medidor, com o limite de 50%); por que agiu assim; regras aplicadas; cada ação expansível com **entrada, resultado, duração e erro**; e métricas (modelo, latência, tokens).
- **Respostas feitas por código** (confirmar, cancelar, transferência automática) também têm trace, marcadas como "regras determinísticas (sem LLM)".
- **O analista vê o mesmo trace** no console, além do resumo do caso e da confiança que motivou a transferência.

O trace é montado por um único componente (`TurnRecorder`) que cronometra cada ferramenta, então "o que o painel mostra" é "o que realmente aconteceu".

---

## Como garanto a qualidade das decisões

**170 testes automatizados em 19 arquivos**, em quatro níveis:

- **Domínio** (puro): calendário de dias úteis (09:43 + 4 h úteis = 13:43, como no protótipo), SLA, matriz de prioridade, duplicidade e janela de 7 dias, máquina de estados.
- **Aplicação** (adaptadores em memória): privacidade, nenhum chamado sem confirmação, duplicata que escapa do modelo é capturada, auto-transferência crítica, retry após queda do serviço, limites de 30 e 150/24 h, concorrência entre analistas.
- **Infraestrutura** (Postgres em memória, PGlite, com as migrações reais): repositórios, códigos sequenciais atômicos, escrita obsoleta rejeitada.
- **Agent** (loop Mastra real com modelo _mock_ roteirizado): decisão em paralelo e fallback forçado, rascunho sem criar, privacidade, falha do serviço, cota esgotada, trace completo.

Além disso: `tsc` com flags estritas, ESLint com as regras de camada e **`pnpm eval`**, que roda 11 cenários do PRD contra o **modelo real** (VPN 809 no Windows 11, status, chamado vencido, duplicidade, fora de escopo, privacidade, caso crítico, transferência, _prompt injection_). As checagens aceitam qualquer comportamento correto e rejeitam os nocivos, porque modelos não são determinísticos.

> **O que foi validado e o que não foi:** os testes e o fluxo ponta a ponta foram executados contra Postgres real e no navegador. O eval com o modelo real encontrou dois problemas que corrigi (resposta cortada pelo teto de tokens e lista de chamados que incluía um resolvido). Parte dos cenários não chegou a rodar por causa da cota gratuita; rode `pnpm eval` com uma chave com faturamento para o conjunto completo.

---

## Modelo, eficiência e custo

**Modelo:** Google Gemini Flash (`gemini-3.5-flash`, o padrão). Escolhi pelo custo baixo, pelo bom _tool calling_ e pela baixa latência. Um modelo pequeno basta porque as regras críticas estão no código. O padrão é trocável por `LLM_MODEL`, e o chat tem um **seletor de modelo** ao lado do campo de mensagem; o servidor só aceita nomes da lista `LLM_MODEL_OPTIONS`, para que ninguém gaste cota com um modelo arbitrário.

Controles de custo, todos no código:

- histórico limitado a 20 mensagens por chamada;
- uma única retentativa automática (em erro de cota cada retry gasta mais uma requisição);
- no máximo 8 passos por turno, `temperature` 0,2 e teto de 4096 tokens de saída por passo (o raciocínio interno do Gemini conta nesse teto);
- decisão junto da primeira ferramenta: **2 a 3 chamadas** por mensagem em vez de 3 a 4;
- respostas por código (confirmar, cancelar, transferir) custam zero;
- 30 mensagens por conversa e 150 por funcionário em 24 h;
- streaming dos chips e do texto, e tokens de cada turno visíveis no painel de detalhe.

Na camada gratuita os dados podem ser usados para melhoria dos produtos. É aceitável aqui porque todos os dados são fictícios; em produção real eu usaria um plano pago com retenção zero.

---

## Segurança e privacidade

- **Chaves fora do código:** só em variáveis de ambiente; `.env*` ignorado pelo git (apenas `.env.example`).
- **Isolamento estrutural:** cada ferramenta nasce ligada a um funcionário e a uma conversa; o modelo não consegue nomear outro usuário, nem por _prompt injection_. Chamado alheio e chamado inexistente devolvem a mesma resposta (sem oráculo de existência).
- **Confirmação só por botão:** o modelo não confirma nada por conta própria.
- **Sessão:** cookie `httpOnly`, `SameSite=Lax`, `Secure` em produção, JWT assinado; o **papel é relido do banco** a cada requisição. O `proxy.ts` é só a primeira barreira; a autorização real é refeita em cada rota.
- **Erros** inesperados nunca vazam para o cliente; **a saída do modelo é dado**, renderizada como nós React (sem HTML injetável).
- **Cabeçalhos de segurança** (`nosniff`, `X-Frame-Options: DENY`, referrer e permissions policy).

---

## Decisões e trade-offs

| #   | Decisão                                                                                     | Motivo                                                                           | Trade-off                                                                 |
| --- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1   | Hexagonal + DDD + Clean, dependência verificada por lint                                    | Trocar LLM, banco e serviço de chamados sem tocar nas regras; testabilidade      | Mais arquivos e indireção que um CRUD direto                              |
| 2   | Regras do Anexo A no domínio, não no prompt                                                 | SLA, duplicidade, confirmação e silêncio precisam ser garantidos                 | Exige ferramentas bem definidas                                           |
| 3   | TypeScript `strict` + `noUncheckedIndexedAccess`; `any` proibido por lint                   | Tipagem estrita além do mínimo                                                   | Mais verboso em acessos por índice                                        |
| 4   | Next.js 16 com `cacheComponents` desativado                                                 | Telas autenticadas e por usuário: nada seguro para cachear                       | Abre mão de uma otimização que não se aplica                              |
| 5   | Mastra atrás da porta `AgentPort`                                                           | Preferência do PRD; fica substituível                                            | Framework jovem                                                           |
| 6   | Postgres + Drizzle; driver escolhido pela URL (Neon HTTP em produção, `pg` local)           | Deploy 100% na Vercel; mesmo código em dev e produção                            | Sem transações multi-statement no driver HTTP; cada passo é independente  |
| 7   | Sessão por cookie assinado (`jose`), qualquer senha para usuários de exemplo                | O PRD pede login só para dados de exemplo                                        | Não é autenticação real; em produção seria SSO/OIDC                       |
| 8   | Limite de 30 = mensagens do funcionário, por conversa, só enquanto o agent responde         | O PRD não define "sessão"; controla custo sem bloquear a conversa com o analista | Interpretação minha, configurável                                         |
| 9   | Dias úteis seg–sex, 8h–18h, sem feriados; Crítica = 1 h corrida; fuso fixo UTC−3            | Anexos A e B; o Brasil não tem horário de verão desde 2019                       | Feriados ignorados                                                        |
| 10  | Confiança = autoavaliação do modelo, com limite de 50% aplicado em código                   | O PRD cita "confiança" sem defini-la                                             | Autoavaliação é imperfeita; por isso as regras de negócio têm precedência |
| 11  | SSE no chat, polling curto (2,5–3 s) no console                                             | Simples e robusto na Vercel                                                      | Não é _push_ verdadeiro; WebSocket seria a evolução                       |
| 12  | Fila da transferência por motivo (crítico e vencido → N2; pedido e baixa confiança → N1)    | O protótipo mostra "Suporte N2" para chamado vencido                             | Roteamento simples                                                        |
| 13  | Concorrência otimista (compare-and-set) em conversas                                        | Dois analistas não podem assumir a mesma conversa                                | O perdedor recebe 409 e recarrega                                         |
| 14  | Rede de segurança contra duplicidade no código, além da ferramenta                          | O modelo pode não notar um chamado aberto                                        | Heurística lexical; falso positivo vira atualização, nunca perda          |
| 15  | Serviço de chamados como módulo atrás de uma porta, não como API HTTP                       | Separação real sem a latência de chamadas entre funções serverless               | Em produção seria um cliente HTTP; só um adaptador muda                   |
| 16  | Relógio do SLA parte da última resposta de um analista (ou da criação)                      | "O prazo vale para a primeira resposta e para cada atualização"                  | Interpretação minha do Anexo A                                            |
| 17  | Falha de cota tem erro próprio e saída humana ("Tentar novamente", "Falar com um analista") | Um modelo fora do ar não pode deixar o funcionário sem ajuda                     | Um caso de uso e um endpoint a mais                                       |
| 18  | Seletor de modelo com lista permitida no servidor                                           | Comparar modelos e contornar a cota por modelo sem reiniciar                     | A lista é controlada por quem faz o deploy                                |
| 19  | pnpm, rotas/pastas/arquivos em inglês, rótulos neutros ("Chamados de Bruno")                | Convenção única de código; gênero nunca é inferido do nome                       | O protótipo chama o chat de "Atendimento": o rótulo da interface continua |

**Trade-offs assumidos:** autenticação simulada, feriados ignorados e "redefinir senha" apenas demonstrativa; busca na central de ajuda lexical (ótima para dezenas de artigos, insuficiente para milhares); confiança autoavaliada e não calibrada; serviço de chamados sem chaves de idempotência (em um legado real os retries de escrita precisariam delas).

---

## O que faria com mais tempo

1. **Avaliação contínua do agent:** `pnpm eval` agendado em CI, mais cenários, _LLM-as-judge_ para a qualidade do texto e métricas de custo por conversa.
2. **Busca semântica** na central de ajuda (embeddings com pgvector, no próprio Postgres).
3. **Observabilidade:** traces do Mastra exportados para OpenTelemetry e painel de custo e latência por turno.
4. **E2E com Playwright** dos fluxos principais e teste de carga do SSE.
5. **Calendário de feriados** configurável e SLA com pausa de relógio por "aguardando usuário".
6. **Tempo real de verdade** no console (SSE/WebSocket com pub-sub) e indicador de "digitando".
7. **Autenticação corporativa (OIDC)**, trilha de auditoria das ações do analista e limitação de taxa por IP.
8. **Resumo automático de conversas longas** em vez de truncar o histórico.

---

## Deploy

**Link:** https://nexo-assist-psi.vercel.app

- **Plataforma:** Vercel (front e API no mesmo projeto) + **Neon** (Postgres serverless). Variáveis de ambiente no painel da Vercel, nunca no repositório (modelo em `.env.example`); o schema e os dados de exemplo entram com `pnpm db:migrate` e `pnpm db:seed` apontando para o Neon.
- **CI/CD (GitHub Actions, `.github/workflows/deploy.yml`):** a cada push roda `pnpm check` (tipos, lint e testes); se passar, publica na Vercel pelo CLI. A `main` vai para produção e as demais branches geram _preview_. O deploy automático nativo da Vercel está desligado em `vercel.json` para não publicar duas vezes. Secrets no GitHub: `VERCEL_TOKEN`, `VERCEL_ORG_ID` e `VERCEL_PROJECT_ID`.
- **Proteção de chaves e de custo:** chaves só em variáveis de ambiente; 30 mensagens por conversa e 150 por funcionário em 24 h; `maxDuration` de 60 s na rota de mensagens, no máximo 8 passos por mensagem e teto de 4096 tokens de saída por passo; só modelos da lista do servidor são aceitos; cabeçalhos de segurança em `next.config.ts`.
- **Limitação conhecida:** com a chave gratuita do Gemini o limite é de ~20 requisições por dia por modelo (≈ 5 a 10 mensagens). Ao esgotar, o chat avisa, guarda a mensagem e oferece "Tentar novamente" e "Falar com um analista". Para uso contínuo, ative o faturamento no projeto do Google ou troque o modelo.
