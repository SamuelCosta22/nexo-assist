import { tokenize } from "../shared/text";

export interface Article {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly tags: readonly string[];
}

export interface RankedArticle {
  readonly article: Article;
  readonly score: number;
}

const TITLE_WEIGHT = 3;
const TAG_WEIGHT = 2;
const BODY_WEIGHT = 1;

/**
 * Lexical ranking over the (small) help-center. Title and tag matches weigh
 * more than body matches; the score is normalised by query size so results are
 * comparable across queries. Returns only articles with at least one match.
 */
export function rankArticles(
  query: string,
  articles: readonly Article[],
  limit = 3,
): RankedArticle[] {
  const queryTokens = [...new Set(tokenize(query))];
  if (queryTokens.length === 0) return [];

  const ranked = articles.map((article) => {
    const title = new Set(tokenize(article.title));
    const tags = new Set(article.tags.flatMap((tag) => tokenize(tag)));
    const body = new Set(tokenize(article.content));
    let raw = 0;
    for (const token of queryTokens) {
      if (title.has(token)) raw += TITLE_WEIGHT;
      if (tags.has(token)) raw += TAG_WEIGHT;
      if (body.has(token)) raw += BODY_WEIGHT;
    }
    return { article, score: raw / (queryTokens.length * (TITLE_WEIGHT + TAG_WEIGHT + BODY_WEIGHT)) };
  });

  return ranked
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
