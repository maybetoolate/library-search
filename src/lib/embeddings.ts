import { db } from "../db";
import { books } from "../db/schema";
import { cosineDistance, desc, sql, SQL } from "drizzle-orm";
import { GoogleGenAI } from "@google/genai";

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// ---------------------------------------------------------------------------
// Embedding generation
// ---------------------------------------------------------------------------

export const EMBEDDING_DIMS = 1536;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      const msg = e instanceof Error ? e.message : String(e);
      // Retry on rate limits / transient server errors only
      if (!/429|RESOURCE_EXHAUSTED|503|500|timeout/i.test(msg) || i === attempts - 1) {
        throw e;
      }
      await sleep(2000 * 2 ** i);
    }
  }
  throw lastError;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await withRetry(() =>
    genAI.models.embedContent({
      model: "gemini-embedding-2",
      contents: text,
      config: { outputDimensionality: EMBEDDING_DIMS },
    })
  );
  const values = response.embeddings?.[0]?.values;
  if (!values) {
    throw new Error("Failed to generate embedding: empty response");
  }
  return values;
}

// Query-embedding cache: repeat searches skip the ~1s Gemini call entirely.
// Bounded LRU with TTL — embeddings are deterministic per input text.
const QUERY_CACHE_MAX = 200;
const QUERY_CACHE_TTL_MS = 10 * 60 * 1000;
const queryCache = new Map<string, { vec: number[]; at: number }>();

export async function embedQueryCached(query: string): Promise<number[]> {
  const key = query.trim().toLowerCase();
  const hit = queryCache.get(key);
  if (hit && Date.now() - hit.at < QUERY_CACHE_TTL_MS) {
    // Refresh LRU position
    queryCache.delete(key);
    queryCache.set(key, hit);
    return hit.vec;
  }
  const vec = await generateEmbedding(query);
  if (queryCache.size >= QUERY_CACHE_MAX) {
    const oldest = queryCache.keys().next().value;
    if (oldest !== undefined) queryCache.delete(oldest);
  }
  queryCache.set(key, { vec, at: Date.now() });
  return vec;
}

export async function embedBookFields(book: {
  title: string;
  author: string;
  description?: string | null;
  genre?: string | null;
}): Promise<{
  embTitle: number[];
  embAuthor: number[];
  embGenre: number[];
  embDescription: number[];
}> {
  const [embTitle, embAuthor, embGenre, embDescription] = await Promise.all([
    generateEmbedding(book.title),
    generateEmbedding(book.author),
    generateEmbedding(book.genre || "unknown"),
    generateEmbedding(book.description || "no description"),
  ]);
  return { embTitle, embAuthor, embGenre, embDescription };
}

// ---------------------------------------------------------------------------
// Default weights (imported by the API for /config and search fallback)
// ---------------------------------------------------------------------------

export const DEFAULT_WEIGHTS = {
  title: 4,
  author: 3,
  genre: 2,
  description: 1,
} as const;

export type FieldWeights = {
  title: number;
  author: number;
  genre: number;
  description: number;
};

// ---------------------------------------------------------------------------
// Multi-vector weighted search
//
// The score formula is a weighted average of per-field cosine similarities:
//
//   score = (w_title * cos(title) + w_author * cos(author)
//          + w_genre * cos(genre) + w_desc  * cos(description))
//          / (w_title + w_author + w_genre + w_desc)
//
// Each cosineDistance is computed as `1 - (embedding <=> query)` in Postgres.
// The query provides 4 separate embeddings, one per field, so the user's
// intent for "title" is embedded as title-like text, not conflated.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Trigram lexical helpers (pg_trgm)
//
// similarity() is 0 for no shared trigrams, 1 for identical strings —
// a calibrated floor that cosine similarity lacks. Used for autocomplete
// and blended into search as the lexical half of hybrid scoring.
// ---------------------------------------------------------------------------

function escapeLike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export function lexicalScoreExpr(q: string): SQL<number> {
  return sql<number>`GREATEST(
    similarity(${books.title}, ${q}),
    similarity(${books.author}, ${q}),
    similarity(${books.genre}, ${q})
  )`;
}

export async function autocompleteBooks(q: string, limit = 8) {
  const trimmed = q.trim();
  if (!trimmed) return [];
  const like = `%${escapeLike(trimmed)}%`;
  const lex = lexicalScoreExpr(trimmed);
  return db
    .select({
      id: books.id,
      title: books.title,
      author: books.author,
      genre: books.genre,
      sim: lex,
    })
    .from(books)
    .where(
      sql`(${books.title} ILIKE ${like} OR ${books.author} ILIKE ${like} OR (${lex}) > 0.15)`
    )
    .orderBy(desc(lex))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Multi-vector weighted search, hybrid-blended with trigram lexical score:
//
//   vector = weighted avg of per-field cosine similarities
//   score  = alpha * vector + (1 - alpha) * lexical
//
// alpha=1 is pure semantic, alpha=0 pure keyword. Default 0.7.
// ---------------------------------------------------------------------------

export async function searchBooks(
  query: string,
  filters?: {
    genre?: string;
    minRating?: number;
    author?: string;
  },
  weights: FieldWeights = DEFAULT_WEIGHTS,
  limit = 10,
  alpha = 0.7
) {
  const a = Math.min(1, Math.max(0, alpha));

  // ONE query embedding, reused across all 4 fields (same input text →
  // same vector; 4 calls was pure quota burn). Cached for repeat queries.
  const tEmbed0 = performance.now();
  const qVec = await embedQueryCached(query);
  const embeddingMs = performance.now() - tEmbed0;
  const qStr = JSON.stringify(qVec);

  // Build per-field cosine-distance SQL expressions.
  const simTitle = sql<number>`1 - (${cosineDistance(books.embTitle, qVec)})`;
  const simAuthor = sql<number>`1 - (${cosineDistance(books.embAuthor, qVec)})`;
  const simGenre = sql<number>`1 - (${cosineDistance(books.embGenre, qVec)})`;
  const simDesc = sql<number>`1 - (${cosineDistance(books.embDescription, qVec)})`;

  const totalWeight = weights.title + weights.author + weights.genre + weights.description;

  // NOTE: each sim fragment is `1 - (dist)`, so it must be parenthesized —
  // otherwise SQL precedence turns `w * 1 - (dist)` into an unweighted average.
  const weightedScore: SQL<number> = sql<number>`(
    ${weights.title}   * (${simTitle})
  + ${weights.author}  * (${simAuthor})
  + ${weights.genre}   * (${simGenre})
  + ${weights.description} * (${simDesc})
  ) / ${totalWeight}`;

  // Filters
  let whereClause = sql`1=1`;
  if (filters?.genre) {
    whereClause = sql`${whereClause} AND ${books.genre} = ${filters.genre}`;
  }
  if (filters?.minRating) {
    whereClause = sql`${whereClause} AND ${books.rating} >= ${filters.minRating}`;
  }
  if (filters?.author) {
    whereClause = sql`${whereClause} AND ${books.author} ILIKE ${`%${filters.author}%`}`;
  }

  // Lexical grounding: best trigram match across the short fields.
  // similarity() = 0 with no shared trigrams, 1 for identical strings.
  const lexical = lexicalScoreExpr(query);
  const finalScore: SQL<number> = sql<number>`${a} * (${weightedScore}) + ${1 - a} * (${lexical})`;

  // --- Two-phase retrieval (scales to 100k+ rows) ---
  // Phase 1: cheap candidate generation. Each per-field ORDER BY … LIMIT
  // probes its HNSW index (O(log n)); the trigram arm uses the GIN index.
  // Phase 2: exact hybrid rescoring over the bounded candidate set only.
  // Whole thing runs in ONE round trip.
  const k = Math.max(100, limit * 10);
  const candidates = sql`(
    (SELECT id FROM ${books} ORDER BY ${books.embTitle} <=> ${qStr} LIMIT ${k})
    UNION
    (SELECT id FROM ${books} ORDER BY ${books.embAuthor} <=> ${qStr} LIMIT ${k})
    UNION
    (SELECT id FROM ${books} ORDER BY ${books.embGenre} <=> ${qStr} LIMIT ${k})
    UNION
    (SELECT id FROM ${books} ORDER BY ${books.embDescription} <=> ${qStr} LIMIT ${k})
    UNION
    (SELECT id FROM ${books}
     WHERE ${books.title} % ${query} OR ${books.author} % ${query} OR ${books.genre} % ${query}
     LIMIT ${k})
  )`;

  const tDb0 = performance.now();
  const results = await db
    .select({
      id: books.id,
      title: books.title,
      author: books.author,
      description: books.description,
      genre: books.genre,
      publishedYear: books.publishedYear,
      rating: books.rating,
      // Per-field scores for transparency
      scoreTitle: simTitle,
      scoreAuthor: simAuthor,
      scoreGenre: simGenre,
      scoreDescription: simDesc,
      scoreVector: weightedScore,
      scoreLexical: lexical,
      // Combined hybrid score
      score: finalScore,
    })
    .from(books)
    .where(sql`${books.id} IN ${candidates} AND ${whereClause}`)
    .orderBy(desc(finalScore))
    .limit(limit);
  const dbMs = performance.now() - tDb0;

  return {
    results,
    timings: {
      embeddingMs: Math.round(embeddingMs),
      dbMs: Math.round(dbMs),
    },
  };
}

// ---------------------------------------------------------------------------
// Insert / update helpers
// ---------------------------------------------------------------------------

export async function addBookWithEmbedding(book: {
  title: string;
  author: string;
  description?: string;
  genre?: string;
  publishedYear?: number;
  rating?: number;
}) {
  const embs = await embedBookFields(book);

  const [newBook] = await db
    .insert(books)
    .values({
      ...book,
      ...embs,
    })
    .returning();

  return newBook;
}

export async function updateBookEmbedding(id: string) {
  const [book] = await db.select().from(books).where(sql`${books.id} = ${id}`);
  if (!book) throw new Error("Book not found");
  const embs = await embedBookFields(book);
  await db.update(books).set(embs).where(sql`${books.id} = ${id}`);
  return { ...book, ...embs };
}
