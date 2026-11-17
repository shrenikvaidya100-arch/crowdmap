import { publicEnv } from "@/lib/env";
import { getLang } from "@/lib/i18n/server";
import { AuthForm } from "../AuthForm";

export const metadata = { title: "Sign up · CrowdMap" };

export default async function SignupPage() {
  return (
    <main className="flex flex-1 items-center px-4 py-10">
      <AuthForm mode="signup" lang={await getLang()} siteKey={publicEnv().turnstileSiteKey} next="/" />
    </main>
  );
}
