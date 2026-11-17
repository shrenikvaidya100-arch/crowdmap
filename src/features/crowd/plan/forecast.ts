import "server-only";
// Builds a day's forecast for one place: the database forecast, adjusted for
// the weather (Open-Meteo, free, no key), plus the best time to go.
import { createClient } from "@/lib/supabase/server";
import { clampLevel, weatherEffect, type HourWeather } from "./weather";

export const PLAN_DAYS = 7;          // today + 6
export const VISIT_HOURS = [6, 22];  // best-time search window (6 am to 10 pm)

export type ForecastHour = {
  hour: number; at: string; level: number; base: number;
  plans: number; historyReports: number;
  weather: HourWeather | null; weatherReason: "rain" | "heat" | null;
};
export type Forecast = {
  date: string;
  special: { name: string; name_hi: string | null; boost: number }[];
  hours: ForecastHour[];
  best: { hour: number; level: number } | null;
  myPlans: { id: string; planned_for: string }[];
  signedIn: boolean;
};

/** Today's date in India as YYYY-MM-DD, plus offset days. */
export function indiaDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
}

export function indiaHourNow() {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(new Date()));
}

type Hourly = { time: string[]; temperature_2m: number[]; precipitation_probability: number[]; precipitation: number[]; weather_code: number[] };

async function weatherFor(lat: number, lng: number, date: string): Promise<Map<number, HourWeather>> {
  // Rounded to ~1 km so nearby places share one cached response.
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lng.toFixed(2)}`
    + "&hourly=temperature_2m,precipitation_probability,precipitation,weather_code"
    + `&timezone=Asia%2FKolkata&start_date=${date}&end_date=${date}`;
  try {
    const res = await fetch(url, { next: { revalidate: 1800 }, signal: AbortSignal.timeout(4000) });
    if (!res.ok) return new Map();
    const h = (await res.json()).hourly as Hourly;
    return new Map(h.time.map((t, i) => [Number(t.slice(11, 13)), {
      temp: h.temperature_2m[i] ?? null, rainChance: h.precipitation_probability[i] ?? null,
      rain: h.precipitation[i] ?? null, code: h.weather_code[i] ?? null,
    }]));
  } catch {
    return new Map(); // forecast still works without weather
  }
}

export async function buildForecast(placeId: string, date: string): Promise<Forecast | null> {
  const supabase = await createClient();
  const [{ data: place }, { data: fc, error }, { data: user }] = await Promise.all([
    supabase.from("places").select("category, lat, lng").eq("id", placeId).maybeSingle(),
    supabase.rpc("forecast_day", { p_place: placeId, p_date: date }),
    supabase.auth.getUser(),
  ]);
  if (error) throw new Error(error.message);
  if (!place || !fc) return null;

  const weather = await weatherFor(place.lat, place.lng, date);
  const hours: ForecastHour[] = (fc.hours as { hour: number; at: string; level: number; base: number; plans: number; history_reports: number }[])
    .map((h) => {
      const w = weather.get(h.hour) ?? null;
      const eff = weatherEffect(place.category, h.hour, w);
      return {
        hour: h.hour, at: h.at, base: h.base, plans: h.plans, historyReports: h.history_reports,
        level: clampLevel(h.level + eff.delta), weather: w, weatherReason: eff.reason,
      };
    });

  // Best time: lowest level in visiting hours, later than now if today; earliest wins ties.
  const fromHour = date === indiaDate() ? Math.max(VISIT_HOURS[0], indiaHourNow() + 1) : VISIT_HOURS[0];
  const best = hours
    .filter((h) => h.hour >= fromHour && h.hour <= VISIT_HOURS[1])
    .reduce<ForecastHour | null>((b, h) => (!b || Math.round(h.level) < Math.round(b.level) ? h : b), null);

  let myPlans: Forecast["myPlans"] = [];
  if (user.user) {
    const { data } = await supabase.from("visit_plans").select("id, planned_for")
      .eq("place_id", placeId).gte("planned_for", hours[0]?.at).lte("planned_for", hours[23]?.at);
    myPlans = data ?? [];
  }

  return {
    date, special: fc.special ?? [], hours,
    best: best ? { hour: best.hour, level: Math.round(best.level) } : null,
    myPlans, signedIn: Boolean(user.user),
  };
}
