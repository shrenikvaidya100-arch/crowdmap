import { z } from "zod";
import { displayNameSchema } from "@/lib/validation/auth";

export const profileSchema = z.object({
  displayName: displayNameSchema,
  preferredLang: z.enum(["en", "hi"]),
  homeCity: z.string().regex(/^[a-z0-9-]{2,40}$/).or(z.literal("")),
});
