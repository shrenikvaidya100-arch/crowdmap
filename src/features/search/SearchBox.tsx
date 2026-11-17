"use client";
// Search with suggestions as you type. Keyboard: ↑/↓ to move, Enter to pick,
// Esc to close. Accessible combobox pattern.
import { useEffect, useId, useRef, useState } from "react";
import { config, type Language } from "@/lib/config";
import { translator } from "@/lib/i18n";
import { CATEGORY_ICON } from "@/features/crowd/config";
import { messages } from "./messages";
import { SEARCH_MAX, SEARCH_MIN } from "./validation";

export type SearchHit = {
  id: string; name: string; name_hi: string | null; category: string; city_id: string;
  lat: number; lng: number; level: number; source: "live" | "estimated";
};

const levelColor = (l: number) => config.crowd.levels.find((x) => x.level === l)?.color ?? config.crowd.noDataColor;

export function SearchBox({
  lang, city, cityNames, onPick,
}: {
  lang: Language;
  city: string | null;
  cityNames: Record<string, string>;
  onPick: (hit: SearchHit) => void;
}) {
  const t = translator(messages, lang);
  const listId = useId();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);

  const trimmed = q.trim();
  const tooLong = trimmed.length > SEARCH_MAX;
  const searchable = trimmed.length >= SEARCH_MIN && !tooLong;

  // Debounced fetch; older requests are cancelled.
  useEffect(() => {
    if (!searchable) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setStatus("loading");
      try {
        const params = new URLSearchParams({ q: trimmed });
        if (city) params.set("city", city);
        const res = await fetch(`/api/search?${params}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(String(res.status));
        setHits(await res.json());
        setActive(-1);
        setStatus("done");
      } catch (err) {
        if ((err as Error).name !== "AbortError") setStatus("error");
      }
    }, 200);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [trimmed, searchable, city]);

  // Close when clicking elsewhere.
  useEffect(() => {
    const onDown = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  function pick(hit: SearchHit) {
    setQ(lang === "hi" && hit.name_hi ? hit.name_hi : hit.name);
    setOpen(false);
    onPick(hit);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, hits.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") {
      const hit = hits[active >= 0 ? active : 0];
      if (open && searchable && hit) { e.preventDefault(); pick(hit); }
    } else if (e.key === "Escape") setOpen(false);
  }

  const showList = open && (tooLong || (searchable && status !== "idle"));
  const visibleHits = searchable ? hits : [];

  return (
    <div ref={box} className="relative w-full sm:w-96">
      <div className="flex items-center rounded-full bg-white shadow ring-1 ring-black/5 focus-within:ring-2 focus-within:ring-blue-500 dark:bg-gray-900 dark:ring-white/10">
        <span aria-hidden className="pl-3.5 text-gray-400">⌕</span>
        <input
          type="search" value={q} maxLength={SEARCH_MAX + 20}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)} onKeyDown={onKeyDown}
          role="combobox" aria-expanded={showList} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          aria-label={t("label")} aria-invalid={tooLong} placeholder={t("placeholder")}
          className="w-full min-w-0 bg-transparent px-2.5 py-2.5 text-sm outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {q && (
          <button type="button" aria-label={t("clear")} onClick={() => { setQ(""); setHits([]); setStatus("idle"); }}
                  className="mr-1.5 rounded-full px-2 py-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            <span aria-hidden>✕</span>
          </button>
        )}
      </div>

      {showList && (
        <ul id={listId} role="listbox" aria-label={t("label")}
            className="absolute inset-x-0 top-full z-40 mt-1.5 max-h-80 overflow-y-auto rounded-xl bg-white py-1 shadow-lg ring-1 ring-black/5 dark:bg-gray-900 dark:ring-white/10">
          {tooLong && <li className="px-4 py-2.5 text-sm text-red-600">{t("tooLong")}</li>}
          {!tooLong && status === "loading" && visibleHits.length === 0 && <li className="px-4 py-2.5 text-sm text-gray-500">{t("searching")}</li>}
          {!tooLong && status === "error" && <li className="px-4 py-2.5 text-sm text-red-600">{t("error")}</li>}
          {!tooLong && status === "done" && visibleHits.length === 0 && <li className="px-4 py-2.5 text-sm text-gray-500">{t("noResults", { q: trimmed })}</li>}
          {!tooLong && visibleHits.map((h, i) => (
            <li key={h.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}
                onPointerDown={(e) => { e.preventDefault(); pick(h); }} onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center gap-3 px-4 py-2 text-sm ${i === active ? "bg-blue-50 dark:bg-gray-800" : ""}`}>
              <span aria-hidden className="text-lg">{CATEGORY_ICON[h.category] ?? "📍"}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{lang === "hi" && h.name_hi ? h.name_hi : h.name}</span>
                <span className="block truncate text-xs text-gray-500">{cityNames[h.city_id] ?? h.city_id}</span>
              </span>
              <span className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: levelColor(h.level), opacity: h.source === "live" ? 1 : 0.6 }} />
                {t(`level.${h.level}`)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
