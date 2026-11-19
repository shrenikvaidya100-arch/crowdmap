// Saved: notifications, active "tell me when it's quiet" alerts, saved places,
// and the switch for notifications on this device.
import { redirect } from "next/navigation";
import { messages } from "@/features/alerts/messages";
import { PushToggle } from "@/features/alerts/PushToggle";
import { SavedView, type NoteRow, type SavedRow, type WatchRow } from "@/features/alerts/SavedView";
import { translator } from "@/lib/i18n";
import { getLang } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Saved · CrowdMap" };

export default async function SavedPage() {
  const [lang, supabase] = await Promise.all([getLang(), createClient()]);
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=/saved");
  const t = translator(messages, lang);
  const [notes, watches, saved] = await Promise.all([
    supabase.from("notifications").select("id, kind, place_id, data, created_at, read_at")
      .eq("user_id", auth.user.id).order("id", { ascending: false }).limit(50),
    supabase.from("place_watches").select("id, expires_at, place:places(id, name, name_hi)")
      .eq("user_id", auth.user.id).eq("status", "active").order("expires_at"),
    supabase.rpc("my_saved_places"),
  ]);
  for (const [k, r] of Object.entries({ notes, watches, saved })) if (r.error) console.error(`saved/${k}`, r.error.message);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-6">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{t("subtitle")}</p>
      </header>
      <PushToggle lang={lang} />
      <SavedView lang={lang} notes={(notes.data ?? []) as NoteRow[]}
                 watches={(watches.data ?? []) as unknown as WatchRow[]} saved={(saved.data ?? []) as SavedRow[]} />
    </main>
  );
}
