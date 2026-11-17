import "server-only";
import { cookies } from "next/headers";
import { config, type Language } from "@/lib/config";
import { isLanguage, LANG_COOKIE } from "@/lib/i18n";

export async function getLang(): Promise<Language> {
  const value = (await cookies()).get(LANG_COOKIE)?.value;
  return isLanguage(value) ? value : config.defaultLanguage;
}
