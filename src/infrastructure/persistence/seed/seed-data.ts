import type { AgentTrace } from "@/domain/agent/trace";
import type { MessageBlock } from "@/domain/conversation/message";
import type { HandoffRow } from "../schema";

/**
 * Sample data (Anexo B). Everything is expressed relative to `now`, so the demo
 * always shows the same story (an overdue ticket, one resolved 4 days ago that
 * can still be reopened, ...) no matter when the seed runs.
 */
export const EMPLOYEES = [
  { id: "u-ana", name: "Ana Souza", email: "ana.souza@nexo.com.br", department: "Financeiro" },
  {
    id: "u-carla",
    name: "Carla Mendes",
    email: "carla.mendes@nexo.com.br",
    department: "Financeiro",
  },
  {
    id: "u-bruno",
    name: "Bruno Tavares",
    email: "bruno.tavares@nexo.com.br",
    department: "Comercial",
  },
  { id: "u-diego", name: "Diego Ramos", email: "diego.ramos@nexo.com.br", department: "Operações" },
  { id: "u-elisa", name: "Elisa Prado", email: "elisa.prado@nexo.com.br", department: "Marketing" },
  { id: "u-fabio", name: "Fábio Nunes", email: "fabio.nunes@nexo.com.br", department: "Jurídico" },
  {
    id: "u-gabriela",
    name: "Gabriela Rocha",
    email: "gabriela.rocha@nexo.com.br",
    department: "Operações",
  },
] as const;

export const ANALYSTS = [
  {
    id: "an-rafael",
    name: "Rafael Lima",
    email: "rafael.lima@nexo.com.br",
    supportLevel: "Suporte N2",
  },
  { id: "an-bia", name: "Bia Campos", email: "bia.campos@nexo.com.br", supportLevel: "Suporte N1" },
] as const;

export const ARTICLES = [
  {
    id: "kb-vpn-809",
    title: "VPN com erro 809",
    content:
      "VPN com erro 809: reinstale o cliente de VPN pelo portal de softwares e reinicie o computador. Vale apenas para Windows 10; no Windows 11, abra um chamado.",
    tags: ["vpn", "rede", "erro 809", "windows"],
  },
  {
    id: "kb-horario",
    title: "Horário do service desk",
    content:
      "Horário do service desk: de segunda a sexta, das 8h às 18h. Chamados críticos têm plantão 24 horas.",
    tags: ["horário", "plantão", "atendimento", "crítico"],
  },
  {
    id: "kb-sap-senha",
    title: "Senha do SAP bloqueada",
    content:
      "Após 5 tentativas erradas a senha do SAP é bloqueada. O desbloqueio é feito pelo service desk em até 1 hora útil; abra um chamado de Acesso informando seu usuário SAP.",
    tags: ["sap", "senha", "bloqueio", "acesso"],
  },
  {
    id: "kb-outlook-celular",
    title: "Outlook não sincroniza no celular",
    content:
      "Remova a conta do aplicativo Outlook do celular, reinicie o aparelho e adicione a conta novamente com o e-mail corporativo. Se pedir aprovação, aceite a notificação do autenticador.",
    tags: ["outlook", "e-mail", "celular", "sincronização"],
  },
  {
    id: "kb-senha-rede",
    title: "Troca de senha da rede",
    content:
      "A senha da rede expira a cada 90 dias. Para trocar, use o portal de autoatendimento (senha.nexo.com.br) ou pressione Ctrl+Alt+Del no Windows e escolha Alterar senha.",
    tags: ["senha", "rede", "expiração", "autoatendimento"],
  },
  {
    id: "kb-wifi",
    title: "Wi-Fi corporativo",
    content:
      "Conecte-se à rede Nexo-Corp com seu e-mail e senha da rede. A rede Nexo-Visitantes é só para convidados e não acessa sistemas internos.",
    tags: ["wifi", "wi-fi", "rede", "senha"],
  },
  {
    id: "kb-impressora",
    title: "Impressora não imprime",
    content:
      "Verifique se a impressora está ligada e com papel, cancele trabalhos presos na fila e tente imprimir de novo. Para adicionar uma impressora, use o portal de softwares. Persistindo, abra um chamado de Hardware.",
    tags: ["impressora", "impressão", "hardware"],
  },
  {
    id: "kb-notebook-lento",
    title: "Notebook lento",
    content:
      "Reinicie o notebook, feche programas que não usa e libere espaço em disco (mantenha ao menos 15 GB livres). Se a lentidão começou após uma atualização do Windows e persiste, abra um chamado de Hardware.",
    tags: ["notebook", "lento", "lentidão", "windows", "atualização", "hardware"],
  },
  {
    id: "kb-equipamento",
    title: "Solicitar equipamento",
    content:
      "Pedidos de monitor, mouse, teclado e headset são abertos como requisição (REQ) e precisam de aprovação do gestor. Após aprovado, a entrega leva até 5 dias úteis.",
    tags: ["equipamento", "monitor", "mouse", "requisição", "home office"],
  },
  {
    id: "kb-teams-audio",
    title: "Teams sem áudio ou câmera",
    content:
      "No Teams, abra Configurações > Dispositivos e selecione o microfone e a câmera corretos. Se o dispositivo não aparece, reinicie o aplicativo e confira as permissões do Windows.",
    tags: ["teams", "áudio", "câmera", "reunião", "microfone"],
  },
  {
    id: "kb-pastas-compartilhadas",
    title: "Acesso a pastas compartilhadas e SharePoint",
    content:
      "Acesso a pastas de rede e SharePoint é solicitado por requisição (REQ) com aprovação do dono da pasta. Informe o caminho da pasta e o nível de acesso (leitura ou edição).",
    tags: ["pasta", "sharepoint", "acesso", "compartilhada", "permissão"],
  },
] as const;

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

type SeedTicket = {
  id: string;
  type: "INC" | "REQ";
  title: string;
  description: string;
  category: string;
  subcategory?: string;
  priority: "Crítica" | "Alta" | "Média" | "Baixa";
  status: "Novo" | "Em andamento" | "Aguardando analista" | "Aprovado" | "Resolvido";
  impact: "individual" | "team" | "company" | "unknown";
  requesterId: string;
  assignedGroup?: "Suporte N1" | "Suporte N2";
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
  updates: {
    id: string;
    authorKind: "requester" | "analyst" | "system";
    authorName: string;
    kind: "comment" | "status_change" | "reopened" | "transferred";
    note: string;
    createdAt: Date;
  }[];
};

export function buildTickets(now: Date): SeedTicket[] {
  const ago = (ms: number) => new Date(now.getTime() - ms);
  return [
    {
      id: "INC-20311",
      type: "INC",
      title: "Notebook lento após atualização do Windows",
      description:
        "Lentidão geral desde a atualização de 15/10. Reiniciar e rodar o diagnóstico da central não resolveu.",
      category: "Hardware",
      subcategory: "Notebook",
      priority: "Média",
      status: "Aguardando analista",
      impact: "individual",
      requesterId: "u-ana",
      createdAt: ago(9 * DAY),
      updatedAt: ago(6 * DAY),
      updates: [
        {
          id: "seed-u-1",
          authorKind: "analyst",
          authorName: "Rafael Lima",
          kind: "comment",
          note: "Recebi o chamado. Reinicie o notebook e rode o diagnóstico de disco; me conte o resultado.",
          createdAt: ago(6 * DAY),
        },
      ],
    },
    {
      id: "INC-20298",
      type: "INC",
      title: "Acesso à pasta Financeiro no SharePoint",
      description:
        "Perdi o acesso de edição à pasta Financeiro/Fechamento no SharePoint depois da troca de equipe.",
      category: "Acesso",
      subcategory: "SharePoint",
      priority: "Média",
      status: "Em andamento",
      impact: "individual",
      requesterId: "u-ana",
      createdAt: ago(10 * DAY),
      updatedAt: ago(1 * DAY),
      updates: [
        {
          id: "seed-u-2",
          authorKind: "analyst",
          authorName: "Bia Campos",
          kind: "comment",
          note: "Solicitei a aprovação do dono da pasta. Retorno amanhã.",
          createdAt: ago(1 * DAY),
        },
      ],
    },
    {
      id: "REQ-10442",
      type: "REQ",
      title: "Segundo monitor para home office",
      description: "Solicito um segundo monitor de 24 polegadas para trabalhar de casa.",
      category: "Hardware",
      subcategory: "Monitor",
      priority: "Baixa",
      status: "Aprovado",
      impact: "individual",
      requesterId: "u-ana",
      createdAt: ago(14 * DAY),
      updatedAt: ago(7 * DAY),
      updates: [
        {
          id: "seed-u-3",
          authorKind: "analyst",
          authorName: "Bia Campos",
          kind: "status_change",
          note: "Pedido aprovado pelo gestor. Aguardando disponibilidade de estoque.",
          createdAt: ago(7 * DAY),
        },
      ],
    },
    {
      id: "INC-20150",
      type: "INC",
      title: "Senha do SAP bloqueada",
      description: "Errei a senha do SAP várias vezes e a conta foi bloqueada.",
      category: "Acesso",
      subcategory: "SAP",
      priority: "Média",
      status: "Resolvido",
      impact: "individual",
      requesterId: "u-ana",
      createdAt: ago(6 * DAY),
      updatedAt: ago(4 * DAY),
      resolvedAt: ago(4 * DAY),
      updates: [
        {
          id: "seed-u-4",
          authorKind: "analyst",
          authorName: "Rafael Lima",
          kind: "status_change",
          note: "Conta desbloqueada e senha redefinida.",
          createdAt: ago(4 * DAY),
        },
      ],
    },
    {
      id: "INC-19877",
      type: "INC",
      title: "Outlook não sincroniza no celular",
      description: "O Outlook do celular parou de baixar novos e-mails.",
      category: "E-mail",
      priority: "Baixa",
      status: "Resolvido",
      impact: "individual",
      requesterId: "u-ana",
      createdAt: ago(84 * DAY),
      updatedAt: ago(83 * DAY),
      resolvedAt: ago(83 * DAY),
      updates: [],
    },
    {
      id: "INC-19410",
      type: "INC",
      title: "Troca de senha da rede",
      description: "Preciso trocar a senha da rede, que expirou.",
      category: "Acesso",
      priority: "Baixa",
      status: "Resolvido",
      impact: "individual",
      requesterId: "u-ana",
      createdAt: ago(137 * DAY),
      updatedAt: ago(136 * DAY),
      resolvedAt: ago(136 * DAY),
      updates: [],
    },
    {
      id: "INC-20440",
      type: "INC",
      title: "Acesso ao SAP para o fechamento mensal",
      description:
        "Preciso de acesso ao módulo de contabilidade do SAP ainda hoje para o fechamento.",
      category: "Acesso",
      subcategory: "SAP",
      priority: "Alta",
      status: "Aguardando analista",
      impact: "individual",
      requesterId: "u-carla",
      assignedGroup: "Suporte N1",
      createdAt: ago(2 * HOUR),
      updatedAt: ago(40 * MIN),
      updates: [],
    },
    {
      id: "INC-20502",
      type: "INC",
      title: "Cliente de VPN abre e fecha sozinho",
      description: "O cliente de VPN abre e fecha sozinho logo após o login, sem mostrar erro.",
      category: "Rede e VPN",
      priority: "Média",
      status: "Novo",
      impact: "individual",
      requesterId: "u-bruno",
      createdAt: ago(1 * DAY),
      updatedAt: ago(1 * DAY),
      updates: [],
    },
    {
      id: "INC-20530",
      type: "INC",
      title: "Sistema de vendas fora do ar para a equipe comercial",
      description:
        "Todo o time comercial recebe erro 503 ao abrir o sistema de vendas desde a manhã.",
      category: "Software",
      priority: "Crítica",
      status: "Em andamento",
      impact: "team",
      requesterId: "u-bruno",
      assignedGroup: "Suporte N2",
      createdAt: ago(5 * HOUR),
      updatedAt: ago(5 * HOUR),
      updates: [],
    },
    {
      id: "INC-20503",
      type: "INC",
      title: "Impressora do 3º andar não imprime",
      description: "A impressora do 3º andar mostra offline para todo o setor de operações.",
      category: "Hardware",
      subcategory: "Impressora",
      priority: "Média",
      status: "Em andamento",
      impact: "team",
      requesterId: "u-diego",
      createdAt: ago(1 * DAY),
      updatedAt: ago(3 * HOUR),
      updates: [
        {
          id: "seed-u-5",
          authorKind: "analyst",
          authorName: "Bia Campos",
          kind: "comment",
          note: "Reiniciei o servidor de impressão, acompanhando.",
          createdAt: ago(3 * HOUR),
        },
      ],
    },
    {
      id: "INC-20519",
      type: "INC",
      title: "Tela azul ao abrir o Teams",
      description: "O notebook mostra tela azul sempre que abro o Teams.",
      category: "Software",
      priority: "Alta",
      status: "Novo",
      impact: "individual",
      requesterId: "u-elisa",
      createdAt: ago(10 * MIN),
      updatedAt: ago(10 * MIN),
      updates: [],
    },
    {
      id: "INC-20372",
      type: "INC",
      title: "Teams sem áudio em reuniões",
      description: "Não consigo ouvir ninguém nas reuniões do Teams.",
      category: "Software",
      priority: "Baixa",
      status: "Resolvido",
      impact: "individual",
      requesterId: "u-fabio",
      createdAt: ago(3 * DAY),
      updatedAt: ago(2 * DAY),
      resolvedAt: ago(2 * DAY),
      updates: [],
    },
    {
      id: "INC-20488",
      type: "INC",
      title: "Senha do Wi-Fi corporativo",
      description: "Preciso da senha do Wi-Fi corporativo para o notebook novo.",
      category: "Rede e VPN",
      priority: "Baixa",
      status: "Resolvido",
      impact: "individual",
      requesterId: "u-gabriela",
      createdAt: ago(2 * DAY),
      updatedAt: ago(1 * DAY),
      resolvedAt: ago(1 * DAY),
      updates: [],
    },
  ];
}

export const TICKET_SEQUENCES = [
  { name: "INC", value: 20530 },
  { name: "REQ", value: 10442 },
] as const;

type SeedMessage = {
  id: string;
  role: "employee" | "agent" | "analyst" | "system";
  authorName?: string;
  content: string;
  blocks?: MessageBlock[];
  systemEvent?: "handoff" | "assumed" | "handed_back" | "closed" | "resolved";
  trace?: AgentTrace;
  at: Date;
};

type SeedConversation = {
  id: string;
  employeeId: string;
  title: string;
  status: "agent" | "awaiting_analyst" | "with_analyst" | "resolved" | "closed";
  handoff?: HandoffRow;
  employeeMessageCount: number;
  createdAt: Date;
  updatedAt: Date;
  messages: SeedMessage[];
};

const seedTrace = (
  understanding: string,
  intent: AgentTrace["decision"]["intent"],
  confidence: number,
  rationale: string,
  rules: string[],
  labels: string[] = [],
): AgentTrace => ({
  decisionReported: true,
  decision: { understanding, intent, confidence, rationale, rulesApplied: rules },
  actions: labels.map((label, i) => ({
    id: `seed-act-${label}-${i}`,
    tool: "seed",
    labels: [label],
    status: "ok",
    input: {},
    output: {},
    durationMs: 120,
  })),
  metrics: { model: "dados de exemplo", latencyMs: 900 },
});

export function buildConversations(now: Date): SeedConversation[] {
  const ago = (ms: number) => new Date(now.getTime() - ms);
  return [
    {
      id: "seed-c-carla",
      employeeId: "u-carla",
      title: "Preciso de acesso ao SAP ainda hoje",
      status: "awaiting_analyst",
      handoff: {
        reason: "user_request",
        summary:
          "Carla precisa de acesso ao módulo de contabilidade do SAP hoje para o fechamento (INC-20440).",
        targetGroup: "Suporte N1",
        requestedAt: ago(35 * MIN).toISOString(),
        ticketId: "INC-20440",
      },
      employeeMessageCount: 2,
      createdAt: ago(2 * HOUR),
      updatedAt: ago(35 * MIN),
      messages: [
        {
          id: "seed-m-c1",
          role: "employee",
          content: "Preciso de acesso ao SAP ainda hoje",
          at: ago(2 * HOUR),
        },
        {
          id: "seed-m-c2",
          role: "agent",
          authorName: "Nexo Assist",
          content:
            "Abri o INC-20440 com prioridade Alta. Um analista responde em até 4 horas úteis.",
          trace: seedTrace(
            "Pedido de acesso ao SAP com urgência no mesmo dia",
            "abrir_chamado",
            0.92,
            "Alta: afeta uma pessoa e há compromisso no mesmo dia.",
            ["Chamado só é criado após confirmação do funcionário"],
            ["consultou seus chamados", "classificou a prioridade", "criou o chamado"],
          ),
          at: ago(115 * MIN),
        },
        {
          id: "seed-m-c3",
          role: "employee",
          content: "Quero falar com um analista, é urgente.",
          at: ago(36 * MIN),
        },
        {
          id: "seed-m-c4",
          role: "system",
          systemEvent: "handoff",
          content: "Transferida para Suporte N1",
          at: ago(35 * MIN),
        },
      ],
    },
    {
      id: "seed-c-bruno",
      employeeId: "u-bruno",
      title: "Meu VPN abre e fecha sozinho",
      status: "awaiting_analyst",
      handoff: {
        reason: "low_confidence",
        summary:
          "Bruno relata que o cliente de VPN abre e fecha sozinho. O agent não encontrou artigo aplicável (confiança 41%).",
        targetGroup: "Suporte N1",
        requestedAt: ago(52 * MIN).toISOString(),
        confidence: 0.41,
      },
      employeeMessageCount: 1,
      createdAt: ago(55 * MIN),
      updatedAt: ago(52 * MIN),
      messages: [
        {
          id: "seed-m-b1",
          role: "employee",
          content: "Meu VPN abre e fecha sozinho, não aparece erro nenhum.",
          at: ago(55 * MIN),
        },
        {
          id: "seed-m-b2",
          role: "agent",
          authorName: "Nexo Assist",
          content: "Vou chamar um analista para isso.",
          trace: seedTrace(
            "Cliente de VPN fecha sozinho, sem código de erro",
            "duvida",
            0.41,
            "Nenhum artigo da central descreve esse sintoma e não há erro para pesquisar.",
            ["Transferência: o agent não tem segurança sobre o que fazer (Anexo A)"],
            ["buscou na central de ajuda", "transferiu para um analista"],
          ),
          at: ago(52 * MIN),
        },
        {
          id: "seed-m-b3",
          role: "system",
          systemEvent: "handoff",
          content: "Transferida para Suporte N1",
          at: ago(52 * MIN),
        },
      ],
    },
    {
      id: "seed-c-diego",
      employeeId: "u-diego",
      title: "A impressora do 3º andar não imprime",
      status: "agent",
      employeeMessageCount: 1,
      createdAt: ago(8 * MIN),
      updatedAt: ago(1 * MIN),
      messages: [
        {
          id: "seed-m-d1",
          role: "employee",
          content: "A impressora do 3º andar não imprime",
          at: ago(8 * MIN),
        },
        {
          id: "seed-m-d2",
          role: "agent",
          authorName: "Nexo Assist",
          content:
            "Já existe o INC-20503 aberto sobre a impressora do 3º andar e um analista está acompanhando. Quer acrescentar alguma informação?",
          trace: seedTrace(
            "Problema na impressora do 3º andar",
            "consultar_chamado",
            0.9,
            "Existe chamado aberto sobre o mesmo problema; não se abre duplicado.",
            ["Sem duplicidade: chamado aberto é atualizado, não duplicado"],
            ["consultou seus chamados"],
          ),
          at: ago(1 * MIN),
        },
      ],
    },
    {
      id: "seed-c-elisa",
      employeeId: "u-elisa",
      title: "Tela azul ao abrir o Teams",
      status: "agent",
      employeeMessageCount: 2,
      createdAt: ago(14 * MIN),
      updatedAt: ago(10 * MIN),
      messages: [
        {
          id: "seed-m-e1",
          role: "employee",
          content: "Meu notebook dá tela azul quando abro o Teams",
          at: ago(14 * MIN),
        },
        {
          id: "seed-m-e2",
          role: "agent",
          authorName: "Nexo Assist",
          content: "Pronto! Abri o INC-20519 com prioridade Alta.",
          trace: seedTrace(
            "Tela azul ao abrir o Teams",
            "abrir_chamado",
            0.9,
            "Alta: impede o trabalho de uma pessoa.",
            ["Chamado só é criado após confirmação do funcionário"],
            ["criou o chamado"],
          ),
          at: ago(10 * MIN),
        },
      ],
    },
    {
      id: "seed-c-fabio",
      employeeId: "u-fabio",
      title: "Teams sem áudio em reuniões",
      status: "resolved",
      employeeMessageCount: 2,
      createdAt: ago(3 * DAY),
      updatedAt: ago(2 * DAY),
      messages: [
        {
          id: "seed-m-f1",
          role: "employee",
          content: "Não consigo ouvir ninguém no Teams",
          at: ago(3 * DAY),
        },
        {
          id: "seed-m-f2",
          role: "agent",
          authorName: "Nexo Assist",
          content:
            "No Teams, abra Configurações > Dispositivos e selecione o microfone e a câmera corretos.",
          trace: seedTrace(
            "Teams sem áudio",
            "duvida",
            0.93,
            "A central de ajuda tem um artigo que resolve.",
            [],
            ["buscou na central de ajuda"],
          ),
          at: ago(3 * DAY - MIN),
        },
        {
          id: "seed-m-f3",
          role: "employee",
          content: "Isso resolveu, obrigado!",
          at: ago(2 * DAY),
        },
        {
          id: "seed-m-f4",
          role: "system",
          systemEvent: "resolved",
          content: "Resolvida pelo agent",
          at: ago(2 * DAY),
        },
      ],
    },
    {
      id: "seed-c-gabriela",
      employeeId: "u-gabriela",
      title: "Senha do Wi-Fi corporativo",
      status: "resolved",
      employeeMessageCount: 1,
      createdAt: ago(1 * DAY),
      updatedAt: ago(1 * DAY),
      messages: [
        {
          id: "seed-m-g1",
          role: "employee",
          content: "Qual é a senha do Wi-Fi?",
          at: ago(1 * DAY),
        },
        {
          id: "seed-m-g2",
          role: "agent",
          authorName: "Nexo Assist",
          content: "Conecte-se à rede Nexo-Corp com seu e-mail e a senha da rede.",
          trace: seedTrace(
            "Dúvida sobre acesso ao Wi-Fi",
            "duvida",
            0.95,
            "Resposta direta da central de ajuda.",
            [],
            ["buscou na central de ajuda"],
          ),
          at: ago(1 * DAY - MIN),
        },
        {
          id: "seed-m-g3",
          role: "system",
          systemEvent: "resolved",
          content: "Resolvida pelo agent",
          at: ago(1 * DAY - 2 * MIN),
        },
      ],
    },
  ];
}
