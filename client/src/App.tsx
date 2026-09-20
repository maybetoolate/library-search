import { useEffect, useState } from "react";
import SearchPanel from "./components/SearchPanel";
import BookCard from "./components/BookCard";
import AddBookForm from "./components/AddBookForm";
import { DEFAULT_WEIGHTS, type Book, type Weights } from "./types";

export default function App() {
  const [books, setBooks] = useState<Book[]>([]);
  const [stats, setStats] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [genre, setGenre] = useState("");
  const [author, setAuthor] = useState("");
  const [rating, setRating] = useState("");
  const [limit, setLimit] = useState("10");
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [alpha, setAlpha] = useState(0.7);
  const [timing, setTiming] = useState("");
  const [mode, setMode] = useState<"browse" | "semantic">("browse");

  async function loadStats() {
    try {
      const r = await fetch("/stats");
      const s = await r.json();
      setStats(`${s.totalBooks ?? 0} books · avg ★ ${Number(s.avgRating || 0).toFixed(1)}`);
    } catch {
      setStats("");
    }
  }

  async function doSearch() {
    if (!query.trim()) return doBrowse();
    setLoading(true);
    setMode("semantic");
    try {
      const body: Record<string, unknown> = {
        query: query.trim(),
        limit: parseInt(limit) || 10,
        weightTitle: weights.title,
        weightAuthor: weights.author,
        weightGenre: weights.genre,
        weightDescription: weights.description,
        alpha,
      };
      if (genre) body.genre = genre;
      if (author.trim()) body.author = author.trim();
      if (rating) body.minRating = parseInt(rating);
      const r = await fetch("/books/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      setBooks(data.results);
      if (data.degraded) {
        setTiming("degraded mode — keyword only (embeddings unavailable)");
      } else if (data.timings) {
        const t = data.timings;
        const total = t.embeddingMs + t.dbMs;
        setTiming(
          `${(total / 1000).toFixed(1)}s (embed ${(t.embeddingMs / 1000).toFixed(1)}s · db ${t.dbMs}ms)`
        );
      }
    } finally {
      setLoading(false);
    }
  }

  async function doBrowse() {
    setTiming("");
    setLoading(true);
    setMode("browse");
    try {
      const p = new URLSearchParams();
      if (genre) p.set("genre", genre);
      if (author.trim()) p.set("author", author.trim());
      if (rating) p.set("minRating", rating);
      const r = await fetch("/books?" + p.toString());
      setBooks(await r.json());
    } finally {
      setLoading(false);
    }
  }

  async function delBook(id: string) {
    if (!confirm("Delete this book?")) return;
    await fetch("/books/" + id, { method: "DELETE" });
    loadStats();
    doBrowse();
  }

  useEffect(() => {
    loadStats();
    doBrowse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 py-4 sm:py-8">
      <header className="flex flex-wrap items-end justify-between gap-2 sm:gap-4 mb-4 sm:mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">📚 Library</h1>
          <p className="text-zinc-400 text-sm mt-1">
            multi-vector search · per-field embeddings · gemini-embedding-2 · Neon Postgres
          </p>
        </div>
        <div className="text-sm text-zinc-400">{stats || "Loading stats…"}</div>
      </header>

      <SearchPanel
        query={query} setQuery={setQuery}
        genre={genre} setGenre={setGenre}
        author={author} setAuthor={setAuthor}
        rating={rating} setRating={setRating}
        limit={limit} setLimit={setLimit}
        weights={weights} setWeights={setWeights}
        resetWeights={() => setWeights(DEFAULT_WEIGHTS)}
        alpha={alpha} setAlpha={setAlpha}
        onSearch={doSearch} onBrowse={doBrowse}
      />
      <p className="text-xs text-zinc-500 mb-3">
        Mode: {mode === "semantic" ? "multi-vector semantic search" : "browse with filters"}
        {mode === "semantic" && timing && ` · ${timing}`}
      </p>

      <div className="grid md:grid-cols-[1fr_320px] gap-6">
        <div>
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="font-semibold text-base sm:text-lg min-w-0 truncate">
              {mode === "semantic" ? `Results for “${query}”` : "All books"}
            </h2>
            <span className="text-sm text-zinc-500 shrink-0">
              {books.length ? `${books.length} book${books.length > 1 ? "s" : ""}` : ""}
            </span>
          </div>
          {loading && <div className="text-zinc-400 text-sm py-8 text-center">Searching…</div>}
          <div className="grid sm:grid-cols-2 gap-4">
            {books.map((b) => (
              <BookCard key={b.id} book={b} weights={weights} alpha={alpha} onDelete={delBook} />
            ))}
          </div>
          {!loading && books.length === 0 && (
            <div className="text-zinc-500 text-sm py-10 text-center border border-dashed border-zinc-800 rounded-2xl">
              No books found. Try a different query or filter.
            </div>
          )}
        </div>
        <AddBookForm
          onAdded={() => {
            loadStats();
            doBrowse();
          }}
        />
      </div>
    </div>
  );
}
