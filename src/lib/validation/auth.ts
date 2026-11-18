// Form rules shared by the browser (instant feedback) and the server (enforcement).
import { z } from "zod";
import { config } from "@/lib/config";

const { passwordMinLength, passwordMaxLength, displayNameMin, displayNameMax } = config.auth;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "email.required")
  .max(254, "email.invalid")
  .email("email.invalid");

export const passwordSchema = z
  .string()
  .min(passwordMinLength, "password.short")
  .max(passwordMaxLength, "password.long")
  .regex(/[A-Za-z]/, "password.letter")
  .regex(/[0-9]/, "password.number");

export const displayNameSchema = z
  .string()
  .trim()
  .min(displayNameMin, "name.short")
  .max(displayNameMax, "name.long")
  .regex(/^[\p{L}\p{M}0-9 ._'-]+$/u, "name.chars")
  // No links, email addresses or phone numbers in public names (the database checks too).
  .refine((v) => !/(https?:|www\.|\.com\b)/i.test(v), "name.link")
  .refine((v) => !/[^\s@]+@[^\s@]+\.[a-z]/i.test(v), "name.email")
  .refine((v) => !/[0-9][0-9 ()+-]{7,}[0-9]/.test(v), "name.phone");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "password.required").max(passwordMaxLength, "password.long"),
});

export const signupSchema = z
  .object({
    displayName: displayNameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "password.mismatch",
  });

export type FieldErrors = Partial<Record<string, string>>;

/** Turns a zod error into { field: messageKey }, first error per field. */
export function toFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    if (!out[field]) out[field] = issue.message;
  }
  return out;
}
