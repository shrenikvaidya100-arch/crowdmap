"use server";
// Profile changes. Row-level security only lets users change their own
// display name, language and home city; the audit log records each change.
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { LANG_COOKIE } from "@/lib/i18n";
import { createClient, createServiceClient } from "@/lib/supabase/server";
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

export type DeleteAccountState = { ok?: boolean; message?: string };

/**
 * Deletes the signed-in user's account: their files, then the login itself,
 * which removes their profile and everything they posted. Needs "DELETE" typed.
 */
export async function deleteAccount(_prev: DeleteAccountState, form: FormData): Promise<DeleteAccountState> {
  if (String(form.get("confirm") ?? "").trim() !== "DELETE") return { message: "deleteAccount.typeDelete" };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { message: "deleteAccount.signin" };

  const { data, error } = await supabase.rpc("begin_account_deletion");
  if (error) {
    console.error("delete account", error.message);
    return { message: "deleteAccount.error" };
  }
  const res = data as { ok: boolean; reason?: string; paths?: string[] };
  if (!res.ok) return { message: res.reason === "admin" ? "deleteAccount.admin" : "deleteAccount.error" };

  const service = createServiceClient();
  if (res.paths?.length) {
    const { error: rmError } = await service.storage.from("media").remove(res.paths);
    // Leftover files are removed by the daily cleanup job, so this isn't fatal.
    if (rmError) console.error("delete account files", rmError.message);
  }
  const { error: delError } = await service.auth.admin.deleteUser(auth.user.id);
  if (delError) {
    console.error("delete account user", delError.message);
    return { message: "deleteAccount.error" };
  }
  await supabase.auth.signOut();
  redirect("/?account=deleted");
}
