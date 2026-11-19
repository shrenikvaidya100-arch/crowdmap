// Same rules as public.valid_place_name() in the database; used in the form and the server actions.
import { z } from "zod";
import { gpsFixSchema } from "@/features/crowd/validation";

export const PLACE_CATEGORIES = [
  "temple", "religious", "market", "restaurant", "cafe", "street_food", "mall", "park",
  "tourist", "hospital", "station", "bank", "government", "education", "entertainment", "hostel", "other",
] as const;

export const placeNameSchema = z.string().trim()
  .min(2, "name.short")
  .max(80, "name.long")
  .regex(/^[\p{L}\p{N}\s.,'&()/#-]+$/u, "name.chars")
  .regex(/\p{L}/u, "name.letter")
  .refine((v) => !/(https?:|www\.|\|)/i.test(v), "name.link");

export const placeFieldsSchema = z.object({
  name: placeNameSchema,
  nameHi: z.string().trim().max(80, "nameHi.long").optional().or(z.literal("")),
  category: z.enum(PLACE_CATEGORIES, { message: "category.required" }),
});

export const addPlaceSchema = placeFieldsSchema.extend({ fix: gpsFixSchema });
export const editPlaceSchema = placeFieldsSchema.extend({ placeId: z.string().uuid() });
export const confirmPlaceSchema = z.object({ placeId: z.string().uuid(), exists: z.boolean(), fix: gpsFixSchema });
