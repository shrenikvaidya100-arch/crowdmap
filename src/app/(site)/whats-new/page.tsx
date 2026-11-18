import { InfoPage } from "../InfoPage";

export const metadata = { title: "What's New · CrowdMap" };

const UPDATES: { date: string; title: string; body: string }[] = [
  { date: "18 November 2026", title: "Tell me when it's quiet", body: "Save places, and ask CrowdMap to notify you when a busy place calms down. Notifications reach your phone even when the site is closed." },
  { date: "18 November 2026", title: "Sign in with Google", body: "Join in one tap with your Google account, alongside email sign-in." },
  { date: "18 November 2026", title: "Photos, videos and audio", body: "Share what a place looks like right now. Recordings are made live at the place, and anyone can comment." },
  { date: "18 November 2026", title: "A safer, faster map", body: "Automatic bot detection, an admin dashboard, and a map that loads twice as fast." },
  { date: "17 November 2026", title: "Plan your visit", body: "See the expected crowd for every hour of the week, the best time to go, the weather, and holidays that change the pattern." },
  { date: "17 November 2026", title: "Live presence", body: "See how many CrowdMap users are at a place right now, and watch the map update without refreshing." },
];

export default function WhatsNewPage() {
  return (
    <InfoPage title="What's New" intro="Recent changes to CrowdMap, newest first.">
      <ol className="space-y-8 border-l border-zinc-800 pl-6">
        {UPDATES.map((u) => (
          <li key={u.title} className="relative list-none">
            <span aria-hidden className="absolute -left-[31px] top-1.5 h-2.5 w-2.5 rounded-full bg-blue-500" />
            <p className="!mt-0 text-xs uppercase tracking-wider text-zinc-500">{u.date}</p>
            <h2 className="mt-1">{u.title}</h2>
            <p>{u.body}</p>
          </li>
        ))}
      </ol>
    </InfoPage>
  );
}
