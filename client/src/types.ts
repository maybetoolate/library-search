export type Book = {
  id: string;
  title: string;
  author: string;
  description: string | null;
  genre: string | null;
  publishedYear: number | null;
  rating: number | null;
  score?: number;
  scoreTitle?: number;
  scoreAuthor?: number;
  scoreGenre?: number;
  scoreDescription?: number;
  scoreVector?: number;
  scoreLexical?: number;
};

export type Weights = {
  title: number;
  author: number;
  genre: number;
  description: number;
};

export const DEFAULT_WEIGHTS: Weights = {
  title: 4,
  author: 3,
  genre: 2,
  description: 1,
};

export function stars(n: number | null): string {
  const filled = n ?? 0;
  return "★".repeat(filled) + "☆".repeat(5 - filled);
}
