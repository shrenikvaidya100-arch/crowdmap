"use client";
import { Icon } from "@/components/icons/Icon";
import ParticleButton from "@/components/core/particle-button";
// Record a photo, video (≤30 s) or audio clip live, or upload one from the
// device, add a caption, and post it.
// Posting: GPS check → upload slot from the server → file straight to Storage → publish.
import { useEffect, useRef, useState } from "react";
import { getGpsFix, GpsError } from "@/features/crowd/gps";
import type { Language } from "@/lib/config";
import { translator } from "@/lib/i18n";
import { beginUpload, finishUpload } from "./actions";
import { mediaBrowserClient } from "./browserClient";
import { CaptureError, fromFile, openStream, snapPhoto, startRecording, stopStream } from "./capture";
import { MEDIA_ICON, MEDIA_KINDS, mediaConfig, type MediaKind } from "./config";
import { messages } from "./messages";
import { captionSchema } from "./validation";

type Clip = { blob: Blob; url: string; seconds: number | null };

export function CaptureMedia({ placeId, lang, onPosted, onCancel, locationRequired = true }: {
  placeId: string; lang: Language; onPosted: () => void; onCancel: () => void;
  /** Off for now (an admin switch): post without being at the place. */
  locationRequired?: boolean;
}) {
  const t = translator(messages, lang);
  const [kind, setKind] = useState<MediaKind>("photo");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [clip, setClip] = useState<Clip | null>(null);
  const [recording, setRecording] = useState<{ stop: () => void } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pickFile(file: File | undefined) {
    if (!file) return;
    if (file.size > mediaConfig.maxBytes) return setError("result.too_large");
    try {
      const { blob, seconds } = await fromFile(file, kind);
      setError(null);
      setClip({ blob, url: URL.createObjectURL(blob), seconds });
    } catch (e) { setError(`camera.${e instanceof CaptureError ? e.code : "failed"}`); }
  }

  // Open the camera/mic for the chosen kind while nothing has been captured yet.
  useEffect(() => {
    if (clip) return;
    let active: MediaStream | null = null;
    let cancelled = false;
    openStream(kind)
      .then((s) => { if (cancelled) stopStream(s); else { active = s; setStream(s); setError(null); } })
      .catch((e) => { if (!cancelled) setError(`camera.${e instanceof CaptureError ? e.code : "failed"}`); });
    return () => { cancelled = true; stopStream(active); setStream(null); };
  }, [kind, clip]);

  useEffect(() => {
    if (videoRef.current && stream && kind !== "audio") videoRef.current.srcObject = stream;
  }, [stream, kind]);

  useEffect(() => {
    if (!recording) return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 250);
    return () => clearInterval(timer);
  }, [recording]);

  useEffect(() => () => { if (clip) URL.revokeObjectURL(clip.url); }, [clip]);

  async function takePhoto() {
    if (!videoRef.current) return;
    try {
      const blob = await snapPhoto(videoRef.current);
      setClip({ blob, url: URL.createObjectURL(blob), seconds: null });
    } catch { setError("camera.failed"); }
  }

  function record() {
    if (!stream || kind === "photo") return;
    try {
      setElapsed(0);
      setRecording(startRecording(stream, kind, (blob, seconds) => {
        setRecording(null);
        setClip({ blob, url: URL.createObjectURL(blob), seconds });
      }));
    } catch (e) { setError(`camera.${e instanceof CaptureError ? e.code : "failed"}`); }
  }

  async function post() {
    if (!clip) return;
    const cap = captionSchema.safeParse(caption);
    if (!cap.success) return setError(`result.${cap.error.issues[0].message}`);
    if (clip.blob.size > mediaConfig.maxBytes) return setError("result.too_large");
    setBusy(true);
    setError(null);
    try {
      // With the location rule on, a GPS fix is needed; while it's off, use one if it
      // comes quickly and post anyway if not.
      const fix = locationRequired ? await getGpsFix()
        : await Promise.race([getGpsFix().catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 4000))]);
      const slot = await beginUpload({
        placeId, kind, mime: clip.blob.type, size: clip.blob.size, duration: clip.seconds, caption: cap.data, fix,
      });
      if (!slot.ok || !slot.path || !slot.token || !slot.id) return setError(`result.${slot.reason ?? "error"}`);
      const { error: upError } = await mediaBrowserClient().storage.from("media")
        .uploadToSignedUrl(slot.path, slot.token, clip.blob, { contentType: clip.blob.type });
      if (upError) return setError("result.upload_failed");
      const done = await finishUpload(slot.id);
      if (!done.ok) return setError(`result.${done.reason ?? "error"}`);
      // Let the check and the burst play before the form closes.
      setPosted(true);
      setTimeout(onPosted, 900);
    } catch (e) {
      setError(e instanceof GpsError ? `gps.${e.code}` : "result.error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 p-3 dark:border-gray-700">
      <div role="tablist" className="grid grid-cols-3 gap-1 rounded-lg bg-gray-100 p-1 text-sm dark:bg-gray-800">
        {MEDIA_KINDS.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} disabled={!!recording || busy || !!clip}
                  onClick={() => setKind(k)}
                  className={`rounded-md px-2 py-1.5 font-medium disabled:opacity-60 ${kind === k ? "bg-white shadow dark:bg-gray-900" : "text-gray-600 dark:text-gray-300"}`}>
            <Icon name={MEDIA_ICON[k]} size={16} className="inline" /> {t(k)}
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-500">{t(locationRequired ? "mustBeHere" : "anywhere")}</p>

      {/* Live preview or the captured clip */}
      <div className="overflow-hidden rounded-lg bg-black">
        {clip ? (
          // eslint-disable-next-line @next/next/no-img-element
          kind === "photo" ? <img src={clip.url} alt="" className="max-h-72 w-full object-contain" />
          : kind === "video" ? <video src={clip.url} controls playsInline className="max-h-72 w-full" />
          : <div className="p-4"><audio src={clip.url} controls className="w-full" /></div>
        ) : kind === "audio" ? (
          <div className={`grid h-28 place-items-center ${recording ? "text-red-500" : "text-white"}`}><Icon name={recording ? "record" : "mic"} size={40} /></div>
        ) : (
          <video ref={videoRef} autoPlay muted playsInline className="max-h-72 w-full" />
        )}
      </div>

      {recording && (
        <p className="text-sm font-medium text-red-600" aria-live="polite">
          <Icon name="record" size={12} className="inline" /> {t("recording", { s: elapsed, max: mediaConfig.maxSeconds })}
        </p>
      )}

      {clip && (
        <label className="block text-sm">
          <span className="font-medium">{t("caption")}</span>
          <textarea value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={mediaConfig.captionMax} rows={2}
                    className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-950" />
          <span className="text-xs text-gray-500">{t("captionHint", { n: mediaConfig.captionMax })} · {caption.length}/{mediaConfig.captionMax}</span>
        </label>
      )}

      {error && <p role="alert" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">{t(error)}</p>}
      {busy && <p className="text-sm text-blue-600">{t("posting")}</p>}

      <div className="flex flex-wrap gap-2">
        {!clip && kind === "photo" && (
          <button type="button" disabled={!stream} onClick={takePhoto}
                  className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{t("takePhoto")}</button>
        )}
        {!clip && kind !== "photo" && (recording ? (
          <button type="button" onClick={() => recording.stop()}
                  className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white"><Icon name="stop" size={14} className="mr-1 inline" />{t("stop")}</button>
        ) : (
          <button type="button" disabled={!stream} onClick={record}
                  className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"><Icon name="record" size={14} className="mr-1 inline text-red-300" />{t("record")}</button>
        ))}
        {!clip && !recording && (
          <>
            <input ref={fileRef} type="file" hidden accept={kind === "photo" ? "image/*" : kind === "video" ? "video/*" : "audio/*"}
                   onChange={(e) => { void pickFile(e.target.files?.[0]); e.target.value = ""; }} />
            <button type="button" onClick={() => fileRef.current?.click()}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium dark:border-gray-700">
              <Icon name="image" size={14} className="mr-1 inline" />{t("upload")}
            </button>
          </>
        )}
        {clip && (
          <>
            <ParticleButton onClick={() => { if (!busy && !posted) void post(); }}
                            status={busy ? "pending" : posted ? "success" : error ? "error" : "idle"}
                            pendingLabel={t("postingShort")} successLabel={t("posted")} errorLabel={t("tryAgain")}>
              {t("post")}
            </ParticleButton>
            <button type="button" disabled={busy} onClick={() => { setClip(null); setCaption(""); setError(null); }}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700">{t("retake")}</button>
          </>
        )}
        <button type="button" disabled={busy} onClick={() => { recording?.stop(); onCancel(); }}
                className="ml-auto rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">{t("cancel")}</button>
      </div>
    </div>
  );
}
