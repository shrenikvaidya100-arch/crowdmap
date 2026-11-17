"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { isLanguage, LANG_COOKIE } from "@/lib/i18n";

export async function setLanguage(form: FormData) {
  const lang = form.get("lang");
  if (!isLanguage(lang)) return;
  (await cookies()).set(LANG_COOKIE, lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}
