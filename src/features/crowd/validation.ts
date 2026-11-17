// Shared by the browser and the server actions.
import { z } from "zod";
import { QUICK_KINDS } from "./config";

export const gpsFixSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().positive().max(10_000),
  spread: z.number().min(0).max(100_000),
});
export type GpsFix = z.infer<typeof gpsFixSchema>;

const uuid = z.string().uuid();

export const crowdReportSchema = z.object({
  placeId: uuid,
  level: z.number().int().min(1).max(5),
  fix: gpsFixSchema,
});

export const updateReportSchema = z.object({
  reportId: uuid,
  level: z.number().int().min(1).max(5),
});

export const quickReportSchema = z.object({
  kind: z.enum(QUICK_KINDS.map((k) => k.kind) as [string, ...string[]]),
  placeId: uuid,
  fix: gpsFixSchema,
});

export const voteSchema = z.object({
  reportId: uuid,
  stillThere: z.boolean(),
  fix: gpsFixSchema,
});

export const idSchema = uuid;
