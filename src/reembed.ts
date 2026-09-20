import { db } from "./db";
import { books } from "./db/schema";
import { sql } from "drizzle-orm";
import { embedBookFields } from "./lib/embeddings";

// Regenerates per-field embeddings for all books.
async function reembed() {
  const PAGE = 200;
  let offset = 0;
  let total = 0;

  // Count once so the user sees progress.
  const countResult = await db.execute(sql`SELECT count(*)::int AS n FROM books`);
  const count = (countResult.rows[0] as { n: number }).n;
  console.log(`Re-embedding ${count} books (6 vectors each: 4x1536 + 2x384)...`);

  for (;;) {
    const page = await db
      .select()
      .from(books)
      .orderBy(books.id)
      .limit(PAGE)
      .offset(offset);

    if (page.length === 0) break;

    for (const book of page) {
      const embs = await embedBookFields(book);
      await db
        .update(books)
        .set(embs)
        .where(sql`${books.id} = ${book.id}`);
      total++;
      console.log(`[${total}/${count}] ${book.title}`);
    }

    offset += PAGE;
  }

  console.log("Done!");
  process.exit(0);
}

reembed().catch((err) => {
  console.error("Re-embed failed:", err);
  process.exit(1);
});
