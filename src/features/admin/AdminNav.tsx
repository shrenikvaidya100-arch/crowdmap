"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Language } from "@/lib/config";
import { translator } from "@/lib/i18n";
import { messages } from "./messages";

const TABS = [["/admin", "nav.overview"], ["/admin/users", "nav.users"], ["/admin/content", "nav.content"], ["/admin/log", "nav.log"]] as const;

export function AdminNav({ lang }: { lang: Language }) {
  const t = translator(messages, lang);
  const path = usePathname();
  return (
    <nav aria-label={t("title")} className="flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-800">
      {TABS.map(([href, key]) => {
        const active = href === "/admin" ? path === href : path.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${active ? "border-blue-600 text-blue-700 dark:text-blue-300" : "border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400"}`}>
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}
