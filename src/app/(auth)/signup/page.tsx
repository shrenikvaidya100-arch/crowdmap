import { publicEnv } from "@/lib/env";
import { getLang } from "@/lib/i18n/server";
import { AuthForm } from "../AuthForm";
import { AuthShell } from "../AuthShell";

export const metadata = { title: "Sign up · CrowdMap" };

export default async function SignupPage() {
  return (
    <AuthShell>
      <AuthForm mode="signup" lang={await getLang()} siteKey={publicEnv().turnstileSiteKey} next="/map" />
    </AuthShell>
  );
}
