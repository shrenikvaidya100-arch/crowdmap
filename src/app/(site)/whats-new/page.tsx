import { ScrollLine, Spotlight } from "@/features/site/InfoFx";
import { Reveal } from "@/features/site/Reveal";
import { InfoPage, PROSE } from "../InfoPage";

export const metadata = { title: "What's New · CrowdMap" };

const UPDATES: { date: string; title: string; body: string }[] = [
  { date: "19 November 2026", title: "All of India", body: "CrowdMap now covers more than fifty cities, every state capital among them. Pick a city from the list, or just move the map and it follows you. You can add a place anywhere in India." },
  { date: "18 November 2026", title: "Tell me when it's quiet", body: "Save places, and ask CrowdMap to notify you when a busy place calms down. Notifications reach your phone even when the site is closed." },
  { date: "18 November 2026", title: "Sign in with Google", body: "Join in one tap with your Google account, alongside email sign-in." },
  { date: "18 November 2026", title: "Photos, videos and audio", body: "Share what a place looks like: take a photo, video or voice note, or upload one, and anyone can comment." },
  { date: "18 November 2026", title: "A safer, faster map", body: "Automatic bot detection, an admin dashboard, and a map that loads twice as fast." },
  { date: "17 November 2026", title: "Plan your visit", body: "See the expected crowd for every hour of the week, the best time to go, the weather, and holidays that change the pattern." },
  { date: "17 November 2026", title: "Live presence", body: "See how many CrowdMap users are at a place right now, and watch the map update without refreshing." },
];

export default function WhatsNewPage() {
  return (
    <InfoPage title="What's New" intro="Recent changes to CrowdMap, newest first.">
      <ScrollLine>
        <ol className="space-y-5">
          {UPDATES.map((u, i) => (
            <li key={u.title} className="relative pl-12">
              <span aria-hidden className="absolute left-[9px] top-7 h-3 w-3 rounded-full bg-[#0894FF] shadow-[0_0_0_4px_#000,0_0_16px_#0894FF]" />
              <Reveal delay={Math.min(i, 4) * 80}>
                <Spotlight className="p-6">
                  <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500">{u.date}</p>
                  <div className={PROSE}>
                    <h2 className="mt-2">{u.title}</h2>
                    <p className="!mt-2">{u.body}</p>
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
