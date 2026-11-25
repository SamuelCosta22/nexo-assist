import { describe, expect, it } from "vitest";
import { rankArticles, type Article } from "./article";

const articles: Article[] = [
  {
    id: "a1",
    title: "VPN com erro 809",
    content: "Reinstale o cliente de VPN. Vale apenas para Windows 10.",
    tags: ["vpn", "rede"],
  },
  {
    id: "a2",
    title: "Horário do service desk",
    content: "Segunda a sexta, das 8h às 18h. Críticos têm plantão 24 horas.",
    tags: ["horário", "plantão"],
  },
  {
    id: "a3",
    title: "Senha do SAP bloqueada",
    content: "Desbloqueio pelo portal de autoatendimento.",
    tags: ["sap", "senha", "acesso"],
  },
];

describe("rankArticles", () => {
  it("finds the article that matches the problem, ignoring accents and case", () => {
    expect(rankArticles("meu notebook não conecta na VPN, erro 809", articles)[0]?.article.id).toBe(
      "a1",
    );
    expect(rankArticles("qual o horario de atendimento?", articles)[0]?.article.id).toBe("a2");
  });

  it("returns nothing when no term matches", () => {
    expect(rankArticles("impressora sem toner", articles)).toEqual([]);
  });

  it("returns nothing for an empty query and honours the limit", () => {
    expect(rankArticles("   ", articles)).toEqual([]);
    expect(rankArticles("senha vpn horário", articles, 2)).toHaveLength(2);
  });
});
