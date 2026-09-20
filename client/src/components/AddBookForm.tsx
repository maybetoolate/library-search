import { useState } from "react";

const input =
  "w-full min-w-0 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-base sm:text-sm outline-none focus:border-emerald-500";

export default function AddBookForm({ onAdded }: { onAdded: () => void }) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [desc, setDesc] = useState("");
  const [genre, setGenre] = useState("");
  const [year, setYear] = useState("");
  const [rating, setRating] = useState("5");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!title.trim() || !author.trim()) {
      setError("Title and author are required");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          author: author.trim(),
          description: desc.trim() || undefined,
          genre: genre.trim() || undefined,
          publishedYear: year ? parseInt(year) : undefined,
          rating: parseInt(rating),
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      setTitle("");
      setAuthor("");
      setDesc("");
      setGenre("");
      setYear("");
      onAdded();
    } catch (e) {
      setError("Add failed: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="w-full min-w-0 bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sm:p-5 h-fit shadow">
      <h2 className="font-semibold mb-3">＋ Add a book</h2>
      <div className="space-y-2">
        <input placeholder="Title *" value={title} onChange={(e) => setTitle(e.target.value)} className={input} />
        <input placeholder="Author *" value={author} onChange={(e) => setAuthor(e.target.value)} className={input} />
        <textarea placeholder="Description" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} className={input} />
        <div className="grid grid-cols-2 gap-2">
          <input placeholder="Genre" value={genre} onChange={(e) => setGenre(e.target.value)}
            className="w-full min-w-0 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-base sm:text-sm outline-none focus:border-emerald-500" />
          <input type="number" placeholder="Year" value={year} onChange={(e) => setYear(e.target.value)}
            className="w-full min-w-0 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-base sm:text-sm outline-none focus:border-emerald-500" />
        </div>
        <select value={rating} onChange={(e) => setRating(e.target.value)} className={input}>
          <option value="5">★ ★ ★ ★ ★ (5)</option>
          <option value="4">★ ★ ★ ★ (4)</option>
          <option value="3">★ ★ ★ (3)</option>
          <option value="2">★ ★ (2)</option>
          <option value="1">★ (1)</option>
        </select>
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="w-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold rounded-xl py-2.5 disabled:opacity-50"
        >
          {busy ? "Embedding…" : "Add book"}
        </button>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <p className="text-xs text-zinc-500">4 per-field embeddings generated via gemini-embedding-2.</p>
      </div>
    </aside>
  );
}
