import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { logger } from "hono/logger";
import { zValidator } from "@hono/zod-validator";
import { readFile } from "node:fs/promises";
import { db } from "./db";
import { books } from "./db/schema";
import {
  searchBooks,
  addBookWithEmbedding,
  autocompleteBooks,
  DEFAULT_WEIGHTS,
  type FieldWeights,
} from "./lib/embeddings";
import {
  bookSchema,
  searchSchema,
  autocompleteSchema,
  browseSchema,
} from "./lib/validation";
import { rateLimit } from "./lib/rate-limit";
import { sql } from "drizzle-orm";

const app = new Hono();

// --- Global middleware ---
app.use(logger());
app.use(secureHeaders());

// CORS: same-origin by default; set ALLOWED_ORIGINS (comma-separated)
// in production when the UI is hosted on another domain.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  "/*",
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : "*",
  })
);

// Paid embedding endpoints get tight limits; reads get generous ones.
const searchLimit = rateLimit(30, 60_000); // 30 searches/min/IP
const writeLimit = rateLimit(20, 60_000); // 20 writes/min/IP
const readLimit = rateLimit(300, 60_000); // 300 reads/min/IP

// --- Health (with DB check for load balancers / uptime monitors) ---
const startedAt = Date.now();
app.get("/health", async (c) => {
  try {
    await db.execute(sql`SELECT 1`);
    return c.json({
      status: "ok",
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    });
  } catch (e) {
    return c.json({ status: "degraded", error: "database unreachable" }, 503);
  }
});

app.get("/config", (c) =>
  c.json({
    defaultWeights: DEFAULT_WEIGHTS,
    fields: ["title", "author", "genre", "description"],
  })
);

// --- Books API ---
app.get("/books", readLimit, zValidator("query", browseSchema), async (c) => {
  const { genre, author, minRating } = c.req.valid("query");

  let where = sql`1=1`;
  if (genre) where = sql`${where} AND ${books.genre} = ${genre}`;
  if (author) where = sql`${where} AND ${books.author} ILIKE ${`%${author}%`}`;
  if (minRating !== undefined)
    where = sql`${where} AND ${books.rating} >= ${minRating}`;

  const all = await db
    .select()
    .from(books)
    .where(where)
    .orderBy(sql`${books.createdAt} DESC`);
  return c.json(all);
});

app.get(
  "/books/autocomplete",
  readLimit,
  zValidator("query", autocompleteSchema),
  async (c) => {
    const { q } = c.req.valid("query");
    return c.json(await autocompleteBooks(q, 8));
  }
);

app.get("/books/:id", readLimit, async (c) => {
  const id = c.req.param("id");
  const [book] = await db.select().from(books).where(sql`${books.id} = ${id}`);
  if (!book) return c.json({ error: "Book not found" }, 404);
  return c.json(book);
});

app.post("/books", writeLimit, zValidator("json", bookSchema), async (c) => {
  const body = c.req.valid("json");
  const book = await addBookWithEmbedding(body);
  return c.json(book, 201);
});

app.post(
  "/books/search",
  searchLimit,
  zValidator("json", searchSchema),
  async (c) => {
    const body = c.req.valid("json");
    const weights: FieldWeights = {
      title: body.weightTitle ?? DEFAULT_WEIGHTS.title,
      author: body.weightAuthor ?? DEFAULT_WEIGHTS.author,
      genre: body.weightGenre ?? DEFAULT_WEIGHTS.genre,
      description: body.weightDescription ?? DEFAULT_WEIGHTS.description,
    };
    return c.json(
      await searchBooks(
        body.query,
        { genre: body.genre, minRating: body.minRating, author: body.author },
        weights,
        body.limit,
        body.alpha ?? 0.7
      )
    );
  }
);

app.put("/books/:id", writeLimit, zValidator("json", bookSchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const [updated] = await db
    .update(books)
    .set({ ...body, updatedAt: new Date() })
    .where(sql`${books.id} = ${id}`)
    .returning();
  if (!updated) return c.json({ error: "Book not found" }, 404);
  return c.json(updated);
});

app.delete("/books/:id", writeLimit, async (c) => {
  const id = c.req.param("id");
  const [deleted] = await db.delete(books).where(sql`${books.id} = ${id}`).returning();
  if (!deleted) return c.json({ error: "Book not found" }, 404);
  return c.json({ message: "Book deleted" });
});

app.get("/stats", readLimit, async (c) => {
  const stats = await db
    .select({
      totalBooks: sql<number>`count(*)`,
      avgRating: sql<number>`avg(${books.rating})`,
      genres: sql<string[]>`array_agg(DISTINCT ${books.genre})`,
    })
    .from(books);
  return c.json(stats[0]);
});

// Production: serve the built React app
app.use("/assets/*", serveStatic({ root: "./dist" }));
app.get("*", async (c) => {
  try {
    return c.html(await readFile("./dist/index.html", "utf-8"));
  } catch {
    return c.json({ error: "Not found" }, 404);
  }
});

serve({ fetch: app.fetch, port: 3000 }, (info) => {
  console.log(`Library API running on http://localhost:${info.port}`);
});
