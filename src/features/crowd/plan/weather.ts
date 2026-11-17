// How weather changes crowds. Pure function with no imports, so tests can run
// it directly (tests/user1/weather.test.mjs). Thresholds are named below.

export type HourWeather = {
  temp: number | null;        // °C
  rainChance: number | null;  // %
  rain: number | null;        // mm in the hour
  code: number | null;        // WMO weather code
};

const OUTDOOR = new Set(["park", "tourist", "market", "street_food", "temple"]);
const INDOOR = new Set(["mall", "cafe", "restaurant", "entertainment"]);

export const WEATHER_RULES = {
  rainMm: 1,          // at least this much rain in the hour counts as rain
  rainChancePct: 70,  // or at least this chance of rain
  heatC: 40,          // afternoon heat this high keeps people indoors
  outdoorRain: -1,    // level change for outdoor places in rain
  indoorRain: 0.5,    // people move indoors when it rains
  outdoorHeat: -0.5,
} as const;

export type WeatherEffect = { delta: number; reason: "rain" | "heat" | null };

export function weatherEffect(category: string, hour: number, w: HourWeather | null): WeatherEffect {
  if (!w) return { delta: 0, reason: null };
  const raining = (w.rain ?? 0) >= WEATHER_RULES.rainMm || (w.rainChance ?? 0) >= WEATHER_RULES.rainChancePct;
  if (raining) {
    if (OUTDOOR.has(category)) return { delta: WEATHER_RULES.outdoorRain, reason: "rain" };
    if (INDOOR.has(category)) return { delta: WEATHER_RULES.indoorRain, reason: "rain" };
    return { delta: 0, reason: "rain" };
  }
  const afternoon = hour >= 12 && hour <= 16;
  if (afternoon && (w.temp ?? 0) >= WEATHER_RULES.heatC && OUTDOOR.has(category)) {
    return { delta: WEATHER_RULES.outdoorHeat, reason: "heat" };
  }
  return { delta: 0, reason: null };
}

/** Simple icon for a WMO weather code. */
export function weatherIcon(code: number | null) {
  if (code === null) return "";
  if (code === 0) return "☀️";
  if (code <= 3) return "⛅";
  if (code <= 48) return "🌫️";
  if (code <= 67 || (code >= 80 && code <= 82)) return "🌧️";
  if (code >= 95) return "⛈️";
  return "☁️";
}

export const clampLevel = (x: number) => Math.min(5, Math.max(1, x));
