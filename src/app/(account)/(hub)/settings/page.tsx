// Settings: language, notifications on this device, and where to change the rest.
import Link from "next/link";
import { redirect } from "next/navigation";
import { setLanguage } from "@/app/lang-actions";
import { PushToggle } from "@/features/alerts/PushToggle";
import { getLang } from "@/lib/i18n/server";
import { getViewer } from "@/lib/session";

export const metadata = { title: "Settings · CrowdMap" };

export default async function SettingsPage() {
  const [lang, viewer] = await Promise.all([getLang(), getViewer()]);
  if (!viewer) redirect("/login?next=/settings");
  const hi = lang === "hi";
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-8">
      <h1 className="text-2xl font-semibold">{hi ? "सेटिंग्स" : "Settings"}</h1>
      <section className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
        <h2 className="font-medium">{hi ? "भाषा" : "Language"}</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{hi ? "अभी: हिन्दी" : "Now: English"}</p>
        <form action={setLanguage} className="mt-3">
          <input type="hidden" name="lang" value={hi ? "en" : "hi"} />
          <button className="rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700">{hi ? "Switch to English" : "हिन्दी में बदलें"}</button>
        </form>
      </section>
      <PushToggle lang={lang} />
      <section className="rounded-lg border border-gray-200 p-4 text-sm dark:border-gray-800">
        <h2 className="font-medium">{hi ? "प्रोफ़ाइल और खाता" : "Profile and account"}</h2>
        <ul className="mt-2 space-y-1.5">
          <li><Link className="text-blue-600 hover:underline" href="/me">{hi ? "नाम, शहर और गतिविधि" : "Name, home city and your activity"}</Link></li>
          <li><Link className="text-blue-600 hover:underline" href="/welcome?next=%2Fsettings">{hi ? "अवतार बदलें" : "Change your avatar"}</Link></li>
          <li><Link className="text-blue-600 hover:underline" href="/me">{hi ? "खाता हटाएँ (प्रोफ़ाइल टैब में)" : "Delete your account (on the Profile tab)"}</Link></li>
        </ul>
      </section>
    </main>
  );
}
