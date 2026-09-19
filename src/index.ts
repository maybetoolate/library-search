import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { cors } from "hono/cors";
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
import { eq, sql } from "drizzle-orm";

const app = new Hono();
app.use("/books/*", cors());
app.use("/stats", cors());
app.use("/config", cors());

app.get("/health", (c) => c.json({ message: "Library API with pgvector search" }));

app.get("/config", (c) =>
  c.json({
    defaultWeights: DEFAULT_WEIGHTS,
    fields: ["title", "author", "genre", "description"],
  })
);

app.get("/books", async (c) => {
  const genre = c.req.query("genre");
  const author = c.req.query("author");
  const minRating = c.req.query("minRating");

  let where = sql`1=1`;
  if (genre) where = sql`${where} AND ${books.genre} = ${genre}`;
  if (author) where = sql`${where} AND ${books.author} ILIKE ${`%${author}%`}`;
  if (minRating) where = sql`${where} AND ${books.rating} >= ${parseInt(minRating)}`;

  const all = await db
    .select()
    .from(books)
    .where(where)
    .orderBy(sql`${books.createdAt} DESC`);
  return c.json(all);
});

app.get("/books/autocomplete", async (c) => {
  const q = c.req.query("q") || "";
  return c.json(await autocompleteBooks(q, 8));
});

app.get("/books/:id", async (c) => {
  const id = c.req.param("id");
  const [book] = await db.select().from(books).where(eq(books.id, id));
  if (!book) return c.json({ error: "Book not found" }, 404);
  return c.json(book);
});

app.post("/books", async (c) => {
  const body = await c.req.json();
  const book = await addBookWithEmbedding({
    title: body.title,
    author: body.author,
    description: body.description,
    genre: body.genre,
    publishedYear: body.publishedYear,
    rating: body.rating,
  });
  return c.json(book, 201);
});

app.post("/books/search", async (c) => {
  const body = await c.req.json();
  const weights: FieldWeights = {
    title: body.weightTitle ?? DEFAULT_WEIGHTS.title,
    author: body.weightAuthor ?? DEFAULT_WEIGHTS.author,
    genre: body.weightGenre ?? DEFAULT_WEIGHTS.genre,
    description: body.weightDescription ?? DEFAULT_WEIGHTS.description,
  };
  const results = await searchBooks(
    body.query,
    { genre: body.genre, minRating: body.minRating, author: body.author },
    weights,
    body.limit || 10,
    body.alpha ?? 0.7
  );
  return c.json(results);
});

app.put("/books/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const [updated] = await db
    .update(books)
    .set({
      title: body.title,
      author: body.author,
      description: body.description,
      genre: body.genre,
      publishedYear: body.publishedYear,
      rating: body.rating,
      updatedAt: new Date(),
    })
    .where(eq(books.id, id))
    .returning();
  if (!updated) return c.json({ error: "Book not found" }, 404);
  return c.json(updated);
});

app.delete("/books/:id", async (c) => {
  const id = c.req.param("id");
  const [deleted] = await db.delete(books).where(eq(books.id, id)).returning();
  if (!deleted) return c.json({ error: "Book not found" }, 404);
  return c.json({ message: "Book deleted" });
});

app.get("/stats", async (c) => {
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
