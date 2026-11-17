"use server";
// Profile changes. Row-level security only lets users change their own
// display name, language and home city; the audit log records each change.
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LANG_COOKIE } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { toFieldErrors, type FieldErrors } from "@/lib/validation/auth";
import { profileSchema } from "./validation";

export type ProfileState = { ok?: boolean; message?: string; fields?: FieldErrors };

export async function updateProfile(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  const parsed = profileSchema.safeParse({
    displayName: form.get("displayName"),
    preferredLang: form.get("preferredLang"),
    homeCity: form.get("homeCity") ?? "",
  });
  if (!parsed.success) return { fields: toFieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { message: "result.signin" };

  const { error } = await supabase.from("profiles").update({
    display_name: parsed.data.displayName,
    preferred_lang: parsed.data.preferredLang,
    home_city: parsed.data.homeCity || null,
  }).eq("id", user.user.id);
  if (error) {
    console.error("updateProfile", error.message);
    return { message: "result.error" };
  }
  // Use the chosen language straight away.
  (await cookies()).set(LANG_COOKIE, parsed.data.preferredLang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
  return { ok: true, message: "saved" };
}
