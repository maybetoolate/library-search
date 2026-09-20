import { useEffect, useRef, useState } from "react";

type Suggestion = {
  id: string;
  title: string;
  author: string;
  genre: string | null;
  sim: number;
};

export default function SearchBox({
  query,
  setQuery,
  onSearch,
}: {
  query: string;
  setQuery: (v: string) => void;
  onSearch: () => void;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/books/autocomplete?q=${encodeURIComponent(query.trim())}`);
        const list = (await r.json()) as Suggestion[];
        setSuggestions(list);
        setOpen(list.length > 0);
        setHighlight(-1);
      } catch {
        /* autocomplete is best-effort */
      }
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function pick(s: Suggestion) {
    setQuery(s.title);
    setOpen(false);
    onSearch();
  }

  return (
    <div ref={boxRef} className="relative flex-1">
      <input
        type="text"
        placeholder='Try "space adventure", "love and social class"…'
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            if (highlight >= 0 && suggestions[highlight]) {
              pick(suggestions[highlight]);
            } else {
              setOpen(false);
              onSearch();
            }
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, -1));
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-base outline-none focus:border-emerald-500 placeholder:text-zinc-500"
      />
      {open && (
        <ul className="absolute z-10 left-0 right-0 mt-1 max-h-[60vh] overflow-y-auto bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl">
          {suggestions.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
                onMouseEnter={() => setHighlight(i)}
                className={`w-full text-left px-4 py-3 flex items-center justify-between gap-2 ${
                  i === highlight ? "bg-zinc-800" : ""
                }`}
              >
                <span className="text-sm min-w-0 flex-1 truncate">
                  <span className="font-medium">{s.title}</span>
                  <span className="text-zinc-500"> · {s.author}</span>
                </span>
                {s.genre && (
                  <span className="text-xs shrink-0 rounded-full border border-emerald-700 bg-emerald-950 px-2 py-0.5 text-emerald-300">
                    {s.genre}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
