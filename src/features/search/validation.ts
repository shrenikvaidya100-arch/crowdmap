import { z } from "zod";

export const SEARCH_MIN = 2;
export const SEARCH_MAX = 60;

/** Shared by the search box (before sending) and the API route (on arrival). */
export const searchQuerySchema = z.object({
  q: z.string().trim().min(SEARCH_MIN).max(SEARCH_MAX),
  city: z.string().regex(/^[a-z0-9-]{2,40}$/).optional(),
});
