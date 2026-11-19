'use client';
// Admin charts (Watermelon UI chart kit on Recharts): how the site is working day
// by day. Everything comes in as plain data from admin_dashboard().
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis } from 'recharts';
import {
  ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from '@/components/watermelon-ui/chart';

export type DashDay = { day: string; reports: number; rejected: number; signups: number; uploads: number; alerts: number; searches: number; moderation: number };
export type DashData = {
  days: DashDay[];
  levels: Record<string, number> | null;
  cities: { city: string; reports: number }[];
  quorum: { confirmed: number; waiting: number };
};
type Labels = Record<string, string>;

const LEVEL_COLORS = ['#16a34a', '#65a30d', '#eab308', '#f97316', '#dc2626'];
const short = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

function Panel({ title, note, children, className = '' }: { title: string; note?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_4px_12px_-4px_rgba(0,0,0,0.06)] dark:border-zinc-800 dark:bg-zinc-950 ${className}`}>
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
      {note && <p className="mt-0.5 text-xs text-zinc-500">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function AdminCharts({ data, labels }: { data: DashData; labels: Labels }) {
  const days = data.days.map((d) => ({ ...d, label: short(d.day) }));
  const activity: ChartConfig = {
    reports: { label: labels.reports, color: '#2563eb' },
    rejected: { label: labels.rejected, color: '#f43f5e' },
  };
  const people: ChartConfig = {
    signups: { label: labels.signups, color: '#8b5cf6' },
    uploads: { label: labels.uploads, color: '#14b8a6' },
  };
  const usage: ChartConfig = {
    searches: { label: labels.searches, color: '#0ea5e9' },
    alerts: { label: labels.alerts, color: '#f59e0b' },
    moderation: { label: labels.moderation, color: '#71717a' },
  };
  const levelRows = [1, 2, 3, 4, 5].map((l) => ({ level: labels[`level${l}`], n: Number(data.levels?.[String(l)] ?? 0), fill: LEVEL_COLORS[l - 1] }));
  const levelTotal = levelRows.reduce((s, r) => s + r.n, 0);
  const levelConfig: ChartConfig = Object.fromEntries(levelRows.map((r, i) => [r.level, { label: r.level, color: LEVEL_COLORS[i] }]));
  const cityConfig: ChartConfig = { reports: { label: labels.reports, color: '#2563eb' } };
  const q = data.quorum;
  const qTotal = q.confirmed + q.waiting;

  return (
    <div className="grid gap-5 lg:grid-cols-6">
      <Panel title={labels.activityTitle} note={labels.activityNote} className="lg:col-span-4">
        <ChartContainer config={activity} className="aspect-auto h-64 w-full">
          <AreaChart data={days} margin={{ left: 0, right: 8 }}>
            <defs>
              {(['reports', 'rejected'] as const).map((k) => (
                <linearGradient key={k} id={`fill-${k}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={`var(--color-${k})`} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={`var(--color-${k})`} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
            <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
            <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
            <Area dataKey="reports" type="monotone" stroke="var(--color-reports)" fill="url(#fill-reports)" strokeWidth={2} />
            <Area dataKey="rejected" type="monotone" stroke="var(--color-rejected)" fill="url(#fill-rejected)" strokeWidth={2} />
            <ChartLegend content={<ChartLegendContent />} />
          </AreaChart>
        </ChartContainer>
      </Panel>

      <Panel title={labels.quorumTitle} note={labels.quorumNote} className="lg:col-span-2">
        <div className="flex h-64 flex-col justify-center gap-5">
          <div>
            <p className="text-4xl font-semibold tabular-nums text-emerald-600">{q.confirmed}</p>
            <p className="text-sm text-zinc-500">{labels.confirmed}</p>
          </div>
          <div>
            <p className="text-4xl font-semibold tabular-nums text-amber-500">{q.waiting}</p>
            <p className="text-sm text-zinc-500">{labels.waiting}</p>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800" role="img"
               aria-label={`${labels.confirmed} ${q.confirmed}, ${labels.waiting} ${q.waiting}`}>
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-[width] duration-700"
                 style={{ width: qTotal ? `${(q.confirmed / qTotal) * 100}%` : '0%' }} />
          </div>
        </div>
      </Panel>

      <Panel title={labels.peopleTitle} className="lg:col-span-3">
        <ChartContainer config={people} className="aspect-auto h-56 w-full">
          <BarChart data={days} margin={{ left: 0, right: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
            <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="signups" fill="var(--color-signups)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="uploads" fill="var(--color-uploads)" radius={[4, 4, 0, 0]} />
            <ChartLegend content={<ChartLegendContent />} />
          </BarChart>
        </ChartContainer>
      </Panel>

      <Panel title={labels.usageTitle} className="lg:col-span-3">
        <ChartContainer config={usage} className="aspect-auto h-56 w-full">
          <LineChart data={days} margin={{ left: 0, right: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
            <YAxis tickLine={false} axisLine={false} width={28} allowDecimals={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line dataKey="searches" type="monotone" stroke="var(--color-searches)" strokeWidth={2} dot={false} />
            <Line dataKey="alerts" type="monotone" stroke="var(--color-alerts)" strokeWidth={2} dot={false} />
            <Line dataKey="moderation" type="monotone" stroke="var(--color-moderation)" strokeWidth={2} dot={false} strokeDasharray="4 3" />
            <ChartLegend content={<ChartLegendContent />} />
          </LineChart>
        </ChartContainer>
      </Panel>

      <Panel title={labels.levelsTitle} note={levelTotal ? undefined : labels.none} className="lg:col-span-2">
        <ChartContainer config={levelConfig} className="mx-auto aspect-square h-56">
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent nameKey="level" hideLabel />} />
            <Pie data={levelTotal ? levelRows : [{ level: '-', n: 1, fill: '#e4e4e7' }]} dataKey="n" nameKey="level" innerRadius={52} outerRadius={84} strokeWidth={2}>
              {(levelTotal ? levelRows : [{ fill: '#e4e4e7' }]).map((r, i) => <Cell key={i} fill={r.fill} />)}
            </Pie>
          </PieChart>
        </ChartContainer>
        <ul className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
          {levelRows.map((r) => <li key={r.level} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: r.fill }} />{r.level} {r.n}</li>)}
        </ul>
      </Panel>

      <Panel title={labels.citiesTitle} note={data.cities.length ? undefined : labels.none} className="lg:col-span-4">
        <ChartContainer config={cityConfig} className="aspect-auto h-64 w-full">
          <BarChart data={data.cities} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey="city" tickLine={false} axisLine={false} width={96} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="reports" fill="var(--color-reports)" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ChartContainer>
      </Panel>
    </div>
  );
}
