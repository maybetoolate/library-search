import type { Weights } from "../types";
import SearchBox from "./SearchBox";

function Slider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-emerald-400 font-mono text-xs">{value}</span>
      </div>
      <input
        type="range"
        min="0"
        max="10"
        step="0.5"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full h-8 accent-emerald-500"
      />
    </label>
  );
}

export default function SearchPanel(props: {
  query: string;
  setQuery: (v: string) => void;
  genre: string;
  setGenre: (v: string) => void;
  author: string;
  setAuthor: (v: string) => void;
  rating: string;
  setRating: (v: string) => void;
  limit: string;
  setLimit: (v: string) => void;
  weights: Weights;
  setWeights: (w: Weights) => void;
  resetWeights: () => void;
  alpha: number;
  setAlpha: (v: number) => void;
  onSearch: () => void;
  onBrowse: () => void;
}) {
  const { weights, setWeights } = props;
  return (
    <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sm:p-5 mb-4 sm:mb-6 shadow">
      <div className="flex flex-col sm:flex-row gap-2">
        <SearchBox query={props.query} setQuery={props.setQuery} onSearch={props.onSearch} />
        <div className="grid grid-cols-2 sm:flex gap-2">
          <button
            type="button"
            onClick={props.onSearch}
            className="bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-400 text-zinc-950 font-semibold px-6 py-3 sm:py-0 rounded-xl"
          >
            Search
          </button>
          <button
            type="button"
            onClick={props.onBrowse}
            className="bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-700 border border-zinc-700 px-5 py-3 sm:py-0 rounded-xl"
          >
            Browse
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 mt-3 sm:mt-4">
        <select
          value={props.genre}
          onChange={(e) => props.setGenre(e.target.value)}
          className="w-full min-w-0 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-base sm:text-sm"
        >
          <option value="">All genres</option>
          <option value="Fiction">Fiction</option>
          <option value="Science Fiction">Science Fiction</option>
          <option value="Fantasy">Fantasy</option>
          <option value="Romance">Romance</option>
        </select>
        <input
          type="text"
          placeholder="Author contains…"
          value={props.author}
          onChange={(e) => props.setAuthor(e.target.value)}
          className="w-full min-w-0 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-base sm:text-sm outline-none focus:border-emerald-500"
        />
        <select
          value={props.rating}
          onChange={(e) => props.setRating(e.target.value)}
          className="w-full min-w-0 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-base sm:text-sm"
        >
          <option value="">Any rating</option>
          <option value="5">★ 5 only</option>
          <option value="4">★ 4+</option>
          <option value="3">★ 3+</option>
        </select>
        <select
          value={props.limit}
          onChange={(e) => props.setLimit(e.target.value)}
          className="w-full min-w-0 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-base sm:text-sm"
        >
          <option value="10">Top 10</option>
          <option value="5">Top 5</option>
          <option value="20">Top 20</option>
        </select>
      </div>

      <div className="mt-4 pt-4 border-t border-zinc-800">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
            Ranking
          </span>
        </div>
        <label className="flex flex-col gap-1 mb-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Keyword ↔ Semantic</span>
            <span className="text-emerald-400 font-mono text-xs">
              {Math.round((1 - props.alpha) * 100)}% / {Math.round(props.alpha * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={props.alpha}
            onChange={(e) => props.setAlpha(parseFloat(e.target.value))}
            className="w-full h-8 accent-emerald-500"
          />
        </label>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
            Field weights
          </span>
          <button
            type="button"
            onClick={props.resetWeights}
            className="text-xs text-zinc-500 hover:text-emerald-400"
          >
            Reset defaults
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 sm:gap-4">
          <Slider label="Title" value={weights.title} onChange={(v) => setWeights({ ...weights, title: v })} />
          <Slider label="Author" value={weights.author} onChange={(v) => setWeights({ ...weights, author: v })} />
          <Slider label="Genre" value={weights.genre} onChange={(v) => setWeights({ ...weights, genre: v })} />
          <Slider label="Description" value={weights.description} onChange={(v) => setWeights({ ...weights, description: v })} />
        </div>
      </div>
    </section>
  );
}
