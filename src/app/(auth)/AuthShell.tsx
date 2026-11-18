// Login and sign-up layout: the form card on top of the animated contour map
// (KokonutUI TopoBackground). The card has a solid surface, so contour lines
// never run through the fields; the map shows around it.
import Link from "next/link";
import type { ReactNode } from "react";
import TopoBackground from "@/components/core/topo-background";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex flex-1 flex-col">
      <TopoBackground className="min-h-[calc(100svh-3.5rem)] flex-1 bg-black px-4 py-10 text-zinc-700" labels={false} interactive>
        <div className="relative w-full max-w-sm">
          <div className="rounded-2xl bg-zinc-950 p-6 text-zinc-100 shadow-2xl shadow-black/60 ring-1 ring-white/10 sm:p-8">
            {children}
          </div>
          <p className="mt-4 text-center text-xs text-zinc-500">
            By continuing you agree to the <Link href="/terms" className="underline hover:text-zinc-300">Terms of use</Link> and{" "}
            <Link href="/privacy" className="underline hover:text-zinc-300">Privacy policy</Link>.
          </p>
        </div>
      </TopoBackground>
    </main>
  );
}
