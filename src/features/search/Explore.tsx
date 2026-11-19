"use client";
import { Icon } from "@/components/icons/Icon";
// Filters panel and the sortable list of places that match them.
import { useState } from "react";
import { config, type Language } from "@/lib/config";
import { translator } from "@/lib/i18n";
import { categoryIcon } from "@/features/crowd/config";
import { DEFAULT_FILTERS, GROUPS, RADII_KM, type FilterablePlace, type Filters, type SortKey } from "./filters";
import { messages } from "./messages";

const levelColor = (l: number) => config.crowd.levels.find((x) => x.level === l)?.color ?? config.crowd.noDataColor;
const chip = (on: boolean) =>
  `rounded-full border px-3 py-1.5 text-sm ${on
    ? "border-blue-600 bg-blue-600 text-white"
    : "border-gray-300 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800"}`;

export function FilterSheet({
  lang, filters, onChange, onClose, origin, onUseLocation, locError,
}: {
  lang: Language;
  filters: Filters;
  onChange: (f: Filters) => void;
  onClose: () => void;
  origin: "me" | "centre";
  onUseLocation: () => void;
  locError: string;
}) {
  const t = translator(messages, lang);
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const toggleGroup = (key: string) =>
    set({ groups: filters.groups.includes(key) ? filters.groups.filter((g) => g !== key) : [...filters.groups, key] });

  return (
    <section aria-label={t("filters")}
             className="absolute inset-x-0 bottom-0 z-30 max-h-[80%] overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl sm:inset-x-auto sm:bottom-auto sm:left-3 sm:top-[9.5rem] sm:max-h-[calc(100%-10.5rem)] sm:w-96 sm:rounded-2xl dark:bg-gray-900">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("filters")}</h2>
        <button type="button" className="text-sm text-blue-600 hover:underline" onClick={() => onChange({ ...DEFAULT_FILTERS })}>{t("reset")}</button>
      </div>

      <fieldset className="mb-4">
        <legend className="mb-2 text-sm font-medium">{t("category")}</legend>
        <div className="flex flex-wrap gap-2">
          {GROUPS.map((g) => (
            <button key={g.key} type="button" aria-pressed={filters.groups.includes(g.key)}
                    className={chip(filters.groups.includes(g.key))} onClick={() => toggleGroup(g.key)}>
              <Icon name={g.icon} size={16} className="inline" /> {t(`group.${g.key}`)}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="mb-4">
        <legend className="mb-2 text-sm font-medium">{t("crowd")}</legend>
        <div className="flex flex-wrap gap-2">
          {([5, 3, 2] as const).map((lvl) => (
            <button key={lvl} type="button" aria-pressed={filters.maxLevel === lvl}
                    className={chip(filters.maxLevel === lvl)} onClick={() => set({ maxLevel: lvl })}>
              {t(`crowd.${lvl}`)}
            </button>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={filters.liveOnly} onChange={(e) => set({ liveOnly: e.target.checked })}
                 className="h-4 w-4 accent-blue-600" />
          {t("liveOnly")}
        </label>
      </fieldset>

      <fieldset className="mb-4">
        <legend className="mb-2 text-sm font-medium">{t("distance")}</legend>
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={filters.radiusKm === null} className={chip(filters.radiusKm === null)}
                  onClick={() => set({ radiusKm: null })}>{t("anyDistance")}</button>
          {RADII_KM.map((km) => (
            <button key={km} type="button" aria-pressed={filters.radiusKm === km} className={chip(filters.radiusKm === km)}
                    onClick={() => set({ radiusKm: km })}>{t("km", { n: km })}</button>
          ))}
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
          {t(origin === "me" ? "usingMyLocation" : "usingMapCentre")}
          {origin === "centre" && (
            <button type="button" className="text-blue-600 hover:underline" onClick={onUseLocation}><Icon name="locate" size={16} className="inline" /> {t("nearMe")}</button>
          )}
        </p>
        {locError && <p className="mt-1 text-xs text-red-600">{locError}</p>}
      </fieldset>

      <label className="mb-4 block">
        <span className="mb-2 block text-sm font-medium">{t("sort")}</span>
        <select value={filters.sort} onChange={(e) => set({ sort: e.target.value as SortKey })}
                className="w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm dark:border-gray-600">
          {(["quietest", "busiest", "nearest", "name"] as const).map((s) => (
            <option key={s} value={s}>{t(`sort.${s}`)}</option>
          ))}
        </select>
      </label>

      <button type="button" onClick={onClose}
              className="w-full rounded-md bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700">{t("done")}</button>
    </section>
  );
}

const PAGE = 50;

export function PlaceList<T extends FilterablePlace & { distanceKm: number | null }>({
  lang, items, total, onPick, onClose,
}: {
  lang: Language;
  items: T[];
  total: number;
  onPick: (p: T) => void;
  onClose: () => void;
}) {
  const t = translator(messages, lang);
  const [shown, setShown] = useState(PAGE);
  return (
    <section aria-label={t("list")}
             className="absolute inset-x-0 bottom-0 top-[9.5rem] z-20 flex flex-col bg-white shadow-xl sm:inset-x-auto sm:bottom-3 sm:left-3 sm:w-96 sm:rounded-2xl dark:bg-gray-900">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5 text-sm dark:border-gray-800">
        <span aria-live="polite">{t("showing", { n: items.length, total })}</span>
        <button type="button" onClick={onClose} className="text-blue-600 hover:underline sm:hidden">{t("map")}</button>
      </div>
      {items.length === 0 ? (
        <p className="p-4 text-sm text-gray-500">{t("empty")}</p>
      ) : (
        <ul className="flex-1 overflow-y-auto">
          {items.slice(0, shown).map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onPick(p)}
                      className="flex w-full items-center gap-3 border-b border-gray-50 px-4 py-2.5 text-left hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800">
                <Icon name={categoryIcon(p.category)} size={20} className="shrink-0 text-gray-500" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{lang === "hi" && p.name_hi ? p.name_hi : p.name}</span>
                  {p.distanceKm !== null && (
                    <span className="block text-xs text-gray-500">
                      {p.distanceKm < 1 ? `${Math.round(p.distanceKm * 1000)} m` : `${p.distanceKm.toFixed(1)} km`}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-xs">
                  <span className="h-3 w-3 rounded-full" style={{ background: levelColor(p.level), opacity: p.source === "live" ? 1 : 0.6 }} />
                  {t(`level.${p.level}`)}
                  {p.source === "live" && (p.sample
                    ? <span className="font-semibold text-amber-600">{t("sample")}</span>
                    : <span className="inline-flex items-center gap-1 font-semibold text-red-600"><span className="h-1.5 w-1.5 rounded-full bg-current" />{t("live")}</span>)}
                </span>
              </button>
            </li>
          ))}
          {items.length > shown && (
            <li className="p-3 text-center">
              <button type="button" className="text-sm text-blue-600 hover:underline" onClick={() => setShown((n) => n + PAGE)}>
                {t("showMore")}
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
