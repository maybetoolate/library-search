import { addBookWithEmbedding } from "./lib/embeddings";
import { db } from "./db";
import { books } from "./db/schema";

const demoBooks = [
  {
    title: "The Great Gatsby",
    author: "F. Scott Fitzgerald",
    description: "A story of wealth, love, and the American Dream in the 1920s",
    genre: "Fiction",
    publishedYear: 1925,
    rating: 4,
  },
  {
    title: "To Kill a Mockingbird",
    author: "Harper Lee",
    description: "A gripping tale of racial injustice in the American South",
    genre: "Fiction",
    publishedYear: 1960,
    rating: 5,
  },
  {
    title: "1984",
    author: "George Orwell",
    description: "A dystopian novel about totalitarian surveillance and control",
    genre: "Science Fiction",
    publishedYear: 1949,
    rating: 5,
  },
  {
    title: "Pride and Prejudice",
    author: "Jane Austen",
    description: "A romantic novel exploring themes of love and social class",
    genre: "Romance",
    publishedYear: 1813,
    rating: 4,
  },
  {
    title: "The Hobbit",
    author: "J.R.R. Tolkien",
    description: "A fantasy adventure about a hobbit's unexpected journey",
    genre: "Fantasy",
    publishedYear: 1937,
    rating: 5,
  },
  {
    title: "Brave New World",
    author: "Aldous Huxley",
    description: "A dystopian future where technology controls society",
    genre: "Science Fiction",
    publishedYear: 1932,
    rating: 4,
  },
  {
    title: "The Catcher in the Rye",
    author: "J.D. Salinger",
    description: "A coming-of-age story about teenage alienation",
    genre: "Fiction",
    publishedYear: 1951,
    rating: 3,
  },
  {
    title: "Dune",
    author: "Frank Herbert",
    description: "An epic science fiction saga about politics and religion on a desert planet",
    genre: "Science Fiction",
    publishedYear: 1965,
    rating: 5,
  },
  {
    title: "The Lord of the Rings",
    author: "J.R.R. Tolkien",
    description: "An epic high fantasy quest to destroy a powerful ring",
    genre: "Fantasy",
    publishedYear: 1954,
    rating: 5,
  },
  {
    title: "Jane Eyre",
    author: "Charlotte Brontë",
    description: "A novel about an independent woman's journey through life and love",
    genre: "Romance",
    publishedYear: 1847,
    rating: 4,
  },
];

async function seed() {
  console.log("Seeding database with per-field embeddings...");

  // Start clean so re-runs don't duplicate rows
  await db.delete(books);

  for (const book of demoBooks) {
    const created = await addBookWithEmbedding(book);
    console.log(`Added: ${created.title}`);
    // Gentle pacing to stay under the embedding API rate limit
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log("Seeding complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
