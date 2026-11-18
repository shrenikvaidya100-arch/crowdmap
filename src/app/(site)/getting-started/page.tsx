import Link from "next/link";
import { ScrollLine, Spotlight } from "@/features/site/InfoFx";
import { Reveal } from "@/features/site/Reveal";
import { InfoPage, PROSE } from "../InfoPage";

export const metadata = { title: "Getting Started · CrowdMap" };

const STEPS: { title: string; body: React.ReactNode }[] = [
  { title: "Open the map", body: <>Pick a city from the list at the top, or move the map and it follows you. Each dot is a place, coloured from green (quiet) to red (packed). Faded dots are estimates; solid dots have live reports.</> },
  { title: "Tap a place", body: <>See how crowded it is now, the expected crowd for the rest of the day, the best time to go, and photos from people there.</> },
  { title: "Sign in", body: <>Use Google or your email. <Link href="/login" className="text-blue-400 underline">Sign in here</Link>. Signing in lets you report, save places and get alerts.</> },
  { title: "Report when you're there", body: <>Tap how crowded it is, or post a quick alert like a long queue. We check your location first, so stand at the place when you report.</> },
  { title: "Get told when it's quiet", body: <>Tap Notify me on a busy place and pick how long to watch it. Turn on notifications on the Saved page to get them on your phone.</> },
  { title: "Add it to your home screen", body: <>On Android, use Install app in Chrome. On iPhone, tap Share, then Add to Home Screen. It opens like an app.</> },
];

export default function GettingStartedPage() {
  return (
    <InfoPage title="Getting Started" intro="Six steps, about two minutes.">
      <ScrollLine>
        <ol className="space-y-5">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative pl-12">
              <span aria-hidden className="absolute left-0 top-6 grid h-8 w-8 place-items-center rounded-full bg-black font-mono text-xs font-semibold text-white ring-1 ring-[#0894FF]/60 shadow-[0_0_18px_rgba(8,148,255,0.45)]">{i + 1}</span>
              <Reveal delay={Math.min(i, 4) * 80}>
                <Spotlight className="p-6">
                  <div className={PROSE}>
                    <h2>{s.title}</h2>
                    <p className="!mt-2">{s.body}</p>
                  </div>
                </Spotlight>
              </Reveal>
            </li>
          ))}
        </ol>
      </ScrollLine>
    </InfoPage>
  );
}
