// Shared by the browser and the server actions.
import { z } from "zod";

export const idSchema = z.string().uuid();
export const WATCH_HOURS = [1, 3, 6, 12, 24] as const;
export const watchSchema = z.object({
  placeId: idSchema,
  hours: z.number().int().refine((h) => (WATCH_HOURS as readonly number[]).includes(h), "invalid"),
  /** Notify when the level is at or below this: 1 empty only, 2 quiet or better, 3 moderate or better. */
  target: z.number().int().min(1).max(3).default(2),
});
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().startsWith("https://").max(1000),
  keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(10).max(100) }),
});
