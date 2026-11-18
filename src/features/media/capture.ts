"use client";
// Capture helpers: record live with the camera or mic, or pick a file from the
// device (fromFile). Either way the post still needs a GPS fix at the place.
import { mediaConfig, type MediaKind } from "./config";
import { baseMime } from "./validation";

export class CaptureError extends Error {
  constructor(public code: "unsupported" | "denied" | "failed" | "bad_type" | "too_long") { super(code); }
}

export async function openStream(kind: MediaKind): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new CaptureError("unsupported");
  try {
    return await navigator.mediaDevices.getUserMedia(kind === "audio"
      ? { audio: { echoCancellation: true, noiseSuppression: true } }
      : {
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: kind === "video",
        });
  } catch (err) {
    const name = (err as { name?: string }).name;
    throw new CaptureError(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "failed");
  }
}

export function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

/**
 * Takes a still from the live camera. Drawing to a canvas and re-encoding
 * drops all hidden metadata (including GPS tags) and shrinks large photos.
 */
export async function snapPhoto(video: HTMLVideoElement): Promise<Blob> {
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) throw new CaptureError("failed");
  const scale = Math.min(1, mediaConfig.photoMaxSide / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", mediaConfig.photoQuality));
  if (!blob) throw new CaptureError("failed");
  return blob;
}

/** First recording format this browser supports (Chrome/Firefox: webm, Safari: mp4). */
export function recorderMime(kind: "video" | "audio"): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const options = kind === "video"
    ? ["video/webm;codecs=vp8,opus", "video/webm", "video/mp4"]
    : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return options.find((m) => MediaRecorder.isTypeSupported(m));
}

/** Records a stream, compressed by bitrate, until stop() or the 30 s limit. */
export function startRecording(stream: MediaStream, kind: "video" | "audio", onDone: (blob: Blob, seconds: number) => void) {
  const mimeType = recorderMime(kind);
  if (!mimeType) throw new CaptureError("unsupported");
  const rec = new MediaRecorder(stream, {
    mimeType,
    ...(kind === "video" ? { videoBitsPerSecond: mediaConfig.videoBitsPerSecond } : {}),
    audioBitsPerSecond: mediaConfig.audioBitsPerSecond,
  });
  const chunks: Blob[] = [];
  const started = performance.now();
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  rec.onstop = () => {
    clearTimeout(limit);
    const seconds = Math.min(mediaConfig.maxSeconds, (performance.now() - started) / 1000);
    onDone(new Blob(chunks, { type: baseMime(mimeType) }), Math.round(seconds * 10) / 10);
  };
  rec.start(1000);
  const limit = setTimeout(() => { if (rec.state !== "inactive") rec.stop(); }, mediaConfig.maxSeconds * 1000);
  return { stop: () => { if (rec.state !== "inactive") rec.stop(); } };
}

/**
 * A photo, video or audio file picked from the device. Photos are re-drawn to a
 * JPEG (which drops hidden metadata such as GPS tags, and shrinks big photos);
 * videos and audio keep their file but must be 30 s or shorter. iPhone videos
 * (.mov) are H.264/HEVC like MP4, so they are sent as MP4.
 */
export async function fromFile(file: File, kind: MediaKind): Promise<{ blob: Blob; seconds: number | null }> {
  if (kind === "photo") {
    if (!file.type.startsWith("image/")) throw new CaptureError("bad_type");
    const bitmap = await createImageBitmap(file).catch(() => { throw new CaptureError("bad_type"); });
    const scale = Math.min(1, mediaConfig.photoMaxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", mediaConfig.photoQuality));
    if (!blob) throw new CaptureError("failed");
    return { blob, seconds: null };
  }
  if (!file.type.startsWith(`${kind}/`)) throw new CaptureError("bad_type");
  const url = URL.createObjectURL(file);
  try {
    const seconds = await new Promise<number>((resolve, reject) => {
      const el = document.createElement(kind === "video" ? "video" : "audio");
      el.preload = "metadata";
      el.onloadedmetadata = () => resolve(el.duration);
      el.onerror = () => reject(new CaptureError("bad_type"));
      el.src = url;
    });
    if (!Number.isFinite(seconds) || seconds > mediaConfig.maxSeconds + 0.5) throw new CaptureError("too_long");
    const type = file.type === "video/quicktime" ? "video/mp4" : file.type === "audio/x-m4a" ? "audio/mp4" : file.type;
    return { blob: type === file.type ? file : new Blob([file], { type }), seconds: Math.ceil(seconds) };
  } finally {
    URL.revokeObjectURL(url);
  }
}
