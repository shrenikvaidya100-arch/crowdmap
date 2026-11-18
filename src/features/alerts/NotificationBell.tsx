"use client";
// 🔔 in the header with the number of unread notifications (refreshes every minute
// and whenever the tab comes back into view).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export function NotificationBell({ label }: { label: string }) {
  const [count, setCount] = useState(0);
  const path = usePathname();
  useEffect(() => {
    let cancelled = false;
    const load = () => fetch("/api/notifications/unread", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { count: 0 }))
      .then((d) => { if (!cancelled) setCount(d.count ?? 0); })
      .catch(() => {});
    void load();
    const timer = setInterval(load, 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("crowdmap:notifications-read", load);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("crowdmap:notifications-read", load);
    };
  }, [path]);
  return (
    <Link href="/saved" aria-label={count ? `${label} (${count})` : label}
          className="relative rounded-md px-2.5 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-800">
      <span aria-hidden>🔔</span>
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
