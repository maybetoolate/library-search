-- Extensions that drizzle-kit does not manage.
-- Applied by `bun run db:setup` BEFORE `drizzle-kit migrate`.
-- Safe to re-run (all statements are IF NOT EXISTS).

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
