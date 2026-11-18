import type { IconName } from "@/components/icons/Icon";
// User 2 media settings. The database and the Storage bucket enforce the
// security-relevant limits too (supabase/migrations/2001_media_comments.sql).

export const mediaConfig = {
  maxBytes: 25 * 1024 * 1024,     // 25 MB (bucket + DB enforce)
  maxSeconds: 30,                 // video and audio length (DB enforces 31 with slack)
  photoMaxSide: 1600,             // photos are re-drawn at most this size, which drops EXIF/location data
  photoQuality: 0.82,
  videoBitsPerSecond: 1_000_000,  // ~3.75 MB for 30 s
  audioBitsPerSecond: 64_000,
  captionMax: 280,
  commentMax: 500,
  signedUrlSeconds: 60 * 60,      // links to files expire after an hour
} as const;

export const MEDIA_KINDS = ["photo", "video", "audio"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** Allowed upload types per kind (same list as the bucket). */
export const MEDIA_MIMES: Record<MediaKind, readonly string[]> = {
  photo: ["image/jpeg", "image/webp"],
  video: ["video/webm", "video/mp4"],
  audio: ["audio/webm", "audio/mp4", "audio/ogg"],
};

export const MEDIA_ICON: Record<MediaKind, IconName> = { photo: "camera", video: "video", audio: "mic" };
