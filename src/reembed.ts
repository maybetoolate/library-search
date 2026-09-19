import { db } from "./db";
import { books } from "./db/schema";
import { sql } from "drizzle-orm";
import { embedBookFields } from "./lib/embeddings";

// Regenerates per-field embeddings for all books.
async function reembed() {
  const all = await db.select().from(books);
  console.log(`Re-embedding ${all.length} books (4 vectors each)...`);

  for (const book of all) {
    const embs = await embedBookFields(book);
    await db
      .update(books)
      .set(embs)
      .where(sql`${books.id} = ${book.id}`);
    console.log(`Updated: ${book.title}`);
  }

  console.log("Done!");
  process.exit(0);
}

reembed().catch((err) => {
  console.error("Re-embed failed:", err);
  process.exit(1);
});
