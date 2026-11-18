"use client"; // Error boundaries must be Client Components
import { Icon } from "@/components/icons/Icon";
// Shown when a page fails to load (e.g. the database is briefly unreachable).
import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      <Icon name="alert_circle" size={44} className="text-gray-400" />
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        This page couldn&rsquo;t load. It&rsquo;s usually a brief connection problem. / पेज लोड नहीं हो सका, कृपया फिर से कोशिश करें।
      </p>
      <div className="mt-2 flex gap-3">
        <button type="button" onClick={() => retry()} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white">
          Try again
        </button>
        <Link href="/" className="rounded-md border border-gray-300 px-4 py-2 text-sm dark:border-gray-700">Back to the map</Link>
      </div>
    </main>
  );
}
