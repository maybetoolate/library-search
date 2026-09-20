import { stars, type Book, type Weights } from "../types";

function ScoreBar({ label, value, weight }: { label: string; value: number; weight: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-12 text-zinc-500">{label}</span>
      <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
        <div className="h-full bg-emerald-500/60 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-14 text-right font-mono text-zinc-400">
        {pct}% ×{weight}
      </span>
    </div>
  );
}

export default function BookCard({
  book,
  weights,
  alpha,
  onDelete,
}: {
  book: Book;
  weights: Weights;
  alpha: number;
  onDelete: (id: string) => void;
}) {
  const hasScores = typeof book.score === "number";
  const scorePct = hasScores ? Math.round((book.score as number) * 100) : null;
  return (
    <article className="card min-w-0 bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow">
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-xs bg-zinc-800 border border-zinc-700 px-2 py-0.5 rounded-full">
          {book.genre || "Unknown"}
        </span>
        {scorePct !== null && (
          <span className="text-xs bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
            {scorePct}% match
          </span>
        )}
      </div>
      <h3 className="font-semibold leading-snug break-words">{book.title}</h3>
      <p className="text-sm text-zinc-400">
        by {book.author}
        {book.publishedYear ? ` · ${book.publishedYear}` : ""}
      </p>
      <p className="text-sm text-zinc-300 mt-2 line-clamp-3">{book.description || ""}</p>
      {hasScores && (
        <div className="mt-3 space-y-1">
          <ScoreBar label="Title" value={book.scoreTitle ?? 0} weight={weights.title} />
          <ScoreBar label="Author" value={book.scoreAuthor ?? 0} weight={weights.author} />
          <ScoreBar label="Genre" value={book.scoreGenre ?? 0} weight={weights.genre} />
          <ScoreBar label="Desc" value={book.scoreDescription ?? 0} weight={weights.description} />
          <ScoreBar label="Keyw" value={book.scoreLexical ?? 0} weight={Math.round((1 - alpha) * 10) / 10} />
        </div>
      )}
      <div className="flex items-center justify-between mt-3">
        <span className="stars text-sm">{stars(book.rating)}</span>
        <button
          type="button"
          onClick={() => onDelete(book.id)}
          className="text-xs text-zinc-500 hover:text-red-400"
        >
          Delete
        </button>
      </div>
    </article>
  );
}
