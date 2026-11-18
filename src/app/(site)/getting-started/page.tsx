import Link from "next/link";
import { InfoPage } from "../InfoPage";

export const metadata = { title: "Getting Started · CrowdMap" };

const STEPS: { title: string; body: React.ReactNode }[] = [
  { title: "Open the map", body: <>Pick Indore, Delhi or Mumbai. Each dot is a place, coloured from green (quiet) to red (packed). Faded dots are estimates; solid dots have live reports.</> },
  { title: "Tap a place", body: <>See how crowded it is now, the expected crowd for the rest of the day, the best time to go, and photos from people there.</> },
  { title: "Sign in", body: <>Use Google or your email. <Link href="/login" className="text-blue-400 underline">Sign in here</Link>. Signing in lets you report, save places and get alerts.</> },
  { title: "Report when you're there", body: <>Tap how crowded it is, or post a quick alert like a long queue. We check your location first, so stand at the place when you report.</> },
  { title: "Get told when it's quiet", body: <>Tap Notify me on a busy place and pick how long to watch it. Turn on notifications on the Saved page to get them on your phone.</> },
  { title: "Add it to your home screen", body: <>On Android, use Install app in Chrome. On iPhone, tap Share, then Add to Home Screen. It opens like an app.</> },
];

export default function GettingStartedPage() {
  return (
    <InfoPage title="Getting Started" intro="Six steps, about two minutes.">
      <ol className="space-y-8">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex list-none gap-4">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-zinc-700 text-sm font-medium text-zinc-200">{i + 1}</span>
            <div>
              <h2>{s.title}</h2>
              <p className="!mt-1.5">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </InfoPage>
  );
}
