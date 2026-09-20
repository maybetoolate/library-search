ALTER TABLE "books" ADD COLUMN "emb_autocomplete" vector(384);--> statement-breakpoint
CREATE INDEX "books_emb_autocomplete_hnsw" ON "books" USING hnsw ("emb_autocomplete" vector_cosine_ops);