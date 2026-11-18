// Shared by the browser and the server actions.
import { z } from "zod";
import { gpsFixSchema } from "@/features/crowd/validation";
import { MEDIA_KINDS, MEDIA_MIMES, mediaConfig } from "./config";

const uuid = z.string().uuid();
export const idSchema = uuid;

export const captionSchema = z.string().trim().max(mediaConfig.captionMax, "captionTooLong");

export const beginUploadSchema = z.object({
  placeId: uuid,
  kind: z.enum(MEDIA_KINDS),
  mime: z.string(),
  size: z.number().int().min(1).max(mediaConfig.maxBytes, "tooLarge"),
  duration: z.number().min(0).max(mediaConfig.maxSeconds + 1, "tooLong").nullable(),
  caption: captionSchema,
  fix: gpsFixSchema,
}).refine((v) => MEDIA_MIMES[v.kind].includes(v.mime), { message: "badType", path: ["mime"] })
  .refine((v) => v.kind === "photo" || v.duration !== null, { message: "tooLong", path: ["duration"] });

export const editCaptionSchema = z.object({ mediaId: uuid, caption: captionSchema });

export const commentBodySchema = z.string().trim()
  .min(1, "commentEmpty").max(mediaConfig.commentMax, "commentTooLong");

export const addCommentSchema = z.object({ mediaId: uuid, body: commentBodySchema });
export const editCommentSchema = z.object({ commentId: uuid, body: commentBodySchema });

/** Base type without codec details, e.g. "video/webm;codecs=vp8" → "video/webm". */
export const baseMime = (m: string) => m.split(";")[0].trim().toLowerCase();
