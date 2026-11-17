import { z } from "zod";

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const planSchema = z.object({
  placeId: z.string().uuid(),
  at: z.string().datetime({ offset: true }),
});

export const planIdSchema = z.string().uuid();
