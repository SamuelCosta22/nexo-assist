# Nexo Assist

Agent de atendimento do service desk de TI da Nexo. O funcionário descreve o problema com as próprias palavras; o agent consulta os chamados dele, busca na central de ajuda, abre ou atualiza chamados (sempre com confirmação) e chama um analista quando precisa. Um console separado permite ao analista assumir a conversa, e **cada resposta do agent é explicável**: o que entendeu, o que fez e por quê.

> **Status:** todas as funcionalidades do PRD estão implementadas. Falta apenas o **deploy** (ver [Deploy](#deploy)).

---

## Sumário

1. [Como rodar](#como-rodar)
2. [Histórias do PRD → onde estão atendidas](#histórias-do-prd--onde-estão-atendidas)
3. [Arquitetura](#arquitetura)
4. [Como o agent decide o que fazer](#como-o-agent-decide-o-que-fazer)
5. [Transparência: como entender cada resposta](#transparência-como-entender-cada-resposta)
6. [Como garanti a qualidade das decisões](#como-garanti-a-qualidade-das-decisões)
7. [Escolha do modelo, eficiência e custo](#escolha-do-modelo-eficiência-e-custo)
8. [Segurança e privacidade](#segurança-e-privacidade)
9. [Decisões de arquitetura](#decisões-de-arquitetura)
10. [Principais trade-offs e o que faria com mais tempo](#principais-trade-offs-e-o-que-faria-com-mais-tempo)
11. [Deploy](#deploy)

---

## Como rodar

Pré-requisitos: Node.js >= 20.19 (testado com 22), [pnpm](https://pnpm.io) 10 (`corepack enable` já o habilita), Docker (para o Postgres local) e uma chave do [Google AI Studio](https://aistudio.google.com) (veja o aviso de cota abaixo).

```bash
pnpm install
cp .env.example .env.local        # preencha GOOGLE_GENERATIVE_AI_API_KEY e SESSION_SECRET
docker compose up -d              # Postgres local na porta 54329
pnpm db:migrate                # cria as tabelas
pnpm db:seed                   # funcionários, analistas, artigos e chamados de exemplo
pnpm dev                       # http://localhost:3000
```

`SESSION_SECRET` pode ser gerado com `openssl rand -base64 32`. O `DATABASE_URL` do `.env.example` já aponta para o Postgres do `docker-compose.yml`. Sem Docker, crie um projeto gratuito no [Neon](https://neon.tech) e cole a connection string: o código escolhe o driver pela URL.

> **Cota do Gemini gratuito:** a camada gratuita permite poucas requisições por dia **por modelo** (na prática, 20). Cada mensagem do funcionário gasta de **2 a 4 chamadas** ao modelo, então a cota rende cerca de 5 a 10 mensagens por dia por modelo. Para uma demonstração confortável, ative o faturamento no Google Cloud (o custo de um modelo Flash neste volume é de centavos) ou alterne `LLM_MODEL` entre modelos Flash (cada um tem cota própria). Quando a cota acaba o app **não quebra**: a mensagem é salva, o funcionário vê "O assistente atingiu o limite de uso do modelo" e pode **Tentar novamente** ou **Falar com um analista** (esse caminho não usa o modelo).

**Contas de demonstração** (qualquer senha serve): `ana.souza@nexo.com.br` (funcionária) e `rafael.lima@nexo.com.br` (analista N2). A tela de login tem atalhos para as duas. Outros funcionários: `carla.mendes`, `bruno.tavares`, `diego.ramos`, `elisa.prado`, `fabio.nunes`, `gabriela.rocha` (todos `@nexo.com.br`); outra analista: `bia.campos` (N1).

**Dica para testar o console:** abra duas janelas (uma anônima), uma como Ana e outra como Rafael. Peça "quero falar com um analista" na conversa da Ana e acompanhe a transferência chegando ao console.

| Script                                                      | O que faz                                                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `pnpm dev` / `build` / `start`                              | Next.js                                                                               |
| `pnpm check`                                                | typecheck + lint (inclui regras de camadas) + testes: o que roda antes de cada commit |
| `pnpm test` / `test:watch` / `test:coverage`                | Vitest                                                                                |
| `pnpm eval`                                                 | 11 cenários do PRD contra o **modelo real** (precisa da chave)                        |
| `pnpm db:migrate` / `db:seed` / `db:generate` / `db:studio` | Banco (Drizzle). O seed é idempotente e reancora as datas dos chamados em "agora"     |
| `pnpm format`                                               | Prettier                                                                              |

Variáveis de ambiente (todas validadas com Zod na primeira leitura, com mensagem clara se faltar algo):

| Variável                                    | Para quê                                                                                                                                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                              | Postgres (Neon ou local)                                                                                                                                                                          |
| `GOOGLE_GENERATIVE_AI_API_KEY`, `LLM_MODEL` | Modelo do agent (padrão `gemini-3.5-flash`)                                                                                                                                                       |
| `LLM_MODEL_OPTIONS`                         | Modelos oferecidos no seletor do chat, separados por vírgula (o padrão é sempre incluído). Lista padrão: `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-2.5-flash`, `gemini-2.5-flash-lite` |
| `SESSION_SECRET`                            | Assina o cookie de sessão (mínimo 32 caracteres)                                                                                                                                                  |
| `TICKETING_FAILURE_RATE`                    | 0 a 1: chance de o serviço de chamados "legado" ficar indisponível numa chamada. Use `0.3` para ver o tratamento de falha ao vivo                                                                 |
| `CHAT_MESSAGE_LIMIT`                        | Mensagens do funcionário por conversa (padrão 30, regra do PRD)                                                                                                                                   |
| `DAILY_MESSAGE_LIMIT`                       | Mensagens por funcionário em 24 h (padrão 150): proteção de custo                                                                                                                                 |

---

## Histórias do PRD → onde estão atendidas

**Funcionário**

| #   | História                                                                   | Como é atendida                                                                                                                                                             |
| --- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Tirar uma dúvida sem abrir chamado                                         | Tool `buscar_central_de_ajuda` (ranking lexical sobre 11 artigos); o prompt manda responder só com base nos artigos e checar condições (ex.: "vale apenas para Windows 10") |
| 2   | Saber como está um chamado, mesmo sem lembrar o número, e se está atrasado | `consultar_meus_chamados` com lista selecionável e `consultar_chamado` com o veredito de SLA calculado **no domínio** (cartão com "prazo vencido")                          |
| 3   | Complementar um chamado aberto                                             | `montar_atualizacao_chamado` gera um rascunho de atualização; só o botão Confirmar aplica                                                                                   |
| 4   | Abrir chamado só conversando, conferindo antes                             | `montar_rascunho_chamado` → cartão com Confirmar / Editar / Cancelar. O código garante que nada é criado sem confirmação                                                    |
| 5   | Falar com um analista quando preferir ou for grave                         | `transferir_para_analista`; casos críticos e baixa confiança transferem automaticamente (em código)                                                                         |
| 6   | Voltar outro dia e continuar                                               | Conversas e mensagens persistem no Postgres; vários chats por funcionário na barra lateral                                                                                  |

**Analista** (console)

| #   | História                                                                        | Como é atendida                                                                                                                                    |
| --- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Receber chamados com tipo, categoria e prioridade corretos e descrição completa | Campos obrigatórios validados no domínio; prioridade derivada de impacto × urgência (matriz explícita); o resumo do caso acompanha a transferência |
| 2   | Ver as conversas que precisam dele, inclusive quando o agent não teve segurança | Abas Todas / Para você / Com o agent / Minhas com contadores; "Agent pediu ajuda · confiança 41%"                                                  |
| 3   | Assumir (agent pausado), devolver ao agent ou encerrar                          | Máquina de estados no domínio; só o analista dono da conversa responde, devolve ou encerra                                                         |

---

## Arquitetura

Combinamos **DDD** (modelagem do domínio do service desk), **Arquitetura Hexagonal** (portas e adaptadores) e **Clean Architecture** (regra de dependência apontando para dentro). A regra é única e **verificada pelo ESLint** (`no-restricted-imports` por camada), então uma violação quebra o `pnpm check` em vez de depender de revisão:

```
   domain  ←  application  ←  infrastructure  ←  app (entrega Next.js) / ui
  (regras)    (casos de uso     (adapters: Postgres,    (rotas HTTP, páginas,
               e PORTAS)         Mastra/Gemini, sessão,   componentes React)
                                 serviço de chamados)
```

- **`domain/`** (~1,1 mil linhas): entidades, políticas e a máquina de estados. TypeScript puro, sem framework, banco, LLM nem `zod`.
- **`application/`**: casos de uso e **portas** (interfaces). Só conhece o `domain`.
- **`infrastructure/`**: **adaptadores** que implementam as portas, mais o _composition root_ (`container.ts`), o único lugar que conhece classes concretas.
- **`app/` e `ui/`**: entrega. Rotas finas (validam com Zod, chamam um caso de uso, mapeiam erros para HTTP) e componentes que falam com o backend por HTTP.

### Contextos delimitados (DDD)

| Contexto       | Conteúdo                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ticketing`    | Chamado, tipos, categorias, prioridade (matriz impacto × urgência), SLA e calendário de dias úteis, política de duplicidade/reabertura, rascunho |
| `conversation` | Conversa, mensagens e blocos de UI, ação pendente (rascunho aguardando confirmação), estados e transferência                                     |
| `agent`        | O **trace**: entendimento, intenção, confiança, justificativa, regras e ações                                                                    |
| `helpdesk`     | Artigos e ranking de busca                                                                                                                       |
| `identity`     | Usuários, papéis e cobertura N1/N2                                                                                                               |

O **serviço de chamados é um sistema legado externo**: o domínio só o conhece pela porta `TicketingGateway`. A implementação simulada vive em `infrastructure/ticketing` (tabelas próprias) e é decorada por `Flaky` (indisponibilidade simulada) e `Retrying` (novas tentativas), em camadas, sem que o agent saiba.

### Fluxo de uma mensagem

```
Browser ──POST /api/conversations/:id/messages──► route (Zod, sessão)
   SendEmployeeMessage.begin   valida → limite de 30 msgs e 150/24h → grava a mensagem
   ◄── 200 text/event-stream ──┐
   SendEmployeeMessage.run     │ só chama o agent se a conversa estiver com o agent
     MastraAgentAdapter        │ ► chips (step) e texto (text_delta) em tempo real
       Agent + tools ──► AgentToolbox (application) ──► gateway / repositórios
     persiste a resposta + trace; se confiança < 50%, transfere (em código)
```

Confirmar um rascunho **não passa pelo modelo**: é um `POST /api/pending-actions/:id/confirm` disparado pelo botão.

### Rotas

Todas as rotas, pastas e arquivos do projeto usam nomes em inglês (os textos da interface continuam em pt-BR).

| Páginas                     | Quem        | O que é                          |
| --------------------------- | ----------- | -------------------------------- |
| `/login`                    | todos       | Entrada                          |
| `/chat`, `/chat/[id]`       | funcionário | Chat novo e conversa existente   |
| `/profile`                  | funcionário | Meu perfil                       |
| `/console`, `/console/[id]` | analista    | Lista de conversas e atendimento |

| API                                                                            | O que faz                                           |
| ------------------------------------------------------------------------------ | --------------------------------------------------- |
| `POST /api/auth/login`, `POST /api/auth/logout`                                | Sessão                                              |
| `GET/POST /api/conversations`, `GET /api/conversations/:id`                    | Listar, criar e abrir conversas (funcionário)       |
| `POST /api/conversations/:id/messages`                                         | Enviar mensagem (resposta em SSE) ou `{retry:true}` |
| `POST /api/conversations/:id/handoff`                                          | Pedir um analista sem passar pelo modelo            |
| `PATCH /api/pending-actions/:id`, `POST …/confirm`, `POST …/cancel`            | Editar, confirmar e cancelar rascunhos              |
| `GET /api/console/conversations`, `…/:id`, `…/:id/tickets`                     | Console: lista, conversa e chamados do funcionário  |
| `POST /api/console/conversations/:id/assume`, `hand-back`, `close`, `messages` | Console: assumir, devolver, encerrar e responder    |

### Estrutura de pastas

```
src/
  domain/          shared/ ticketing/ conversation/ agent/ helpdesk/ identity/
  application/     ports/ · use-cases/ · support/ (toolbox, handoff, acesso)
  infrastructure/  agent/ (Mastra) · persistence/ (Drizzle, seed) · ticketing/ · auth/ · config/ · container.ts
  app/             rotas e páginas Next.js · _server/ (auth, http, dto)
  ui/              chat/ console/ trace/ shell/ login/ profile/ lib/
scripts/           migrate, seed, eval-agent
pnpm-workspace.yaml  configuração do pnpm (scripts de build permitidos)
tests/             integração (in-memory e PGlite) e helpers
drizzle/           migrações SQL versionadas
```

---

## Como o agent decide o que fazer

**Princípio central: o modelo decide _o que fazer_; o código decide _se pode_.** Regras que não podem falhar (privacidade, confirmação, SLA, limites, silêncio durante transferência) estão no código e têm testes. O prompt as explica para o agent se comportar bem e se explicar, mas nunca é a única proteção.

### O que é do modelo e o que é do código

| Decisão                                                                                       | Quem decide                                                                                        |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Entender a intenção; quais ferramentas usar; o que perguntar; redigir título e descrição      | **Modelo**                                                                                         |
| Prioridade e prazo (impacto × urgência → matriz; SLA em horas úteis)                          | **Código**: o modelo só informa impacto e urgência, nunca escolhe a prioridade                     |
| Criar, atualizar ou reabrir um chamado                                                        | **Código**, e só após o botão Confirmar: o modelo apenas monta o rascunho                          |
| Chamado aberto sobre o mesmo problema vira atualização; resolvido há ≤ 7 dias vira reabertura | **Código** (a ferramenta de rascunho recusa duplicata; a confirmação tem uma 2ª rede de segurança) |
| Isolamento entre funcionários                                                                 | **Código**: o `userId` vem da sessão e nunca é parâmetro das ferramentas                           |
| O agent responde ou fica em silêncio                                                          | **Código**: se a conversa não está no estado `agent`, o modelo nem é chamado                       |
| Transferir por pedido do funcionário                                                          | Modelo (ferramenta), com o funcionário pedindo                                                     |
| Transferir em caso crítico ou baixa confiança                                                 | **Código** (ao confirmar um chamado Crítica; ao ver confiança < 50%)                               |

### Ciclo de cada mensagem

1. **Decisão obrigatória, sem chamada extra:** no primeiro passo o modelo é obrigado a chamar ferramentas (`toolChoice: required`) e o prompt pede `registrar_decisao` (entendimento, intenção, confiança, justificativa, regras) **em paralelo** com a primeira ferramenta de que precisar. Se o modelo a esquecer, o passo seguinte é **forçado** a registrá-la: nenhuma resposta fica sem decisão. É isso que alimenta a transparência.
2. O modelo usa as ferramentas necessárias (máximo de 8 passos). Uma consulta típica custa **2 chamadas** ao modelo (decisão + ferramenta juntas, depois a resposta); um rascunho, 3.
3. Responde em texto curto; cartões (chamado, rascunho, lista) são desenhados pela interface a partir de blocos estruturados, sem o modelo repetir o conteúdo.

### Ferramentas

`registrar_decisao` · `consultar_meus_chamados` · `consultar_chamado` · `buscar_central_de_ajuda` · `montar_rascunho_chamado` · `montar_atualizacao_chamado` · `perguntar_com_opcoes` · `transferir_para_analista` · `marcar_conversa_resolvida`.

São envoltórios finos (Zod + delegação ao `AgentToolbox` da camada de aplicação). Falhas viram resultados tipados: se o serviço de chamados está fora do ar, a ferramenta devolve `SERVICO_DE_CHAMADOS_INDISPONIVEL`, o modelo é instruído a dizer isso com honestidade (sem inventar dados) e a falha aparece no trace.

### Regras de transferência (Anexo A)

| Gatilho             | Mecanismo                                                                                                                | Fila       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------- |
| Funcionário pede    | Ferramenta `transferir_para_analista`                                                                                    | Suporte N1 |
| Caso crítico        | Automático ao confirmar um chamado com prioridade Crítica                                                                | Suporte N2 |
| Chamado vencido     | O agent **oferece** ("Falar com um analista / Adicionar informação / Não, obrigado"); transfere se o funcionário aceitar | Suporte N2 |
| Agent sem segurança | Automático quando a confiança autoavaliada é < 50%                                                                       | Suporte N1 |

A transferência leva um **resumo do caso**, move o chamado para o grupo e pausa o agent. Um analista N2 atende filas N1 e N2; um N1 não atende N2.

---

## Transparência: como entender cada resposta

(_"Esta é a parte mais importante do desafio."_) Cada mensagem do agent carrega um **trace** estruturado e persistido:

- **Resumo (como no protótipo):** chips acima da resposta (`consultou seus chamados`, `classificou a prioridade`, `montou o rascunho`...), mais "ver detalhes".
- **Painel de detalhe (lateral):** _O que entendeu_ e a intenção; _Confiança_ (medidor, com o limite de 50%); _Por que agiu assim_; _Regras aplicadas_; cada _ação_ expansível com **entrada, resultado, duração e erro**; _métricas_ (modelo, latência, tokens). Se o modelo pulou o registro da decisão, o painel avisa.
- **Respostas feitas por código** (confirmar um rascunho, cancelar, transferência automática) também têm trace, marcadas como "regras determinísticas (sem LLM)": toda mensagem do agent é explicável.
- **O analista vê o mesmo trace** no console ("ver decisão"), além do resumo do caso e da confiança que motivou a transferência.

O trace é montado por um único componente (`TurnRecorder`), que cronometra cada chamada de ferramenta, e é o que garante que "o que o painel mostra" é "o que realmente aconteceu".

---

## Como garanti a qualidade das decisões

**170 testes automatizados em 19 arquivos**, em quatro níveis:

| Nível                                                                         | O que cobre                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Domínio** (puro, rápido)                                                    | Calendário de dias úteis (09:43 + 4 h úteis = 13:43, como no protótipo), SLA por prioridade, matriz de prioridade, duplicidade e janela de 7 dias, máquina de estados, rascunhos e edição, ranking da central de ajuda                                                                                                       |
| **Aplicação** (adaptadores em memória)                                        | Privacidade (um chamado alheio é indistinguível de um inexistente), nenhum chamado sem confirmação, duplicata que escapa do modelo é capturada, auto-transferência crítica, retry após queda do serviço, escalada por baixa confiança, limites de 30 mensagens e 150/24 h, janela de histórico, concorrência entre analistas |
| **Infraestrutura** (Postgres real em memória, PGlite, com as migrações reais) | Repositórios, códigos sequenciais atômicos, escrita obsoleta rejeitada, ordem das mensagens, JSON, seed e decoradores de resiliência                                                                                                                                                                                         |
| **Agent** (loop Mastra real com modelo _mock_ roteirizado)                    | decisão em paralelo (2 chamadas por consulta) e fallback forçado, ferramentas ligadas, rascunho sem criar, privacidade, falha do serviço, cota esgotada × queda genérica, trace completo e histórico → mensagens do modelo                                                                                                   |

Além disso: `tsc --noEmit` com flags estritas, ESLint com as regras de camada, e **`pnpm eval`**: 11 cenários do PRD contra o **modelo real** (VPN 809 no Windows 11, status e chamado vencido, duplicidade, fora de escopo, privacidade, caso crítico, transferência, _prompt injection_). As checagens aceitam qualquer comportamento correto e rejeitam os nocivos, porque modelos são não determinísticos. Cada cenário gasta de 2 a 4 chamadas, então a suíte inteira (~30) **não cabe na cota gratuita diária de um modelo**: rode-a com faturamento ativo ou em dias separados (`LLM_MODEL` por rodada).

> **Transparência sobre o que foi validado:** os testes automatizados e o fluxo ponta a ponta (login, chat, rascunho, confirmação, console) foram executados contra Postgres real e no navegador. O ciclo do agent foi validado com modelo _mock_; os cenários com o **modelo real** estão em `pnpm eval` e dependem da chave de API.

---

## Escolha do modelo, eficiência e custo

**Modelo:** Google Gemini Flash (`gemini-3.5-flash`, id do registro de modelos do Mastra instalado). Motivos: custo muito baixo, bom _tool calling_ e baixa latência (existe camada gratuita, mas ela é pequena: veja o aviso de cota). Por design **um modelo pequeno basta**, porque as regras críticas estão no código e não dependem de raciocínio sofisticado. O modelo padrão é trocável por `LLM_MODEL` (e, no Mastra, por qualquer provedor). Para **testar outros modelos sem reiniciar**, o chat tem um **seletor de modelo ao lado do campo de mensagem**: a escolha vale por mensagem, é lembrada no navegador e aparece no painel de detalhe ("Modelo"). O servidor só aceita nomes da lista `LLM_MODEL_OPTIONS`; qualquer outro é recusado, para que ninguém consiga gastar cota ou dinheiro com um modelo arbitrário.

Controles de custo e latência, todos no código:

- **Histórico limitado a 20 mensagens** por chamada; blocos de UI viram uma linha de texto para o modelo.
- **Uma única retentativa** automática por chamada ao modelo: em erro de cota (429) cada retry gasta mais uma requisição e não adianta.
- **Máximo de 8 passos** por turno, `temperature` 0,2 e **900 tokens** de saída.
- **Decisão junto da primeira ferramenta:** transparência garantida sem uma ida e volta extra ao modelo (de 3-4 para **2-3 chamadas** por mensagem).
- **Respostas por código sem LLM** (confirmar, cancelar, transferência automática): custo zero.
- **Limites:** 30 mensagens por conversa e 150 por funcionário em 24 h; só mensagens que o agent responderia contam.
- **Streaming** dos chips e do texto: a primeira resposta aparece antes do fim do turno.
- Os tokens de cada turno aparecem no painel de detalhe, então o custo por conversa é observável.

Trade-off da camada gratuita: o limite diário é baixo (≈20 requisições por modelo) e, no plano gratuito, os dados podem ser usados para melhoria dos produtos. É aceitável porque **todos os dados são fictícios**; em produção real usaríamos um plano pago com retenção zero.

---

## Segurança e privacidade

- **Chaves fora do código:** só em variáveis de ambiente; `.env*` ignorado pelo git (apenas `.env.example`); validação com Zod na inicialização.
- **Isolamento entre funcionários é estrutural:** cada ferramenta do agent nasce ligada a um funcionário e a uma conversa; o modelo não tem como nomear outro usuário, nem por _prompt injection_. Chamado alheio e chamado inexistente devolvem exatamente a mesma resposta (sem oráculo de existência). A regra de acesso fica num único lugar (`assertCanViewTicket`).
- **Confirmação só por botão:** o modelo não consegue "confirmar" nada por conta própria.
- **Sessão:** cookie `httpOnly`, `SameSite=Lax`, `Secure` em produção, JWT assinado (HS256, com emissor verificado); só o id do usuário vai no token, e o **papel é relido do banco** a cada requisição. O `proxy.ts` é só a primeira barreira; a autorização real é refeita em cada rota e caso de uso.
- **Erros:** mensagens inesperadas nunca vazam para o cliente (teste dedicado); detalhes ficam no log.
- **Saída do modelo é dado:** renderizada como nós React (sem HTML injetável); o prompt manda ignorar instruções contidas em mensagens e artigos.
- **Cabeçalhos de segurança** (`nosniff`, `X-Frame-Options: DENY`, referrer e permissions policy) e limites de uso (30/conversa, 150/24 h).

---

## Decisões de arquitetura

| #   | Decisão                                                                                                                                    | Motivo                                                                                                                                                                        | Trade-off / alternativa descartada                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Hexagonal + DDD + Clean**, dependência verificada por lint                                                                               | O PRD avalia "separação entre interface, agent e serviços". Portas permitem trocar LLM, banco e serviço de chamados sem tocar nas regras                                      | Mais arquivos e indireção que um CRUD direto; compensa em testabilidade                                                                         |
| 2   | **Regras do Anexo A no domínio, não no prompt**                                                                                            | SLA, duplicidade, confirmação e silêncio do agent precisam ser **garantidos**                                                                                                 | O LLM decide _o quê_; o código decide _se pode_. Exige ferramentas bem definidas                                                                |
| 3   | **TypeScript `strict`** + `noUncheckedIndexedAccess`, `noImplicitOverride`, `verbatimModuleSyntax`; `any` proibido por lint                | "Tipagem estrita" levada além do mínimo                                                                                                                                       | Mais verboso em acessos por índice                                                                                                              |
| 4   | **Next.js 16 (App Router)**                                                                                                                | Sugestão do PRD; front e API num só deploy                                                                                                                                    | Backend não fica isolado em outro serviço                                                                                                       |
| 5   | **`cacheComponents` desativado** (vem ligado no scaffold)                                                                                  | Todas as telas são autenticadas e por usuário: nada seguro para cachear                                                                                                       | Abre mão de uma otimização que não se aplica                                                                                                    |
| 6   | **`proxy.ts`** (substitui `middleware` nesta versão) como 1ª barreira                                                                      | Convenção atual do framework                                                                                                                                                  | Autorização real refeita nas rotas                                                                                                              |
| 7   | **Mastra** para o agent, atrás da porta `AgentPort`                                                                                        | Preferência declarada no PRD                                                                                                                                                  | Framework jovem; isolado para ser substituível                                                                                                  |
| 8   | **Gemini Flash** (`LLM_MODEL`)                                                                                                             | Baixo custo, bom em tools (há camada gratuita, porém pequena)                                                                                                                 | Cota gratuita ≈20 req/dia por modelo: use faturamento ou alterne modelos                                                                        |
| 9   | **Postgres + Drizzle**; driver escolhido pela URL (Neon HTTP em produção, `pg` local)                                                      | Deploy 100% na Vercel (SQLite exigiria disco persistente); mesmo código em dev e produção                                                                                     | Sem transações multi-statement no driver HTTP; cada passo é independente e seguro                                                               |
| 10  | **Sessão por cookie assinado (`jose`)**, qualquer senha para usuários de exemplo                                                           | O PRD pede login só para dados de exemplo                                                                                                                                     | Não é autenticação real; em produção seria SSO/OIDC                                                                                             |
| 11  | **Isolamento por construção** (toolbox ligado ao funcionário)                                                                              | Privacidade não pode depender do prompt                                                                                                                                       | Ferramentas não são genéricas                                                                                                                   |
| 12  | **`Result<T,E>` para falhas de negócio**, `DomainError` com `code` estável                                                                 | Falhas esperadas viram fluxo tipado; o código alimenta o trace e o status HTTP                                                                                                | Mais cerimônia que `throw`                                                                                                                      |
| 13  | **Variáveis validadas com Zod** (falha rápida, mensagem legível), leitura _lazy_                                                           | Segredo ausente não vira erro obscuro; o `build` não exige segredos                                                                                                           | —                                                                                                                                               |
| 14  | **Limite de 30 mensagens = mensagens do funcionário, por conversa**; só conta enquanto o agent responde                                    | O PRD não define "sessão"; isso controla o custo sem bloquear a conversa com o analista                                                                                       | Interpretação nossa, configurável                                                                                                               |
| 15  | **Várias conversas por funcionário** (estilo ChatGPT)                                                                                      | Decisão do produto; suporta "voltar outro dia"                                                                                                                                | Acrescenta uma lista de conversas ao menu do protótipo                                                                                          |
| 16  | **Dias úteis: seg–sex, 8h–18h, sem feriados; Crítica = 1 h corrida** (plantão 24 h). Fuso fixo UTC−3                                       | Anexo A e Anexo B. O Brasil não tem horário de verão desde 2019, então o offset fixo é exato                                                                                  | Feriados ignorados; um calendário configurável seria a evolução                                                                                 |
| 17  | **Confiança = autoavaliação do modelo, com limite de 50% aplicado em código**                                                              | O PRD cita "confiança" sem defini-la                                                                                                                                          | Autoavaliação é imperfeita; por isso as regras de negócio têm precedência e o valor é exibido                                                   |
| 18  | **SSE no chat; polling curto no console**                                                                                                  | SSE basta (servidor → cliente) e é simples na Vercel; polling é robusto para listas                                                                                           | Não é _push_ verdadeiro no console; WebSocket seria a evolução                                                                                  |
| 19  | **Tokens de design extraídos do protótipo** (`nexo.pen`): Schibsted Grotesk, Newsreader, IBM Plex Mono                                     | Fidelidade ao protótipo                                                                                                                                                       | Três famílias de fonte (carregadas com `next/font`, sem layout shift)                                                                           |
| 20  | **Testes onde fazem diferença**: domínio, casos de uso, repositórios em Postgres real, loop do agent                                       | Pedido do PRD                                                                                                                                                                 | Sem E2E de navegador automatizado                                                                                                               |
| 21  | **Fila da transferência por motivo:** crítico e vencido → N2; pedido e baixa confiança → N1; N2 atende N1, N1 não atende N2                | O protótipo mostra "Suporte N2" para chamado vencido                                                                                                                          | Roteamento simples; poderia ser configurável                                                                                                    |
| 22  | **"Redefinir senha" só registra o pedido** (sem e-mail real)                                                                               | A tela existe no protótipo, não no PDF; enviar e-mail está fora do escopo                                                                                                     | Funcionalidade demonstrativa                                                                                                                    |
| 23  | **Confirmação exclusivamente por botão** (ou ⌘/Ctrl+Enter)                                                                                 | Um modelo não deve poder confirmar por texto ("sim, pode criar")                                                                                                              | Se o funcionário escreve "confirmo", o agent o orienta a clicar                                                                                 |
| 24  | **Respostas determinísticas também têm trace**                                                                                             | Toda mensagem do agent é explicável                                                                                                                                           | Registro mais verboso                                                                                                                           |
| 25  | **Concorrência otimista (compare-and-set)** em conversas                                                                                   | Dois analistas não podem assumir a mesma conversa                                                                                                                             | O perdedor recebe 409 e recarrega                                                                                                               |
| 26  | **Rede de segurança contra duplicidade no código**, além da ferramenta                                                                     | O modelo pode falhar em notar um chamado aberto                                                                                                                               | Uma heurística lexical; falso positivo vira atualização, nunca perda                                                                            |
| 27  | **Decisão obrigatória em paralelo** com a 1ª ferramenta (`toolChoice: required`); se faltar, o passo seguinte a força                      | Transparência não é opcional, mas forçar um passo só para ela custava +1 chamada por mensagem (a cota gratuita acabou em ~5 mensagens)                                        | A decisão é do plano, registrada antes de agir; se o modelo ignorar o prompt, custa 1 chamada extra naquele turno                               |
| 28  | **Teto de 150 mensagens por funcionário em 24 h**                                                                                          | Proteção de custo e abuso num deploy público                                                                                                                                  | Valor fixo configurável                                                                                                                         |
| 29  | **Serviço de chamados como módulo atrás de uma porta**, não como API HTTP separada                                                         | Separação real (tabelas e código próprios, só a porta o enxerga), sem a latência e a complexidade de chamadas entre funções serverless                                        | Em produção seria um cliente HTTP; só um adaptador muda                                                                                         |
| 30  | **Relógio do SLA parte da última resposta de um analista** (ou da criação)                                                                 | "O prazo vale para a primeira resposta e para cada atualização"; comentário do funcionário não para o relógio                                                                 | Interpretação nossa do Anexo A                                                                                                                  |
| 31  | **Sidebar atualizada por evento, não por `router.refresh()`**                                                                              | O refresh remontava o chat e engolia o erro do agent (bug encontrado em teste visual)                                                                                         | Um barramento de eventos minúsculo                                                                                                              |
| 32  | **Rótulos neutros em pt-BR** ("Chamados de Bruno")                                                                                         | Gênero nunca é inferido do nome; o protótipo usa "da Ana"                                                                                                                     | Pequeno desvio do protótipo                                                                                                                     |
| 33  | **Retry do agent sem duplicar** a mensagem nem gastar o limite                                                                             | Se o modelo falha, a mensagem já está salva                                                                                                                                   | Caminho extra no caso de uso                                                                                                                    |
| 34  | **Mobile mínimo funcional** (barra no chat; mestre/detalhe no console)                                                                     | O PRD pede desktop; o resto é cuidado                                                                                                                                         | Não é um design mobile completo                                                                                                                 |
| 35  | **Falha de cota tem erro próprio e saída humana**: mensagem clara, "Tentar novamente" e "Falar com um analista" **sem passar pelo modelo** | Um modelo fora do ar não pode deixar o funcionário sem ajuda                                                                                                                  | Mais um caso de uso e endpoint (`/handoff`)                                                                                                     |
| 36  | **Seletor de modelo no chat, com lista permitida no servidor** (`LLM_MODEL_OPTIONS`)                                                       | Comparar modelos e contornar cota por modelo sem reiniciar                                                                                                                    | Quem usa pode gastar mais com um modelo caro: a lista é controlada por quem faz o deploy; a escolha é por navegador                             |
| 37  | **pnpm** como gerenciador (`packageManager` fixado, `pnpm-lock.yaml`)                                                                      | Instalação mais rápida e `node_modules` baseado em _hard links_ de um store global, compartilhado entre projetos; dependências estritas (sem importar pacotes não declarados) | Quem usa npm precisa de pnpm (`corepack enable`). Removi também `@ai-sdk/google` (o Mastra já traz o provedor) e movi `ai` para devDependencies |
| 38  | **Rotas, pastas e arquivos em inglês** (`/chat`, `/profile`, `/console`)                                                                   | Convenção única de código; só os textos da interface são pt-BR                                                                                                                | O PDF e as telas do protótipo chamam o chat de "Atendimento": o rótulo da interface continua assim                                              |

---

## Principais trade-offs e o que faria com mais tempo

**Trade-offs assumidos**

- Autenticação simulada, feriados ignorados e "redefinir senha" demonstrativa (decisões 10, 16, 22).
- Busca na central de ajuda **lexical**: ótima para um acervo de dezenas de artigos, insuficiente para milhares.
- O console usa **polling** (2,5–3 s). Para dezenas de analistas, SSE/WebSocket com _pub-sub_.
- A confiança é **autoavaliada** pelo modelo, não calibrada.
- O serviço de chamados é um módulo, não uma API HTTP; sem chaves de idempotência (em um legado real, retries de escrita precisariam delas).

**Com mais tempo**

1. **Avaliação contínua do agent:** rodar `pnpm eval` em CI agendado com um conjunto maior de cenários, `LLM-as-judge` para a qualidade do texto e métricas de custo por conversa.
2. **Busca semântica** na central de ajuda (embeddings com pgvector, no próprio Postgres).
3. **Observabilidade:** traces do Mastra exportados para OpenTelemetry, painel de custo e latência por turno.
4. **E2E com Playwright** dos fluxos principais; teste de carga do SSE.
5. **Calendário de feriados** configurável e SLA com pausa de relógio por "aguardando usuário".
6. **Tempo real de verdade** no console e indicador de "digitando".
7. **Autenticação corporativa (OIDC)**, trilha de auditoria de ações do analista e limitação de taxa por IP.
8. **Resumo automático de conversas longas** em vez de truncar o histórico.

---

## Deploy

⏳ Será preenchido ao final: plataforma, como foi publicado (Vercel + Neon), variáveis necessárias e como as chaves e o uso estão protegidos (limites por conversa e por 24 h, `maxDuration`, tetos de tokens, `.env` fora do repositório).
