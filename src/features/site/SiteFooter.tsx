import Link from "next/link";
import { setLanguage } from "@/app/lang-actions";
import { Icon } from "@/components/icons/Icon";
import { getLang } from "@/lib/i18n/server";

export async function SiteFooter({ links, note }: { links: { label: string; href: string }[]; note: string }) {
  const lang = await getLang();
  return (
    <footer className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black px-4 py-10 text-sm text-zinc-600 dark:text-zinc-400 sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-sm">
          <p className="flex items-center gap-2 font-semibold text-zinc-900 dark:text-zinc-100">
            <span aria-hidden className="grid h-6 w-6 place-items-center rounded-md bg-blue-600 text-white"><Icon name="logo" size={15} /></span>
            CrowdMap
          </p>
          <p className="mt-2">{note}</p>
          {/* Language lives here now that the header only holds the bubbles. */}
          <form action={setLanguage} className="mt-4">
            <input type="hidden" name="lang" value={lang === "en" ? "hi" : "en"} />
            <button type="submit" className="rounded-full border border-zinc-300 dark:border-zinc-700 px-3 py-1 text-xs text-zinc-700 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
              {lang === "en" ? "हिन्दी" : "English"}
            </button>
          </form>
        </div>
        <nav aria-label="Footer">
          <ul className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-3">
            {links.map((l) => <li key={l.href}><Link href={l.href} className="hover:text-zinc-900 dark:hover:text-zinc-100">{l.label}</Link></li>)}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
