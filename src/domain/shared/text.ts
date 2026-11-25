/**
 * Text helpers shared by the help-desk search and duplicate detection.
 * Portuguese-aware but dependency-free: accents are stripped, a handful of
 * stop-words are dropped and plurals are folded, which is enough for the small
 * knowledge base this product works with.
 */
const STOP_WORDS = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "em",
  "no",
  "na",
  "nos",
  "nas",
  "um",
  "uma",
  "uns",
  "umas",
  "que",
  "com",
  "para",
  "por",
  "como",
  "meu",
  "minha",
  "meus",
  "minhas",
  "ele",
  "ela",
  "ja",
  "mas",
  "nao",
  "sem",
  "ser",
  "foi",
  "esta",
  "estou",
  "tem",
  "ter",
  "desde",
  "ontem",
  "hoje",
  "uso",
  "usar",
  "quando",
  "pelo",
  "pela",
  "ao",
  "aos",
  "as",
  "os",
  "se",
  "ou",
  "e",
  "o",
  "a",
]);

export function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function stem(token: string): string {
  return token.length > 4 && token.endsWith("s") ? token.slice(0, -1) : token;
}

export function tokenize(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token))
    .map(stem);
}

/** Jaccard similarity between the token sets of two texts (0 to 1). */
export function similarity(a: string, b: string): number {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));
  if (setA.size === 0 || setB.size === 0) return 0;
  let shared = 0;
  for (const token of setA) if (setB.has(token)) shared += 1;
  return shared / (setA.size + setB.size - shared);
}
