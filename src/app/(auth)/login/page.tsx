import { publicEnv } from "@/lib/env";
import { getLang } from "@/lib/i18n/server";
import { AuthForm } from "../AuthForm";
import { AuthShell } from "../AuthShell";

export const metadata = { title: "Log in · CrowdMap" };

const errors: Record<string, string> = { removed: "auth.removed", callback: "auth.badCredentials" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/map";
  const error = typeof sp.error === "string" ? errors[sp.error] : undefined;
  return (
    <AuthShell>
      <AuthForm mode="login" lang={await getLang()} siteKey={publicEnv().turnstileSiteKey}
                next={next} initialMessage={error} />
    </AuthShell>
  );
}
