import { Icon } from "@/components/icons/Icon";
import Link from "next/link";

export const metadata = { title: "Not found · CrowdMap" };

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      <Icon name="compass" size={44} className="text-gray-400" />
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-sm text-gray-600 dark:text-gray-400">This page doesn&rsquo;t exist. / यह पेज मौजूद नहीं है।</p>
      <Link href="/map" className="mt-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white">Back to the map</Link>
    </main>
  );
}
