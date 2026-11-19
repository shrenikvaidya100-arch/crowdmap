"use client";
// Admin console sidebar. On larger screens it collapses to an icon rail (the
// choice is remembered in localStorage); on phones it opens over the page from
// a menu button and closes on Escape, a tap outside, or a page change.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState, useSyncExternalStore } from "react";
import { Icon, type IconName } from "@/components/icons/Icon";
import type { Language } from "@/lib/config";
import { translator } from "@/lib/i18n";
import { messages } from "./messages";

const TABS: [string, string, IconName][] = [
  ["/admin", "nav.overview", "dashboard"],
  ["/admin/users", "nav.users", "users"],
  ["/admin/insights", "nav.insights", "chart"],
  ["/admin/content", "nav.content", "image"],
  ["/admin/bots", "nav.bots", "bot"],
  ["/admin/log", "nav.log", "list"],
];

const KEY = "crowdmap-admin-sidebar";
const listeners = new Set<() => void>();
const readCollapsed = () => {
  try { return localStorage.getItem(KEY) === "collapsed"; } catch { return false; }
};
function setCollapsed(v: boolean) {
  try { localStorage.setItem(KEY, v ? "collapsed" : "expanded"); } catch { /* private mode */ }
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

/** Label shown beside a rail icon on hover or keyboard focus. */
function Tip({ children, show }: { children: ReactNode; show: boolean }) {
  if (!show) return null;
  return (
    <span role="tooltip"
          className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/tip:opacity-100 group-focus-visible/tip:opacity-100 dark:bg-zinc-100 dark:text-zinc-900">
      {children}
    </span>
  );
}

export function AdminSidebar({ lang, children }: { lang: Language; children: ReactNode }) {
  const t = translator(messages, lang);
  const path = usePathname();
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(path);
  // A page change closes the phone overlay.
  if (mobileOpen && openedAt !== path) setMobileOpen(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMobileOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const rail = collapsed && !mobileOpen;
  const toggle = () => {
    if (window.matchMedia("(min-width: 768px)").matches) setCollapsed(!collapsed);
    else { setOpenedAt(path); setMobileOpen((o) => !o); }
  };
  const toggleButton = (
    <button type="button" onClick={toggle} aria-label={t("sidebar.toggle")} aria-expanded={mobileOpen || !collapsed}
            aria-controls="admin-sidebar"
            className="group/tip relative grid h-9 w-9 shrink-0 place-items-center text-zinc-500 outline-none hover:bg-white hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100">
      <Icon name="sidebar_toggle" size={18} className={rail ? "" : "md:rotate-180"} />
      <Tip show>{t("sidebar.toggle")}</Tip>
    </button>
  );

  return (
    <div className="flex min-h-[calc(100svh-4rem)] flex-1">
      {/* Phone backdrop */}
      {mobileOpen && <div aria-hidden className="fixed inset-0 top-16 z-30 bg-black/40 backdrop-blur-[2px] md:hidden" onClick={() => setMobileOpen(false)} />}

      <aside id="admin-sidebar" aria-label={t("sidebar.menu")}
             className={`fixed bottom-0 left-0 top-16 z-40 flex flex-col border-r border-zinc-900/15 bg-[#f3efe4] transition-[width,transform] duration-200 ease-out dark:border-zinc-800 dark:bg-zinc-900
                         md:sticky md:top-16 md:h-[calc(100svh-4rem)] md:translate-x-0 ${mobileOpen ? "w-60 translate-x-0" : "w-60 -translate-x-full"} ${rail ? "md:w-14" : "md:w-60"}`}>
        <div className={`flex h-14 items-center gap-2 border-b border-zinc-900/15 px-3 dark:border-zinc-800 ${rail ? "md:justify-center md:px-2" : ""}`}>
          <span className={`min-w-0 flex-1 truncate font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-600 dark:text-zinc-400 ${rail ? "md:hidden" : ""}`}>{t("sidebar.workspace")}</span>
          {toggleButton}
        </div>
        <nav aria-label={t("title")} className={`flex flex-1 flex-col gap-0.5 overflow-y-auto p-2 ${rail ? "md:overflow-visible" : ""}`}>
          {TABS.map(([href, key, icon]) => {
            const active = href === "/admin" ? path === href : path.startsWith(href);
            return (
              <Link key={href} href={href} aria-current={active ? "page" : undefined}
                    className={`group/tip relative flex h-9 items-center gap-3 border-l-[3px] px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-zinc-900
                                ${active ? "border-zinc-900 bg-white font-semibold text-zinc-900 dark:border-zinc-100 dark:bg-zinc-950 dark:text-zinc-50" : "border-transparent text-zinc-600 hover:border-zinc-400 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"}
                                ${rail ? "md:justify-center md:px-0" : ""}`}>
                <Icon name={icon} size={18} className="shrink-0" />
                <span className={rail ? "md:sr-only" : ""}>{t(key)}</span>
                <Tip show={rail}>{t(key)}</Tip>
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Phone: the menu button that opens the sidebar */}
        <div className="flex items-center gap-2 border-b border-zinc-900/15 px-3 py-2 md:hidden dark:border-zinc-800">
          {toggleButton}
          <span className="text-sm font-medium">{t(TABS.find(([href]) => (href === "/admin" ? path === href : path.startsWith(href)))?.[1] ?? "title")}</span>
        </div>
        {children}
      </div>
    </div>
  );
}
