import { redirect } from "next/navigation";

// /signin is the name the design uses; the sign-in page lives at /login.
export default async function SignIn({ searchParams }: PageProps<"/signin">) {
  const sp = await searchParams;
  redirect(typeof sp.next === "string" ? `/login?next=${encodeURIComponent(sp.next)}` : "/login");
}
