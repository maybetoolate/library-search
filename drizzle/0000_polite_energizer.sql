CREATE TABLE "books" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"author" text NOT NULL,
	"description" text,
	"genre" text,
	"published_year" integer,
	"rating" integer,
	"emb_title" vector(1536),
	"emb_author" vector(1536),
	"emb_genre" vector(1536),
	"emb_description" vector(1536),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "books_emb_title_hnsw" ON "books" USING hnsw ("emb_title" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "books_emb_author_hnsw" ON "books" USING hnsw ("emb_author" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "books_emb_genre_hnsw" ON "books" USING hnsw ("emb_genre" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "books_emb_desc_hnsw" ON "books" USING hnsw ("emb_description" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "books_title_trgm" ON "books" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "books_author_trgm" ON "books" USING gin ("author" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "books_genre_trgm" ON "books" USING gin ("genre" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "books_desc_trgm" ON "books" USING gin ("description" gin_trgm_ops);