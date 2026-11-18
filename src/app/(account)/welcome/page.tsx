// First sign-up: choose a display name and avatar, then carry on.
import { redirect } from "next/navigation";
import { AuthShell } from "@/app/(auth)/AuthShell";
import { WelcomeStep } from "@/features/profile/WelcomeStep";
import { getLang } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Welcome · CrowdMap" };

export default async function WelcomePage({ searchParams }: PageProps<"/welcome">) {
  const sp = await searchParams;
  const raw = typeof sp.next === "string" ? sp.next : "/";
  const next = raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/welcome") ? raw : "/";
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=/welcome");
  const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", auth.user.id).single();
  return (
    <AuthShell surface="none">
      <WelcomeStep lang={await getLang()} startName={profile?.display_name ?? ""} next={next} />
    </AuthShell>
  );
}
