import Link from "next/link";
import { Icon } from "@/components/icons/Icon";

export function SiteFooter({ links, note }: { links: { label: string; href: string }[]; note: string }) {
  return (
    <footer className="border-t border-zinc-800 bg-black px-4 py-10 text-sm text-zinc-400 sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-sm">
          <p className="flex items-center gap-2 font-semibold text-zinc-100">
            <span aria-hidden className="grid h-6 w-6 place-items-center rounded-md bg-blue-600 text-white"><Icon name="logo" size={15} /></span>
            CrowdMap
          </p>
          <p className="mt-2">{note}</p>
        </div>
        <nav aria-label="Footer">
          <ul className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-3">
            {links.map((l) => <li key={l.href}><Link href={l.href} className="hover:text-zinc-100">{l.label}</Link></li>)}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
