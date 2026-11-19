// Small server-rendered building blocks for admin pages: filter bar and pager.
// Filters are plain GET forms, so every view has a shareable URL.
import Link from "next/link";
import type { ReactNode } from "react";

export const inputCls = "rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-950";

export function FilterBar({ action, children, applyLabel, clearLabel }: {
  action: string; children: ReactNode; applyLabel: string; clearLabel: string;
}) {
  return (
    <form action={action} method="get" className="flex flex-wrap items-end gap-2 border border-zinc-900/20 bg-[#f3efe4] p-3 dark:border-zinc-800 dark:bg-zinc-900">
      {children}
      <button className="border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700">{applyLabel}</button>
      <Link href={action} className="px-2 py-1.5 text-sm text-gray-600 hover:underline dark:text-gray-400">{clearLabel}</Link>
    </form>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-400">
      {label}
      {children}
    </label>
  );
}

export function Pager({ base, params, page, pages, label, prev, next }: {
  base: string; params: Record<string, string | undefined>; page: number; pages: number;
  label: string; prev: string; next: string;
}) {
  const href = (p: number) => {
    const q = new URLSearchParams(Object.entries({ ...params, page: String(p) }).filter(([, v]) => v) as [string, string][]);
    return `${base}?${q}`;
  };
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      {page > 1 ? <Link href={href(page - 1)} className="underline underline-offset-2 hover:no-underline">{prev}</Link> : <span />}
      <span className="text-gray-500">{label}</span>
      {page < pages ? <Link href={href(page + 1)} className="underline underline-offset-2 hover:no-underline">{next}</Link> : <span />}
    </div>
  );
}

export function Badge({ tone, children }: { tone: "red" | "green" | "blue" | "amber" | "gray"; children: ReactNode }) {
  const tones = {
    red: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
    green: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
    blue: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
    gray: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  };
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}
