// Finishes Google sign-in and email confirmation links.
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next") ?? "/";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const { data: profile } = await supabase
        .from("profiles").select("status").eq("id", data.user.id).single();
      if (profile?.status === "removed") {
        await supabase.auth.signOut();
        return NextResponse.redirect(new URL("/login?error=removed", url.origin));
      }
      const method = data.user.app_metadata?.provider ?? "email";
      await supabase.rpc("log_event", { p_action: "auth.login", p_details: { method } });
      return NextResponse.redirect(new URL(next, url.origin));
    }
  }
  return NextResponse.redirect(new URL("/login?error=callback", url.origin));
}
