"use client";
// Instant updates: listens to the city's Realtime channel ("crowd:<city>"),
// which the database notifies whenever reports, alerts, places or presence
// change. Bursts are batched so the map reloads at most every 1.5 s.
import { createBrowserClient } from "@supabase/ssr";
import { useEffect, useRef } from "react";
import { publicEnv } from "@/lib/env";

type Change = { place_id: string | null; kind: string };

let client: ReturnType<typeof createBrowserClient> | null = null;
function browserClient() {
  const { supabaseUrl, supabaseKey } = publicEnv();
  if (!supabaseUrl || !supabaseKey) return null;
  client ??= createBrowserClient(supabaseUrl, supabaseKey);
  return client;
}

export function useCityUpdates(city: string | null, onChange: (placeIds: Set<string>) => void) {
  const handler = useRef(onChange);
  useEffect(() => { handler.current = onChange; });

  useEffect(() => {
    const sb = browserClient();
    if (!sb || !city) return;
    let pending = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const channel = sb.channel(`crowd:${city}`)
      .on("broadcast", { event: "changed" }, ({ payload }: { payload: Change }) => {
        if (payload?.place_id) pending.add(payload.place_id);
        timer ??= setTimeout(() => {
          const ids = pending;
          pending = new Set();
          timer = null;
          handler.current(ids);
        }, 1500);
      })
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      void sb.removeChannel(channel);
    };
  }, [city]);
}
