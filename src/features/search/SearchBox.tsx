"use client";
import { Icon, type IconName } from "@/components/icons/Icon";
// Search with suggestions. Empty box: recent searches and places busy right now.
// Typing: CrowdMap places (with their crowd level), your own pins, and every other
// point on the map (shops, streets, landmarks, areas, from OpenStreetMap).
// Typing a letter or number anywhere on the page (outside another text box) goes
// straight into this box. Keyboard: ↑/↓ to move, Enter to pick, Esc to close.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { config, type Language } from "@/lib/config";
import { translator } from "@/lib/i18n";
import { categoryIcon } from "@/features/crowd/config";
import { messages } from "./messages";
import { SEARCH_MAX, SEARCH_MIN } from "./validation";
import { logSearch } from "./logSearch";

export type SearchHit = {
  id: string; name: string; name_hi: string | null; category: string; city_id: string;
  lat: number; lng: number; level: number; source: "live" | "estimated";
};
/** A point that isn't a CrowdMap place: a map feature or one of your pins. */
export type SearchPoint = { name: string; lat: number; lng: number; where?: string; kind?: string };
type Pin = { id: string; name: string; lat: number; lng: number; color: string };
type Item =
  | { type: "place"; key: string; hit: SearchHit }
  | { type: "pin"; key: string; pin: Pin }
  | { type: "point"; key: string; point: SearchPoint }
  | { type: "recent"; key: string; q: string };

const levelColor = (l: number) => config.crowd.levels.find((x) => x.level === l)?.color ?? config.crowd.noDataColor;
const RECENT = "crowdmap-recent-searches";
const readRecent = (): string[] => { try { return JSON.parse(localStorage.getItem(RECENT) ?? "[]"); } catch { return []; } };
const saveRecent = (q: string) => {
  try {
    const next = [q, ...readRecent().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, config.geocoder.recentSearches);
    localStorage.setItem(RECENT, JSON.stringify(next));
  } catch { /* private mode */ }
};
const pointIcon = (kind?: string): IconName => {
  const k = kind ?? "";
  if (/restaurant|food|fast|cafe|bakery/.test(k)) return "restaurant";
  if (/temple|place of worship|mosque|church/.test(k)) return "temple";
  if (/hospital|clinic|pharmacy|doctors/.test(k)) return "hospital";
  if (/school|college|university/.test(k)) return "education";
  if (/park|garden/.test(k)) return "park";
  if (/station|bus|railway|stop/.test(k)) return "station";
  if (/shop|mall|market|supermarket/.test(k)) return "market";
  return "pin";
};
type Section = "sec.recent" | "sec.pins" | "sec.points" | "sec.places" | "sec.popular";

export function SearchBox({
  lang, city, cityNames, onPick, onPickPoint, center = null, pins = [], popular = [], captureTyping = true,
}: {
  lang: Language;
  city: string | null;
  cityNames: Record<string, string>;
  onPick: (hit: SearchHit) => void;
  /** A map point or a pin was picked (not a CrowdMap place). */
  onPickPoint?: (p: SearchPoint) => void;
  /** Map centre: nearer map points come first. */
  center?: { lat: number; lng: number } | null;
  pins?: Pin[];
  /** Suggestions while the box is empty (e.g. places busy right now). */
  popular?: SearchHit[];
  /** Send letters typed anywhere on the page to this box. */
  captureTyping?: boolean;
}) {
  const t = translator(messages, lang);
  const listId = useId();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [points, setPoints] = useState<SearchPoint[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const centerRef = useRef(center);
  useEffect(() => { centerRef.current = center; }, [center]);

  const trimmed = q.trim();
  const tooLong = trimmed.length > SEARCH_MAX;
  const searchable = trimmed.length >= SEARCH_MIN && !tooLong;

  // Debounced fetch of CrowdMap places and map points together; older requests are cancelled.
  useEffect(() => {
    if (!searchable) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setStatus("loading");
      const c = centerRef.current;
      const params = new URLSearchParams({ q: trimmed });
      if (city) params.set("city", city);
      const geo = new URLSearchParams({ q: trimmed, lang, lat: String(c?.lat ?? 22.72), lng: String(c?.lng ?? 75.86) });
      const [placesRes, pointsRes] = await Promise.allSettled([
        fetch(`/api/search?${params}`, { signal: ctrl.signal }).then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
        fetch(`/api/geo?${geo}`, { signal: ctrl.signal }).then((r) => (r.ok ? r.json() : { points: [] })),
      ]);
      if (ctrl.signal.aborted) return;
      if (placesRes.status === "rejected" && pointsRes.status === "rejected") { setStatus("error"); return; }
      setHits(placesRes.status === "fulfilled" ? placesRes.value : []);
      setPoints(pointsRes.status === "fulfilled" ? pointsRes.value.points ?? [] : []);
      setActive(-1);
      setStatus("done");
    }, 180);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [trimmed, searchable, city, lang]);

  // Close when clicking elsewhere.
  useEffect(() => {
    const onDown = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  // Typing anywhere goes to search, unless another field has the focus.
  useEffect(() => {
    if (!captureTyping) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing || e.key.length !== 1 || !/[\p{L}\p{N}]/u.test(e.key)) return;
      const el = document.activeElement as HTMLElement | null;
      if (el?.closest('input, textarea, select, [contenteditable="true"], [role="slider"], dialog[open]')) return;
      e.preventDefault();
      setQ((cur) => cur + e.key);
      setRecent(readRecent());
      setOpen(true);
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [captureTyping]);

  // The list: suggestions while empty; otherwise places, pins and map points.
  const items: Item[] = useMemo(() => {
    if (!searchable) {
      if (trimmed) return [];
      return [
        ...recent.map((r): Item => ({ type: "recent", key: `r-${r}`, q: r })),
        ...popular.slice(0, 5).map((h): Item => ({ type: "place", key: `s-${h.id}`, hit: h })),
      ];
    }
    const needle = trimmed.toLowerCase();
    const placeNames = new Set(hits.map((h) => h.name.toLowerCase()));
    return [
      ...hits.map((h): Item => ({ type: "place", key: `p-${h.id}`, hit: h })),
      ...pins.filter((p) => p.name.toLowerCase().includes(needle)).slice(0, 3).map((p): Item => ({ type: "pin", key: `m-${p.id}`, pin: p })),
      ...points.filter((p) => !placeNames.has(p.name.toLowerCase())).map((p, i): Item => ({ type: "point", key: `g-${i}-${p.name}`, point: p })),
    ];
  }, [searchable, trimmed, recent, popular, hits, pins, points]);

  // The input, looked up by id (pick runs from option events).
  const inputEl = () => document.getElementById(`${listId}-input`) as HTMLInputElement | null;
  function pick(item: Item) {
    if (item.type === "recent") { setQ(item.q); setOpen(true); inputEl()?.focus(); return; }
    logSearch(q, hits.length, city);
    if (trimmed) { saveRecent(trimmed); setRecent(readRecent()); }
    setOpen(false);
    if (item.type === "place") {
      setQ(lang === "hi" && item.hit.name_hi ? item.hit.name_hi : item.hit.name);
      onPick(item.hit);
    } else if (item.type === "pin") {
      setQ(item.pin.name);
      onPickPoint?.({ name: item.pin.name, lat: item.pin.lat, lng: item.pin.lng });
    } else {
      setQ(item.point.name);
      onPickPoint?.(item.point);
    }
    inputEl()?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") {
      const item = items[active >= 0 ? active : 0];
      if (open && item) { e.preventDefault(); pick(item); }
    } else if (e.key === "Escape") { setOpen(false); input.current?.blur(); }
  }

  const showList = open && (tooLong || items.length > 0 || (searchable && status !== "idle"));
  const sectionOf = (it: Item): Section =>
    it.type === "recent" ? "sec.recent" : it.type === "pin" ? "sec.pins" : it.type === "point" ? "sec.points" : searchable ? "sec.places" : "sec.popular";

  return (
    <div ref={box} className="relative w-full sm:w-96">
      <div className="flex items-center rounded-full bg-white shadow ring-1 ring-black/5 focus-within:ring-2 focus-within:ring-blue-500 dark:bg-gray-900 dark:ring-white/10">
        <Icon name="search" size={18} className="ml-3.5 shrink-0 text-gray-400" />
        <input
          ref={input} id={`${listId}-input`} type="search" value={q} maxLength={SEARCH_MAX + 20}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => { setRecent(readRecent()); setOpen(true); }} onKeyDown={onKeyDown}
          role="combobox" aria-expanded={showList} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          aria-label={t("label")} aria-invalid={tooLong} placeholder={t("placeholder")}
          className="w-full min-w-0 bg-transparent px-2.5 py-2.5 text-sm outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {q && (
          <button type="button" aria-label={t("clear")} onClick={() => { setQ(""); setHits([]); setPoints([]); setStatus("idle"); input.current?.focus(); }}
                  className="mr-1.5 rounded-full px-2 py-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            <Icon name="close" size={16} />
          </button>
        )}
      </div>

      {showList && (
        <ul id={listId} role="listbox" aria-label={t("label")}
            className="absolute inset-x-0 top-full z-40 mt-1.5 max-h-96 overflow-y-auto rounded-xl bg-white py-1 shadow-lg ring-1 ring-black/5 motion-safe:animate-[pop_140ms_ease-out] dark:bg-gray-900 dark:ring-white/10">
          {tooLong && <li className="px-4 py-2.5 text-sm text-red-600">{t("tooLong")}</li>}
          {!tooLong && searchable && status === "loading" && items.length === 0 && <li className="px-4 py-2.5 text-sm text-gray-500">{t("searching")}</li>}
          {!tooLong && searchable && status === "error" && <li className="px-4 py-2.5 text-sm text-red-600">{t("error")}</li>}
          {!tooLong && searchable && status === "done" && items.length === 0 && <li className="px-4 py-2.5 text-sm text-gray-500">{t("noResults", { q: trimmed })}</li>}
          {!tooLong && items.map((it, i) => {
            const sec = sectionOf(it);
            const showHeading = i === 0 || sectionOf(items[i - 1]) !== sec;
            return (
              <li key={it.key} role="presentation">
                {showHeading && (
                  <p className="flex items-center justify-between px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    {t(sec)}
                    {sec === "sec.recent" && (
                      <button type="button" className="normal-case tracking-normal text-blue-600 hover:underline"
                              onPointerDown={(e) => { e.preventDefault(); try { localStorage.removeItem(RECENT); } catch { /* private mode */ } setRecent([]); }}>
                        {t("clearRecent")}
                      </button>
                    )}
                  </p>
                )}
                <div id={`${listId}-${i}`} role="option" aria-selected={i === active}
                     onPointerDown={(e) => { e.preventDefault(); pick(it); }} onMouseEnter={() => setActive(i)}
                     className={`flex cursor-crosshair items-center gap-3 px-4 py-2 text-sm ${i === active ? "bg-blue-50 dark:bg-gray-800" : ""}`}>
                  {it.type === "place" && (
                    <>
                      <Icon name={categoryIcon(it.hit.category)} size={20} className="shrink-0 text-gray-500" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{lang === "hi" && it.hit.name_hi ? it.hit.name_hi : it.hit.name}</span>
                        <span className="block truncate text-xs text-gray-500">{cityNames[it.hit.city_id] ?? it.hit.city_id}</span>
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: levelColor(it.hit.level), opacity: it.hit.source === "live" ? 1 : 0.6 }} />
                        {t(`level.${it.hit.level}`)}
                      </span>
                    </>
                  )}
                  {it.type === "pin" && (
                    <>
                      <span className="h-3.5 w-3.5 shrink-0 rounded-full shadow ring-2 ring-white" style={{ background: it.pin.color }} />
                      <span className="min-w-0 flex-1 truncate font-medium">{it.pin.name}</span>
                      <span className="text-xs text-gray-500">{t("pin")}</span>
                    </>
                  )}
                  {it.type === "point" && (
                    <>
                      <Icon name={pointIcon(it.point.kind)} size={20} className="shrink-0 text-gray-400" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{it.point.name}</span>
                        <span className="block truncate text-xs capitalize text-gray-500">{[it.point.kind, it.point.where].filter(Boolean).join(" · ")}</span>
                      </span>
                    </>
                  )}
                  {it.type === "recent" && (
                    <>
                      <Icon name="hourglass" size={18} className="shrink-0 text-gray-400" />
                      <span className="min-w-0 flex-1 truncate">{it.q}</span>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
