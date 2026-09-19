import {
  pgTable,
  text,
  timestamp,
  integer,
  vector,
  index,
} from "drizzle-orm/pg-core";

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
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("books_emb_title_hnsw")
      .using("hnsw", table.embTitle.op("vector_cosine_ops")),
    index("books_emb_author_hnsw")
      .using("hnsw", table.embAuthor.op("vector_cosine_ops")),
    index("books_emb_genre_hnsw")
      .using("hnsw", table.embGenre.op("vector_cosine_ops")),
    index("books_emb_desc_hnsw")
      .using("hnsw", table.embDescription.op("vector_cosine_ops")),
  ]
);
