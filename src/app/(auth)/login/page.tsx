import { publicEnv } from "@/lib/env";
import { getLang } from "@/lib/i18n/server";
import { AuthForm } from "../AuthForm";

export const metadata = { title: "Log in · CrowdMap" };

const errors: Record<string, string> = { removed: "auth.removed", callback: "auth.badCredentials" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/";
  const error = typeof sp.error === "string" ? errors[sp.error] : undefined;
  return (
    <main className="flex flex-1 items-center px-4 py-10">
      <AuthForm mode="login" lang={await getLang()} siteKey={publicEnv().turnstileSiteKey}
                next={next} initialMessage={error} />
    </main>
  );
}
