import { db } from "../db";
import { books } from "../db/schema";
import { cosineDistance, desc, eq, sql, SQL } from "drizzle-orm";
import { GoogleGenAI, ApiError } from "@google/genai";

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// ---------------------------------------------------------------------------
// Embedding generation
// ---------------------------------------------------------------------------

export const EMBEDDING_DIMS = 1536;

// Lightweight autocomplete embedding size. Autocomplete fires per keystroke,
// so it uses 384-dim vectors (cheaper/faster) instead of the 1536-dim
// main multi-vector search. The two are NOT interchangeable in pgvector.
export const AUTOCOMPLETE_DIMS = 384;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class TimeoutError extends Error {}

/** Returns true if the error is transient and worth retrying. */
function isRetryable(e: unknown): boolean {
  if (e instanceof TimeoutError) return true;
  if (e instanceof ApiError) return e.status === 429 || e.status === 503;
  const msg = e instanceof Error ? e.message : String(e);
  return /RESOURCE_EXHAUSTED|ECONNRESET|EPIPE/i.test(msg);
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  if (attempts < 1) throw new Error("withRetry: attempts must be >= 1");
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (!isRetryable(e) || i === attempts - 1) {
        throw e;
      }
      await sleep(2000 * 2 ** i);
    }
  }
  throw lastError;
}

const EMBED_TIMEOUT_MS = 20_000;

/**
 * Generate a single embedding. Creates a fresh AbortController per attempt
 * so that: (a) the HTTP request is actually cancelled on timeout (releasing
 * the socket and stopping quota consumption), and (b) retries 2–5 don't
 * instantly fail because a previous attempt's signal was already aborted.
 */
export async function generateEmbedding(
  text: string,
  dims: number = EMBEDDING_DIMS
): Promise<number[]> {
  return withRetry(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);
    try {
      const response = await genAI.models.embedContent({
        model: "gemini-embedding-2",
        contents: text,
        config: {
          outputDimensionality: dims,
          abortSignal: controller.signal,
        },
      });
      const values = response.embeddings?.[0]?.values;
      if (!values) {
        throw new Error("Failed to generate embedding: empty response");
      }
      return values;
    } catch (e) {
      // Map AbortError (from fetch) and SDK abort errors to our typed
      // TimeoutError so isRetryable recognises it without string matching.
      if (controller.signal.aborted && !(e instanceof TimeoutError)) {
        throw new TimeoutError(`Embedding timed out after ${EMBED_TIMEOUT_MS}ms`);
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  });
}

// Query-embedding cache: repeat searches skip the ~1s Gemini call entirely.
// Bounded LRU with TTL — embeddings are deterministic per input text.
const QUERY_CACHE_MAX = 200;
const QUERY_CACHE_TTL_MS = 10 * 60 * 1000;
const queryCache = new Map<string, { vec: number[]; at: number }>();

export async function embedQueryCached(
  query: string,
  dims: number = EMBEDDING_DIMS
): Promise<number[]> {
  const key = `${dims}:${query.trim().toLowerCase()}`;
  const hit = queryCache.get(key);
  if (hit && Date.now() - hit.at < QUERY_CACHE_TTL_MS) {
    // Refresh LRU position
    queryCache.delete(key);
    queryCache.set(key, hit);
    return hit.vec;
  }
  const vec = await generateEmbedding(query, dims);
  // Delete first so an expired-then-refreshed entry moves to the
  // end of iteration order (true LRU), not just an in-place value swap.
  const isNewKey = !queryCache.has(key);
  queryCache.delete(key);
  if (isNewKey && queryCache.size >= QUERY_CACHE_MAX) {
    const oldest = queryCache.keys().next().value;
    if (oldest !== undefined) queryCache.delete(oldest);
  }
  queryCache.set(key, { vec, at: Date.now() });
  return vec;
}

export function autocompleteText(book: {
  title: string;
  author: string;
}): string {
  return `${book.title} by ${book.author}`;
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
  embAutocomplete: number[];
  embAutocompleteGenre: number[];
}> {
  // NOTE: 6 separate Gemini calls per book. The SDK's embedContent doesn't
  // expose a batch API, so we fire them in parallel. At bulk-import scale
  // (10k+ books) you'll hit rate limits — use exponential backoff and
  // consider sharding across API keys.
  const [
    embTitle,
    embAuthor,
    embGenre,
    embDescription,
    embAutocomplete,
    embAutocompleteGenre,
  ] = await Promise.all([
    generateEmbedding(book.title),
    generateEmbedding(book.author),
    generateEmbedding(book.genre || "unknown"),
    generateEmbedding(book.description || "no description"),
    generateEmbedding(autocompleteText(book), AUTOCOMPLETE_DIMS),
    generateEmbedding(book.genre || "unknown", AUTOCOMPLETE_DIMS),
  ]);
  return {
    embTitle,
    embAuthor,
    embGenre,
    embDescription,
    embAutocomplete,
    embAutocompleteGenre,
  };
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
// A single query embedding is compared against all 4 field columns — this is
// the standard approach (one embedding per query, not per field) because the
// user's intent doesn't change between fields.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Trigram lexical helpers (pg_trgm)
//
// similarity() is 0 for no shared trigrams, 1 for identical strings —
// a calibrated floor that cosine similarity lacks. Used for autocomplete
// and blended into search as the lexical half of hybrid scoring.
//
// The % operator filters by pg_trgm.similarity_threshold (default 0.3).
// similarity() in the SELECT clause scores 0–1 without a threshold.
// If you need the old 0.15 threshold for candidate filtering, use
//   SET LOCAL pg_trgm.similarity_threshold = 0.15
// in the same transaction, or use similarity(...) > 0.15 in WHERE
// (index-unfriendly). The 0.3 default is deliberately stricter.
// ---------------------------------------------------------------------------

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
  const lex = lexicalScoreExpr(trimmed);

  // Lexical-only path: uses the GIN trigram indexes via % operator for
  // filtering (index-assisted, threshold = pg_trgm.similarity_threshold),
  // then similarity() for ranking on the filtered set. Falls back here
  // when Gemini is unavailable.
  const lexicalOnly = () =>
    db
      .select({
        id: books.id,
        title: books.title,
        author: books.author,
        genre: books.genre,
        sim: lex,
      })
      .from(books)
      .where(
        sql`(${books.title} % ${trimmed} OR ${books.author} % ${trimmed} OR ${books.genre} % ${trimmed})`
      )
      .orderBy(desc(lex))
      .limit(limit);

  // 384-dim query embedding (NOT 1536). Falls back to lexical-only when
  // Gemini is down so keystroke autocomplete never 500s.
  let qVec: number[];
  try {
    qVec = await embedQueryCached(trimmed, AUTOCOMPLETE_DIMS);
  } catch (e) {
    console.error("Autocomplete embedding failed, falling back to lexical:", e);
    return lexicalOnly();
  }

  // Lexical dominates so short prefixes stay stable; the 384-dim vectors
  // add typo/semantic tolerance ("space adventure" -> sci-fi titles).
  // GREATEST gives OR-style matching: a title/author hit or a genre hit
  // either one ranks the row. One query embedding serves both columns,
  // so per-keystroke cost is unchanged.
  const vecWeight = 0.4;
  // COALESCE so pre-backfill rows (NULL autocomplete vectors) rank on lexical alone.
  const vecSim = sql<number>`GREATEST(
    COALESCE(1 - (${cosineDistance(books.embAutocomplete, qVec)}), 0),
    COALESCE(1 - (${cosineDistance(books.embAutocompleteGenre, qVec)}), 0)
  )`;
  const score: SQL<number> =
    sql<number>`${vecWeight} * (${vecSim}) + ${1 - vecWeight} * (${lex})`;

  // Bounded candidate set: HNSW probes on both 384-dim indexes + lexical
  // matches (% uses the GIN trigram index), then exact hybrid rescoring.
  // Rows without vectors still match lexically via COALESCE above.
  const qStr = JSON.stringify(qVec);
  const k = 50;
  const candidates = sql`(
    (SELECT id FROM ${books} ORDER BY ${books.embAutocomplete} <=> ${qStr}::vector LIMIT ${k})
    UNION ALL
    (SELECT id FROM ${books} ORDER BY ${books.embAutocompleteGenre} <=> ${qStr}::vector LIMIT ${k})
    UNION ALL
    (SELECT id FROM ${books}
     WHERE ${books.title} % ${trimmed} OR ${books.author} % ${trimmed} OR ${books.genre} % ${trimmed}
     LIMIT ${k})
  )`;

  return db
    .select({
      id: books.id,
      title: books.title,
      author: books.author,
      genre: books.genre,
      sim: score,
    })
    .from(books)
    .where(sql`EXISTS (SELECT 1 FROM ${candidates} AS c WHERE c.id = ${books.id})`)
    .orderBy(desc(score))
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

function buildFilterClause(filters?: {
  genre?: string;
  minRating?: number;
  author?: string;
}) {
  let whereClause = sql`1=1`;
  if (filters?.genre) {
    whereClause = sql`${whereClause} AND ${books.genre} = ${filters.genre}`;
  }
  if (filters?.minRating !== undefined) {
    whereClause = sql`${whereClause} AND ${books.rating} >= ${filters.minRating}`;
  }
  if (filters?.author) {
    whereClause = sql`${whereClause} AND ${books.author} ILIKE ${`%${filters.author}%`}`;
  }
  return whereClause;
}

/**
 * Lexical-only fallback when embeddings are unavailable. Uses the GIN
 * trigram index via the % operator for filtering (index-assisted), then
 * similarity() for ranking on the filtered set. Avoids a full table scan
 * with similarity() in the WHERE clause, which can't use the index.
 */
async function lexicalOnlySearch(
  query: string,
  whereClause: SQL<unknown>,
  limit: number
) {
  const tDb0 = performance.now();
  const lexical = lexicalScoreExpr(query);
  const results = await db
    .select({
      id: books.id,
      title: books.title,
      author: books.author,
      description: books.description,
      genre: books.genre,
      publishedYear: books.publishedYear,
      rating: books.rating,
      scoreTitle: sql<number>`0`,
      scoreAuthor: sql<number>`0`,
      scoreGenre: sql<number>`0`,
      scoreDescription: sql<number>`0`,
      scoreVector: sql<number>`0`,
      scoreLexical: lexical,
      score: lexical,
    })
    .from(books)
    .where(sql`(${books.title} % ${query} OR ${books.author} % ${query} OR ${books.genre} % ${query}) AND ${whereClause}`)
    .orderBy(desc(lexical))
    .limit(limit);
  return {
    results,
    timings: { embeddingMs: 0, dbMs: Math.round(performance.now() - tDb0) },
    degraded: true as const,
  };
}

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
  const trimmed = query.trim();
  if (!trimmed) {
    return {
      results: [],
      timings: { embeddingMs: 0, dbMs: 0 },
      degraded: false as const,
    };
  }

  const a = Math.min(1, Math.max(0, alpha));
  const whereClause = buildFilterClause(filters);

  // ONE query embedding, reused across all 4 fields (same input text →
  // same vector; 4 calls was pure quota burn). Cached for repeat queries.
  // If Gemini is down, degrade to lexical-only instead of 500ing.
  const tEmbed0 = performance.now();
  let qVec: number[];
  try {
    qVec = await embedQueryCached(trimmed);
  } catch (e) {
    console.error("Embedding failed, falling back to lexical search:", e);
    return lexicalOnlySearch(trimmed, whereClause, limit);
  }
  const embeddingMs = performance.now() - tEmbed0;
  const qStr = JSON.stringify(qVec);

  // Build per-field cosine-distance SQL expressions.
  const simTitle = sql<number>`1 - (${cosineDistance(books.embTitle, qVec)})`;
  const simAuthor = sql<number>`1 - (${cosineDistance(books.embAuthor, qVec)})`;
  const simGenre = sql<number>`1 - (${cosineDistance(books.embGenre, qVec)})`;
  const simDesc = sql<number>`1 - (${cosineDistance(books.embDescription, qVec)})`;

  const totalWeight =
    weights.title + weights.author + weights.genre + weights.description || 1;

  // NOTE: each sim fragment is `1 - (dist)`, so it must be parenthesized —
  // otherwise SQL precedence turns `w * 1 - (dist)` into an unweighted average.
  const weightedScore: SQL<number> = sql<number>`(
    ${weights.title}   * (${simTitle})
  + ${weights.author}  * (${simAuthor})
  + ${weights.genre}   * (${simGenre})
  + ${weights.description} * (${simDesc})
  ) / ${totalWeight}`;

  // Filters (shared by the full and degraded paths)
  const lexical = lexicalScoreExpr(trimmed);
  const finalScore: SQL<number> = sql<number>`${a} * (${weightedScore}) + ${1 - a} * (${lexical})`;

  // --- Two-phase retrieval (scales to 100k+ rows) ---
  // Phase 1: cheap candidate generation. Each per-field ORDER BY … LIMIT
  // probes its HNSW index (O(log n)); the trigram arm uses the GIN index.
  // Arms with weight=0 are skipped to avoid wasted index probes.
  // Phase 2: exact hybrid rescoring over the bounded candidate set only.
  // Whole thing runs in ONE round trip.
  const k = Math.max(100, limit * 10);

  // Build candidate arms dynamically — skip HNSW probes for zero-weight fields.
  const arms: SQL<unknown>[] = [];
  if (weights.title > 0) {
    arms.push(sql`(SELECT id FROM ${books} ORDER BY ${books.embTitle} <=> ${qStr}::vector LIMIT ${k})`);
  }
  if (weights.author > 0) {
    arms.push(sql`(SELECT id FROM ${books} ORDER BY ${books.embAuthor} <=> ${qStr}::vector LIMIT ${k})`);
  }
  if (weights.genre > 0) {
    arms.push(sql`(SELECT id FROM ${books} ORDER BY ${books.embGenre} <=> ${qStr}::vector LIMIT ${k})`);
  }
  if (weights.description > 0) {
    arms.push(sql`(SELECT id FROM ${books} ORDER BY ${books.embDescription} <=> ${qStr}::vector LIMIT ${k})`);
  }
  // Trigram arm always runs — it catches lexical matches the vectors miss.
  // Uses % operator (pg_trgm.similarity_threshold, default 0.3) for
  // index-assisted filtering; similarity() in SELECT scores 0–1.
  arms.push(sql`(SELECT id FROM ${books} WHERE ${books.title} % ${trimmed} OR ${books.author} % ${trimmed} OR ${books.genre} % ${trimmed} LIMIT ${k})`);

  const candidates = sql`(${arms.reduce((a, b) => sql`${a} UNION ALL ${b}`)})`;

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
    .where(sql`EXISTS (SELECT 1 FROM ${candidates} AS c WHERE c.id = ${books.id}) AND ${whereClause}`)
    .orderBy(desc(finalScore))
    .limit(limit);
  // Includes network round-trip + query planning, not just DB execution time.
  const roundTripMs = performance.now() - tDb0;

  return {
    results,
    timings: {
      embeddingMs: Math.round(embeddingMs),
      dbMs: Math.round(roundTripMs),
    },
    degraded: false as const,
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
  const [book] = await db.select().from(books).where(eq(books.id, id));
  if (!book) throw new Error("Book not found");
  const embs = await embedBookFields(book);
  await db.update(books).set(embs).where(eq(books.id, id));
  return { ...book, ...embs };
}
