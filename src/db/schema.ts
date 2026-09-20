import {
  pgTable,
  text,
  timestamp,
  integer,
  vector,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const books = pgTable(
  "books",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    title: text("title").notNull(),
    author: text("author").notNull(),
    description: text("description"),
    genre: text("genre"),
    publishedYear: integer("published_year"),
    rating: integer("rating"),
    embTitle: vector("emb_title", { dimensions: 1536 }),
    embAuthor: vector("emb_author", { dimensions: 1536 }),
    embGenre: vector("emb_genre", { dimensions: 1536 }),
    embDescription: vector("emb_description", { dimensions: 1536 }),
    // Lightweight autocomplete vectors (384 dims — NOT 1536): autocomplete
    // fires per keystroke, so it uses cheaper/faster embeddings than the
    // main multi-vector search. Title/author and genre get separate vectors
    // so the short genre signal isn't diluted inside the longer text.
    embAutocomplete: vector("emb_autocomplete", { dimensions: 384 }),
    embAutocompleteGenre: vector("emb_autocomplete_genre", { dimensions: 384 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    check("books_rating_check", sql`${table.rating} BETWEEN 1 AND 5`),
    index("books_emb_title_hnsw")
      .using("hnsw", table.embTitle.op("vector_cosine_ops")),
    index("books_emb_author_hnsw")
      .using("hnsw", table.embAuthor.op("vector_cosine_ops")),
    index("books_emb_genre_hnsw")
      .using("hnsw", table.embGenre.op("vector_cosine_ops")),
    index("books_emb_desc_hnsw")
      .using("hnsw", table.embDescription.op("vector_cosine_ops")),
    index("books_emb_autocomplete_hnsw")
      .using("hnsw", table.embAutocomplete.op("vector_cosine_ops")),
    index("books_emb_autocomplete_genre_hnsw")
      .using("hnsw", table.embAutocompleteGenre.op("vector_cosine_ops")),
  ]
);
