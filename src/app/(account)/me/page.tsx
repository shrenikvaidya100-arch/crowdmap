// "My activity": profile plus everything the user has shared. Loaded with the
// user's own session, so row-level security returns only their rows.
import { redirect } from "next/navigation";
import {
  ActivityTabs, type AddedPlaceRow, type AlertRow, type LogRow, type PlanRow, type ReportRow,
} from "@/features/profile/ActivityTabs";
import { messages } from "@/features/profile/messages";
import { ProfileForm } from "@/features/profile/ProfileForm";
import { translator } from "@/lib/i18n";
import { getLang } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "My activity · CrowdMap" };

const PLACE = "place:places(id, name, name_hi, city_id)";

async function loadActivity() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const uid = auth.user.id;

  const [profile, cities, reports, alerts, plans, places, log] = await Promise.all([
    supabase.from("profiles").select("display_name, preferred_lang, home_city, created_at, trust_score").eq("id", uid).single(),
    supabase.from("cities").select("id, name, name_hi").order("sort_order"),
    supabase.from("crowd_reports").select(`id, level, created_at, ${PLACE}`).eq("user_id", uid)
      .order("created_at", { ascending: false }).limit(500),
    supabase.from("quick_reports").select(`id, kind, created_at, expires_at, still_there, gone, ${PLACE}`).eq("user_id", uid)
      .order("created_at", { ascending: false }).limit(500),
    supabase.from("visit_plans").select(`id, planned_for, ${PLACE}`).eq("user_id", uid)
      .order("planned_for", { ascending: false }).limit(500),
    supabase.from("places").select("id, name, name_hi, category, status, created_at, city_id").eq("added_by", uid)
      .order("created_at", { ascending: false }).limit(500),
    supabase.from("audit_log").select("id, at, action, target_type, details").eq("actor_id", uid)
      .order("id", { ascending: false }).limit(300),
  ]);
  for (const [name, r] of Object.entries({ profile, cities, reports, alerts, plans, places, log })) {
    if (r.error) console.error(`me/${name}`, r.error.message);
  }
  return {
    now: Date.now(),
    profile: profile.data,
    cities: cities.data ?? [],
    reports: (reports.data ?? []) as unknown as ReportRow[],
    alerts: (alerts.data ?? []) as unknown as AlertRow[],
    plans: (plans.data ?? []) as unknown as PlanRow[],
    places: (places.data ?? []) as AddedPlaceRow[],
    log: (log.data ?? []) as LogRow[],
  };
}

export default async function MyActivityPage() {
  const [lang, data] = await Promise.all([getLang(), loadActivity()]);
  if (!data || !data.profile) redirect("/login?next=/me");
  const t = translator(messages, lang);
  const cityNames = Object.fromEntries(data.cities.map((c) => [c.id, lang === "hi" && c.name_hi ? c.name_hi : c.name]));
  const since = new Intl.DateTimeFormat(lang === "hi" ? "hi-IN" : "en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" })
    .format(new Date(data.profile.created_at));

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{t("subtitle")}</p>
        <p className="mt-2 flex flex-wrap gap-x-4 text-sm">
          <span>👤 {data.profile.display_name}</span>
          <span className="text-gray-500">{t("memberSince", { date: since })}</span>
          <span className="text-gray-500" title={t("trustHint")}>🛡️ {t("trust", { pct: Math.round(data.profile.trust_score * 100) })}</span>
        </p>
      </header>

      <ActivityTabs
        lang={lang} now={data.now} cityNames={cityNames}
        reports={data.reports} alerts={data.alerts} plans={data.plans} places={data.places} log={data.log}
        profile={
          <ProfileForm lang={lang} cities={data.cities} initial={{
            displayName: data.profile.display_name,
            preferredLang: data.profile.preferred_lang,
            homeCity: data.profile.home_city ?? "",
          }} />
        }
      />
    </main>
  );
}
