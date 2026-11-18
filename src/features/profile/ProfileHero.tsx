// Top of "My activity": a dark card with a drifting glow, the user's face in a
// gradient ring, their name, and small chips (member since, home city, and for
// admins the role and trust score).
import { Icon } from "@/components/icons/Icon";
import { HeroBackdrop } from "@/features/site/InfoFx";
import { UserAvatar } from "./UserAvatar";

export function ProfileHero({ name, avatarSeed, since, homeCity, admin, subtitle }: {
  name: string;
  avatarSeed: string | null;
  since: string;
  homeCity: string | null;
  /** Shown to admins only: their role and trust score. */
  admin: { label: string; trust: string; hint: string } | null;
  subtitle: string;
}) {
  const chip = "inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1 text-xs text-zinc-300 ring-1 ring-white/10 backdrop-blur";
  return (
    <section className="relative isolate mb-6 overflow-hidden rounded-3xl bg-zinc-950 px-5 py-7 text-zinc-100 ring-1 ring-white/10 sm:px-8 sm:py-9">
      <HeroBackdrop />
      <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
        <div className="relative shrink-0 motion-safe:animate-[pop_500ms_cubic-bezier(.2,.9,.3,1.3)_both]">
          <div className="rounded-full bg-gradient-to-br from-[#0894FF] via-[#5ad1ff] to-[#21c55d] p-[3px] shadow-[0_0_40px_rgba(8,148,255,0.35)]">
            <div className="rounded-full bg-zinc-950 p-1">
              <UserAvatar seed={avatarSeed} name={name} size={88} className="text-2xl" />
            </div>
          </div>
        </div>
        <div className="min-w-0 motion-safe:animate-[rise_600ms_120ms_ease-out_both]">
          <h1 className="truncate text-3xl font-semibold tracking-tight text-white sm:text-4xl">{name}</h1>
          <p className="mt-1.5 max-w-xl text-sm text-zinc-400">{subtitle}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
            <span className={chip}><Icon name="calendar" size={14} />{since}</span>
            {homeCity && <span className={chip}><Icon name="pin" size={14} />{homeCity}</span>}
            {admin && (
              <>
                <span className={`${chip} bg-blue-500/15 text-blue-200 ring-blue-400/30`}><Icon name="shield" size={14} />{admin.label}</span>
                <span className={chip} title={admin.hint}><Icon name="star" size={14} />{admin.trust}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
