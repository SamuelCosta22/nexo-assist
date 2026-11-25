import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { AGENT_INTENTS, type AgentDecision, type TraceAction } from "@/domain/agent/trace";
import type { MessageBlock } from "@/domain/conversation/message";
import { TicketingUnavailableError } from "@/application/errors";
import type { AgentToolbox, ToolOutcome } from "@/application/ports/agent-toolbox";
import type { IdGenerator } from "@/application/ports/id-generator";
import {
  CATEGORIES,
  IMPACTS,
  TICKET_TYPES,
  URGENCIES,
} from "@/domain/ticketing/vocabulary";

/**
 * Collects everything that happens during one agent turn: which tools ran,
 * what they did, the decision the model reported and the UI blocks to attach.
 * It is the single source of the decision trace.
 */
export class TurnRecorder {
  readonly actions: TraceAction[] = [];
  readonly blocks: MessageBlock[] = [];
  decision: AgentDecision | undefined;
  private flushed = 0;

  constructor(private readonly ids: IdGenerator) {}

  /** Runs one toolbox call, timing it and recording success or failure. */
  async run<T>(tool: string, input: unknown, call: () => Promise<ToolOutcome<T>>): Promise<T | { erro: string; detalhe: string }> {
    const started = Date.now();
    try {
      const outcome = await call();
      this.actions.push({
        id: this.ids.next(),
        tool,
        labels: outcome.labels,
        status: "ok",
        input,
        output: outcome.summary,
        durationMs: Date.now() - started,
      });
      if (outcome.blocks) this.blocks.push(...outcome.blocks);
      return outcome.data;
    } catch (error) {
      const unavailable = error instanceof TicketingUnavailableError;
      if (!unavailable) console.error(`[agent] tool ${tool} failed`, error);
      const detalhe = unavailable
        ? "O sistema de chamados está indisponível agora. Informe isso ao funcionário e ofereça tentar de novo ou chamar um analista."
        : "Falha interna ao executar a ferramenta. Não invente dados; ofereça chamar um analista.";
      this.actions.push({
        id: this.ids.next(),
        tool,
        labels: [unavailable ? "sistema de chamados indisponível" : "falhou ao executar"],
        status: "error",
        input,
        output: null,
        durationMs: Date.now() - started,
        error: unavailable ? "TICKETING_UNAVAILABLE" : "INTERNAL_ERROR",
      });
      return { erro: unavailable ? "SERVICO_DE_CHAMADOS_INDISPONIVEL" : "FALHA_INTERNA", detalhe };
    }
  }

  /** Actions finished since the last call; used to stream chips as they happen. */
  takeNewActions(): TraceAction[] {
    const fresh = this.actions.slice(this.flushed);
    this.flushed = this.actions.length;
    return fresh;
  }
}

const impactDescription =
  "Quem é afetado: individual (só o funcionário), team (a equipe dele), company (toda a empresa), unknown (não sabe).";
const urgencyDescription =
  "Urgência: blocking (impede o trabalho / algo parado), deadline_today (compromisso no mesmo dia em risco), workaround (atrapalha mas há alternativa), none (pedido ou melhoria sem urgência).";

/**
 * Mastra tool definitions. Deliberately thin: validate input with Zod, delegate
 * to the toolbox (application layer) and record the outcome. No business rule
 * lives here, and no tool takes a user id: the toolbox is already bound to one.
 */
export function buildTools(toolbox: AgentToolbox, recorder: TurnRecorder) {
  return {
    registrar_decisao: createTool({
      id: "registrar_decisao",
      description:
        "OBRIGATÓRIA como primeira ação de cada mensagem. Registra o que você entendeu e por que vai agir assim.",
      inputSchema: z.object({
        entendimento: z.string().max(400).describe("O que o funcionário quer, em uma frase."),
        intencao: z.enum(AGENT_INTENTS),
        confianca: z.number().min(0).max(1).describe("Quão seguro você está de saber o que fazer (0 a 1)."),
        justificativa: z.string().max(500).describe("Por que vai agir assim: qual é o plano e o motivo."),
        regras: z.array(z.string().max(200)).max(6).describe("Regras do service desk que se aplicam ao caso."),
      }),
      execute: async (input) => {
        recorder.decision = {
          understanding: input.entendimento,
          intent: input.intencao,
          confidence: input.confianca,
          rationale: input.justificativa,
          rulesApplied: input.regras,
        };
        return { registrado: true };
      },
    }),

    consultar_meus_chamados: createTool({
      id: "consultar_meus_chamados",
      description:
        "Lista os chamados do próprio funcionário, com status e se estão vencidos. Use mostrarLista=true para exibir uma lista selecionável.",
      inputSchema: z.object({
        somenteAbertos: z.boolean().default(true),
        mostrarLista: z.boolean().default(false),
      }),
      execute: async (input) =>
        recorder.run("consultar_meus_chamados", input, () =>
          toolbox.listMyTickets({ onlyOpen: input.somenteAbertos, showList: input.mostrarLista }),
        ),
    }),

    consultar_chamado: createTool({
      id: "consultar_chamado",
      description:
        "Detalha um chamado do funcionário pelo número (ex.: INC-20311), com prioridade, prazo de SLA e se está vencido.",
      inputSchema: z.object({ numero: z.string().describe("Código do chamado, ex.: INC-20311") }),
      execute: async (input) =>
        recorder.run("consultar_chamado", input, () => toolbox.getTicket({ ticketId: input.numero })),
    }),

    buscar_central_de_ajuda: createTool({
      id: "buscar_central_de_ajuda",
      description: "Busca artigos da central de ajuda. Use para dúvidas e antes de abrir chamado para problemas comuns.",
      inputSchema: z.object({ consulta: z.string().describe("Palavras-chave do problema, ex.: 'VPN erro 809'") }),
      execute: async (input) =>
        recorder.run("buscar_central_de_ajuda", input, () => toolbox.searchHelpCenter({ query: input.consulta })),
    }),

    montar_rascunho_chamado: createTool({
      id: "montar_rascunho_chamado",
      description:
        "Monta o rascunho de um NOVO chamado para o funcionário confirmar. O sistema calcula prioridade e prazo a partir de impacto e urgência; verifica duplicidade e avisa se já existe chamado sobre o assunto.",
      inputSchema: z.object({
        tipo: z.enum(TICKET_TYPES).describe("INC = algo parou/não funciona; REQ = pedido de acesso, equipamento ou software"),
        titulo: z.string().describe("Título objetivo, 8 a 120 caracteres"),
        descricao: z.string().describe("Descrição completa: o que acontece, desde quando, ambiente (ex.: Windows 11), mensagem de erro"),
        categoria: z.enum(CATEGORIES),
        subcategoria: z.string().optional(),
        impacto: z.enum(IMPACTS).describe(impactDescription),
        urgencia: z.enum(URGENCIES).describe(urgencyDescription),
      }),
      execute: async (input) =>
        recorder.run("montar_rascunho_chamado", input, () =>
          toolbox.draftTicket({
            type: input.tipo,
            title: input.titulo,
            description: input.descricao,
            category: input.categoria,
            subcategory: input.subcategoria,
            impact: input.impacto,
            urgency: input.urgencia,
          }),
        ),
    }),

    montar_atualizacao_chamado: createTool({
      id: "montar_atualizacao_chamado",
      description:
        "Monta o rascunho para ADICIONAR informação a um chamado existente do funcionário (ou reabri-lo, se resolvido há até 7 dias), para ele confirmar.",
      inputSchema: z.object({
        numero: z.string(),
        informacao: z.string().describe("A informação nova, escrita para o analista ler"),
      }),
      execute: async (input) =>
        recorder.run("montar_atualizacao_chamado", input, () =>
          toolbox.draftTicketUpdate({ ticketId: input.numero, information: input.informacao }),
        ),
    }),

    perguntar_com_opcoes: createTool({
      id: "perguntar_com_opcoes",
      description:
        "Mostra uma pergunta com botões de resposta rápida (2 a 5 opções). Depois disso, escreva a pergunta como sua resposta e encerre.",
      inputSchema: z.object({
        pergunta: z.string(),
        opcoes: z.array(z.string().max(40)).min(2).max(5),
      }),
      execute: async (input) =>
        recorder.run("perguntar_com_opcoes", input, () =>
          toolbox.askWithOptions({ question: input.pergunta, options: input.opcoes }),
        ),
    }),

    transferir_para_analista: createTool({
      id: "transferir_para_analista",
      description:
        "Transfere a conversa para um analista humano; você deixa de responder até ele devolver. Inclua um resumo completo do caso.",
      inputSchema: z.object({
        motivo: z.enum(["user_request", "critical_ticket", "overdue_ticket", "low_confidence"]).describe(
          "user_request: ele pediu; critical_ticket: algo parado para equipe/empresa; overdue_ticket: chamado vencido; low_confidence: você não tem segurança",
        ),
        resumo: z.string().describe("Resumo do caso para o analista: o que aconteceu, o que já foi tentado, chamado relacionado"),
        numeroChamado: z.string().optional(),
      }),
      execute: async (input) =>
        recorder.run("transferir_para_analista", input, () =>
          toolbox.transferToAnalyst({ reason: input.motivo, summary: input.resumo, ticketId: input.numeroChamado }),
        ),
    }),

    marcar_conversa_resolvida: createTool({
      id: "marcar_conversa_resolvida",
      description: "Marca a conversa como resolvida quando o funcionário confirma que o problema acabou.",
      inputSchema: z.object({}),
      execute: async () => recorder.run("marcar_conversa_resolvida", {}, () => toolbox.markConversationResolved()),
    }),
  };
}
