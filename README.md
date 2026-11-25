# Nexo Assist

Agent de atendimento do service desk de TI da Nexo. O funcionário descreve o problema com as próprias palavras; o agent consulta os chamados dele, busca na central de ajuda, abre/atualiza chamados (sempre com confirmação) e chama um analista quando precisa. Um console separado permite ao analista assumir a conversa.

> **Status:** setup inicial concluído (Fase 0). Os itens marcados com ⏳ neste README são preenchidos conforme as fases avançam. Ver [Roadmap](#roadmap).

---

## Como rodar

Pré-requisitos: Node.js >= 20.19 (testado com 22), npm, um banco Postgres no [Neon](https://neon.tech) (plano gratuito) e uma chave do [Google AI Studio](https://aistudio.google.com) (camada gratuita).

```bash
npm install
cp .env.example .env.local     # preencha DATABASE_URL, GOOGLE_GENERATIVE_AI_API_KEY, SESSION_SECRET
npm run db:migrate             # ⏳ Fase 1: cria o schema
npm run db:seed                # ⏳ Fase 1: funcionários, analistas, artigos e chamados de exemplo
npm run dev                    # http://localhost:3000
```

| Script                                       | O que faz                                                       |
| -------------------------------------------- | --------------------------------------------------------------- |
| `npm run dev` / `build` / `start`            | Next.js                                                         |
| `npm run check`                              | typecheck + lint + testes (o que roda antes de qualquer commit) |
| `npm test` / `test:watch` / `test:coverage`  | Vitest                                                          |
| `npm run typecheck`                          | `tsc --noEmit` em modo estrito                                  |
| `npm run lint`                               | ESLint, **incluindo as regras de dependência entre camadas**    |
| `npm run db:generate` / `migrate` / `studio` | Drizzle Kit                                                     |
| `npm run db:seed`                            | Popula os dados de exemplo (idempotente)                        |

---

## Arquitetura

Combinamos **DDD** (modelagem do domínio do service desk), **Arquitetura Hexagonal** (portas e adaptadores) e **Clean Architecture** (regra de dependência apontando para dentro). A regra é única:

```
   domain  ←  application  ←  infrastructure  ←  app (entrega Next.js) / ui
  (regras)    (casos de uso     (adapters: banco,     (rotas, páginas,
               e PORTAS)         LLM/Mastra, auth,     componentes React)
                                 serviço de chamados)
```

- **`domain/`**: entidades, value objects, políticas (SLA, duplicidade, máquina de estados da conversa). TypeScript puro: sem framework, sem banco, sem LLM, sem `zod`.
- **`application/`**: casos de uso (ex.: _ConfirmarRascunho_, _TransferirParaAnalista_) e as **portas** (interfaces) de que precisam: repositórios, gateway de chamados, central de ajuda, agent, relógio. Só conhece o `domain`.
- **`infrastructure/`**: **adaptadores** que implementam as portas: Drizzle/Neon, serviço de chamados simulado, agent Mastra + Gemini, sessão. Conhece `domain` e `application`.
- **`app/` e `ui/`**: entrega. Rotas/páginas Next.js e componentes React. `ui` fala com o backend por HTTP e nunca importa `infrastructure`.

A regra **é verificada pelo ESLint** (`no-restricted-imports` por camada em `eslint.config.mjs`), então uma violação quebra o `npm run check` em vez de depender de revisão humana.

### Bounded contexts (DDD)

| Contexto       | Responsabilidade                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------ |
| `identity`     | Usuários e papéis (`employee`, `analyst`)                                                        |
| `ticketing`    | Chamados, tipos, categorias, prioridade, SLA, duplicidade, reabertura                            |
| `helpdesk`     | Artigos da central de ajuda e busca                                                              |
| `conversation` | Conversa, mensagens, estados (agent / aguardando / analista), transferência, limite de mensagens |
| `agent`        | Decisão do agent e **trace** de transparência (ações, confiança, justificativa)                  |

O serviço de chamados é tratado como **sistema legado externo**: o domínio o enxerga só pela porta `TicketingGateway`; o adaptador simulado pode falhar de propósito para exercitar o tratamento de erro.

### Estrutura de pastas

```
src/
  domain/            núcleo puro (shared/, depois um diretório por contexto)
  application/       ports/ e use-cases/
  infrastructure/    config/, persistence/, ticketing/, agent/, auth/
  app/               rotas e páginas Next.js (camada de entrega)
  ui/                componentes React
scripts/             seed e utilitários de CLI
tests/               testes de integração/fluxo (unitários ficam ao lado do código)
```

---

## Decisões de arquitetura

Cada decisão relevante fica registrada aqui, com o motivo e o trade-off.

| #   | Decisão                                                                                                                                                                                   | Motivo                                                                                                                                                           | Trade-off / alternativa descartada                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Hexagonal + DDD + Clean Architecture**, com a regra de dependência verificada por lint                                                                                                  | O PRD avalia "separação entre interface, agent e serviços". Portas permitem trocar LLM, banco e serviço de chamados sem tocar nas regras                         | Mais arquivos/indireção que um CRUD direto; aceitável pelo ganho em testabilidade                                                                                                           |
| 2   | **Regras do Anexo A no domínio (código determinístico), não no prompt**                                                                                                                   | Prazo de SLA, duplicidade, confirmação antes de criar e silêncio do agent em transferência precisam ser **garantidos**, não "pedidos" ao modelo                  | O LLM decide _o que fazer_; o código decide _se pode_. Exige mais ferramentas (tools) bem definidas                                                                                         |
| 3   | **TypeScript `strict`** + `noUncheckedIndexedAccess`, `noImplicitOverride`, `noUnusedLocals/Parameters`, `verbatimModuleSyntax`; `any` proibido por lint                                  | Requisito do PRD ("tipagem estrita") levado além do mínimo                                                                                                       | Um pouco mais verboso em acessos a índices                                                                                                                                                  |
| 4   | **Next.js 16 (App Router)**                                                                                                                                                               | Sugestão do PRD; frontend e API num só deploy na Vercel                                                                                                          | Backend não fica isolado em outro serviço                                                                                                                                                   |
| 5   | **`cacheComponents` e `partialPrefetching` desativados** (vêm ligados no scaffold)                                                                                                        | Todas as telas são autenticadas e por usuário: não há nada seguro para cachear/prerender; ligá-los forçaria `Suspense` em todo acesso a cookie sem benefício     | Perde otimização que não se aplica a este produto                                                                                                                                           |
| 6   | **`proxy.ts`** (substitui `middleware` nesta versão do Next) para proteger rotas                                                                                                          | Convenção atual do framework (docs em `node_modules/next/dist/docs`)                                                                                             | Proxy é só a 1ª barreira; **autorização real é refeita nos casos de uso**                                                                                                                   |
| 7   | **Mastra** para o agent                                                                                                                                                                   | Preferência declarada no PRD; tools tipadas com Zod e workflows                                                                                                  | Framework jovem; isolado atrás da porta `Agent` para ser substituível                                                                                                                       |
| 8   | **Google Gemini Flash** como modelo padrão (`LLM_MODEL`)                                                                                                                                  | Camada gratuita, bom _tool calling_, baixa latência e custo, o que atende "eficiência/custo por conversa". Trocável por variável de ambiente                     | Camada gratuita tem limite de requisições e pode usar dados para treinamento; aceitável porque **todos os dados são fictícios**. Em produção real usaríamos um plano pago com retenção zero |
| 9   | **Postgres (Neon) + Drizzle ORM**                                                                                                                                                         | Permite deploy 100% na Vercel (SQLite exigiria disco persistente) e o mesmo banco em dev/prod. Drizzle: SQL tipado, leve, sem _engine_ nativa, boa em serverless | Dev local depende de rede (Neon); mitigação: branch de dev gratuito no Neon                                                                                                                 |
| 10  | **Sessão por cookie `httpOnly` assinado (`jose`)**, usuários seed aceitam qualquer senha                                                                                                  | O PRD pede login só para dados de exemplo; cookie assinado evita estado no servidor e é seguro por padrão                                                        | Não é autenticação real; em produção seria SSO/OIDC. Documentado como limitação                                                                                                             |
| 11  | **Isolamento entre funcionários na camada de dados**: o `userId` vem da sessão e é injetado nas _tools_ pelo servidor, **nunca** como parâmetro que o LLM possa escolher                  | Requisito de privacidade (Anexo A + "nunca expostos a outro"). Prompt injection não consegue pedir chamado alheio                                                | Tools não são "genéricas"; cada uma já nasce escopada ao usuário                                                                                                                            |
| 12  | **`Result<T, E>` para falhas de negócio**, exceções só para falhas inesperadas; `DomainError` com `code` estável                                                                          | Falhas esperadas viram fluxo tipado; o `code` alimenta o trace do agent e o mapeamento HTTP                                                                      | Um pouco mais de cerimônia que `throw`                                                                                                                                                      |
| 13  | **Variáveis de ambiente validadas com Zod**, com falha imediata e mensagem legível (`infrastructure/config/env.ts`)                                                                       | Evita segredo ausente virar erro obscuro; chaves nunca ficam no código                                                                                           | Parsing é _lazy_ para não exigir segredos no `next build`                                                                                                                                   |
| 14  | **Contagem de 30 mensagens = mensagens do funcionário, por conversa**                                                                                                                     | O PRD diz "30 mensagens por sessão" sem definir; contar só as do usuário é o que controla o custo                                                                | Interpretação nossa; limite configurável (`CHAT_MESSAGE_LIMIT`)                                                                                                                             |
| 15  | **Várias conversas por funcionário**, estilo ChatGPT/Claude                                                                                                                               | Decisão do produto (alinhada com o autor do desafio); suporta a história "voltar outro dia e continuar"                                                          | Exige lista de conversas no menu lateral (ajuste do protótipo, que mostra só uma)                                                                                                           |
| 16  | **SLA: dias úteis = seg–sex, 8h–18h, sem feriados; Crítica = 1h corridas (plantão 24h)**                                                                                                  | Segue o Anexo A e o artigo de exemplo do horário do service desk                                                                                                 | Feriados ignorados (documentado). Calendário configurável seria a evolução                                                                                                                  |
| 17  | **"Confiança" do agent = nota autoavaliada do modelo (0–1) combinada com regras; abaixo de 0,5 transfere**                                                                                | O PRD cita "confiança" nas telas mas não a define                                                                                                                | Autoavaliação de LLM é imperfeita; por isso as regras de negócio têm precedência e o valor é exibido no trace                                                                               |
| 18  | **Tempo real: SSE no chat; polling curto no console do analista**                                                                                                                         | SSE basta (fluxo servidor→cliente) e é simples na Vercel; polling é robusto para a lista do console                                                              | Não é _push_ verdadeiro no console; WebSocket seria a evolução                                                                                                                              |
| 19  | **Tokens de design extraídos do protótipo** (`nexo.pen`) para `globals.css`: fontes Schibsted Grotesk (UI), Newsreader (títulos), IBM Plex Mono (dados); paleta `ink`/`cta`/`rule`/`desk` | Fidelidade ao protótipo ("seguir layout e estilo")                                                                                                               | Três famílias de fonte aumentam o peso inicial; carregadas com `next/font` (self-hosted, sem layout shift)                                                                                  |
| 20  | **Testes onde fazem diferença**: domínio (SLA, duplicidade, estados), casos de uso e isolamento de dados; pouco mock de UI                                                                | Pedido do PRD ("testes onde fazem diferença")                                                                                                                    | Sem testes E2E de navegador por ora                                                                                                                                                         |

### Escolha do modelo ⏳

Detalhada na Fase 3 (custo por conversa, latência e por que um modelo "flash" é suficiente quando as regras críticas estão no código).

---

## ⏳ Como o agent decide o que fazer

Preenchido na Fase 3. Resumo previsto: o agent recebe a mensagem, escolhe _tools_, produz um **trace estruturado** (entendimento, ações com entrada/saída/duração, regras aplicadas, confiança e justificativa) que é persistido e exibido na UI (chips resumidos + painel de detalhe) e no console do analista.

## ⏳ Como garanti a qualidade das decisões

Preenchido nas Fases 3 e 7: regras no código, testes de domínio, cenários de avaliação do agent.

## ⏳ Principais trade-offs e o que faria com mais tempo

Consolidado na Fase 8.

---

## Segurança e privacidade

- Chaves apenas em variáveis de ambiente; `.env*` ignorado pelo git (só `.env.example` é versionado).
- Chamados de um funcionário nunca são expostos a outro (ver decisão 11).
- Mensagens de erro ao usuário não vazam detalhes internos.

## Roadmap

- [x] **Fase 0:** setup (Next 16, TS estrito, lint de camadas, Vitest, Drizzle config, tokens de design, README)
- [ ] **Fase 1:** domínio + dados (schema, seed, serviço de chamados simulado, central de ajuda, SLA)
- [ ] **Fase 2:** autenticação + layout (login, sidebar, perfil)
- [ ] **Fase 3:** agent Mastra + tools + guardrails + streaming
- [ ] **Fase 4:** UI do chat (chips, opções rápidas, seleção, rascunho, limite)
- [ ] **Fase 5:** transferência + console do analista
- [ ] **Fase 6:** transparência (trace persistido + painel de detalhe)
- [ ] **Fase 7:** testes finais e revisão de segurança
- [ ] **Fase 8:** README final + deploy (Vercel + Neon, com proteção de custo/abuso)
