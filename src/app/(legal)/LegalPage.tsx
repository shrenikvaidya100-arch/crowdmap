// Shared frame for the privacy policy and terms pages.
import Link from "next/link";
import type { ReactNode } from "react";

/** Optional public contact address, set in Vercel as NEXT_PUBLIC_CONTACT_EMAIL. */
export const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || null;
export const UPDATED = "18 November 2026";

export function Contact() {
  return contactEmail
    ? <>email <a href={`mailto:${contactEmail}`} className="text-blue-600 underline">{contactEmail}</a></>
    : <>contact the CrowdMap team through the course (IIM Indore)</>;
}

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-gray-500">Last updated {UPDATED}</p>
      <div className="mt-6 space-y-5 text-[15px] leading-relaxed [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">
        {children}
      </div>
      <p className="mt-10 text-sm text-gray-500">
        <Link href="/map" className="text-blue-600 hover:underline">Back to the map</Link>
        {" · "}<Link href="/privacy" className="hover:underline">Privacy policy</Link>
        {" · "}<Link href="/terms" className="hover:underline">Terms of use</Link>
      </p>
    </main>
  );
}
