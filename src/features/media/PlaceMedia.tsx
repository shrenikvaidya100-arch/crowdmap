"use client";
import { Icon } from "@/components/icons/Icon";
import ParticleButton from "@/components/core/particle-button";
// Media feed for one place: photos, videos and audio clips shared by people who
// were there, each with comments. Shown inside the place panel.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Language } from "@/lib/config";
import { translator } from "@/lib/i18n";
import {
  addComment, addPlaceComment, deleteComment, deleteMedia, editCaption, editComment, reportComment, reportMedia, type MediaResult,
} from "./actions";
import { CaptureMedia } from "./CaptureMedia";
import { MEDIA_ICON, mediaConfig, type MediaKind } from "./config";
import { messages } from "./messages";
import { captionSchema, commentBodySchema } from "./validation";

type Item = {
  id: string; kind: MediaKind; mime: string; caption: string | null; duration_s: number | null; url: string | null;
  created_at: string; edited_at: string | null; author: string; mine: boolean; comment_count: number; is_sample: boolean;
};
type Comment = { id: string; body: string; created_at: string; edited_at: string | null; author: string; mine: boolean };
type T = ReturnType<typeof translator>;

function useAgo(t: T) {
  // "Now" is fixed when data loads so times don't change between renders.
  const [now, setNow] = useState<number | null>(null);
  const ago = (iso: string) => {
    const min = Math.round(((now ?? Date.now()) - new Date(iso).getTime()) / 60000);
    if (min < 1) return t("ago.now");
    if (min < 60) return t("ago.min", { n: min });
    if (min < 60 * 24) return t("ago.hour", { n: Math.round(min / 60) });
    return t("ago.day", { n: Math.round(min / 1440) });
  };
  return { ago, stamp: () => setNow(Date.now()) };
}

function Notice({ t, notice }: { t: T; notice: { ok: boolean; key: string } | null }) {
  if (!notice) return null;
  return (
    <p role={notice.ok ? "status" : "alert"}
       className={`rounded-md px-3 py-2 text-sm ${notice.ok ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200" : "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200"}`}>
      {t(notice.key)}
    </p>
  );
}

export function PlaceMedia({ placeId, lang }: { placeId: string; lang: Language }) {
  const t = translator(messages, lang);
  const { ago, stamp } = useAgo(t);
  const [items, setItems] = useState<Item[] | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [locationRequired, setLocationRequired] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; key: string } | null>(null);
  const [loadError, setLoadError] = useState(false);

  // Bumping "version" reloads the feed.
  const [version, setVersion] = useState(0);
  const load = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/media?place=${placeId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => { if (!cancelled) { setItems(d.items); setSignedIn(d.signed_in); setLocationRequired(d.location_required !== false); stamp(); setLoadError(false); } })
      .catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeId, version]);

  async function run(action: () => Promise<MediaResult>, okKey: string) {
    setNotice(null);
    const res = await action();
    setNotice({ ok: res.ok, key: res.ok ? okKey : `result.${res.reason ?? "error"}` });
    if (res.ok) load();
    return res.ok;
  }

  return (
    <section aria-labelledby={`media-${placeId}`}>
      <h3 id={`media-${placeId}`} className="text-sm font-medium">{t("title")}</h3>

      <div className="mt-2 space-y-3">
        {!signedIn ? (
          items && <Link href="/login?next=/map" className="inline-block text-sm text-blue-600 hover:underline">{t("signIn")}</Link>
        ) : capturing ? (
          <CaptureMedia placeId={placeId} lang={lang} locationRequired={locationRequired} onCancel={() => setCapturing(false)}
                        onPosted={() => { setCapturing(false); setNotice({ ok: true, key: "result.posted" }); load(); }} />
        ) : (
          <button type="button" onClick={() => { setNotice(null); setCapturing(true); }}
                  className="rounded-md border border-blue-600 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950">
            <Icon name="camera" size={16} className="mr-1.5 inline" />{t("add")}
          </button>
        )}

        <Notice t={t} notice={notice} />
        {loadError && <p className="text-sm text-red-600">{t("result.error")}</p>}
        {items && items.length === 0 && <p className="text-sm text-gray-500">{t("empty")}</p>}

        {items?.map((m) => (
          <MediaCard key={m.id} item={m} t={t} ago={ago} signedIn={signedIn} run={run} refresh={load} />
        ))}
      </div>
    </section>
  );
}

function MediaCard({ item: m, t, ago, signedIn, run, refresh }: {
  item: Item; t: T; ago: (iso: string) => string; signedIn: boolean;
  run: (a: () => Promise<MediaResult>, okKey: string) => Promise<boolean>;
  refresh: () => void;
}) {
  const [reporting, setReporting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState(m.caption ?? "");
  const [open, setOpen] = useState(false);

  return (
    <article className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
      {m.url ? (
        // Signed Storage links: next/image optimisation does not apply.
        // eslint-disable-next-line @next/next/no-img-element
        m.kind === "photo" ? <img src={m.url} alt={m.caption ?? t("photo")} loading="lazy" className="max-h-80 w-full bg-black object-contain" />
        : m.kind === "video" ? <video src={m.url} controls playsInline preload="metadata" className="max-h-80 w-full bg-black" />
        : <div className="bg-gray-50 p-3 dark:bg-gray-800"><audio src={m.url} controls preload="metadata" className="w-full" /></div>
      ) : (
        <div className="grid h-24 place-items-center bg-gray-100 text-gray-400 dark:bg-gray-800"><Icon name={MEDIA_ICON[m.kind]} size={32} /></div>
      )}
      <div className="space-y-1.5 p-3 text-sm">
        {editing ? (
          <form className="space-y-2" onSubmit={async (e) => {
            e.preventDefault();
            const parsed = captionSchema.safeParse(caption);
            if (!parsed.success) return;
            if (await run(() => editCaption({ mediaId: m.id, caption: parsed.data }), "result.saved")) setEditing(false);
          }}>
            <textarea autoFocus value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={mediaConfig.captionMax} rows={2}
                      aria-label={t("caption")}
                      className="w-full rounded-md border border-gray-300 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-950" />
            <div className="flex gap-2">
              <button className="rounded-md bg-blue-600 px-3 py-1 text-white">{t("save")}</button>
              <button type="button" onClick={() => { setEditing(false); setCaption(m.caption ?? ""); }} className="px-2 text-gray-600">{t("cancel")}</button>
            </div>
          </form>
        ) : (
          m.caption && <p className="whitespace-pre-wrap break-words">{m.caption}</p>
        )}
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1"><Icon name={MEDIA_ICON[m.kind]} size={14} /> {t("by", { name: m.author, ago: ago(m.created_at) })}</span>
          {m.duration_s != null && <span>· {Math.round(m.duration_s)}s</span>}
          {m.edited_at && <span>· {t("edited")}</span>}
          {m.is_sample && <span className="rounded bg-amber-100 px-1 text-amber-800">{t("sample")}</span>}
          {m.mine && <span className="rounded bg-blue-100 px-1 text-blue-800">{t("yours")}</span>}
        </p>
        <div className="flex flex-wrap gap-3 text-xs">
          <button type="button" onClick={() => setOpen((o) => !o)} className="text-blue-600 hover:underline" aria-expanded={open}>
            <Icon name="comment" size={14} className="mr-1 inline" />{open ? t("hideComments") : t("comments", { n: m.comment_count })}
          </button>
          {m.mine && !editing && (
            <>
              <button type="button" onClick={() => setEditing(true)} className="text-blue-600 hover:underline">{t("edit")}</button>
              <button type="button" className="text-red-600 hover:underline"
                      onClick={() => { if (confirm(t("confirmDeleteMedia"))) void run(() => deleteMedia(m.id), "result.deleted"); }}>
                {t("delete")}
              </button>
            </>
          )}
          {!m.mine && signedIn && !m.is_sample && (
            <button type="button" onClick={() => setReporting((r) => !r)} aria-expanded={reporting} className="text-gray-500 hover:underline">
              {m.kind === "video" ? t("reportVideo") : m.kind === "audio" ? t("reportAudio") : t("reportPhoto")}
            </button>
          )}
        </div>
        {reporting && <ReportForm mediaId={m.id} t={t} onDone={() => setReporting(false)} />}
        {open && <Comments mediaId={m.id} t={t} ago={ago} signedIn={signedIn} refresh={refresh} />}
      </div>
    </article>
  );
}

function Comments({ mediaId, t, ago, signedIn, refresh }: {
  mediaId: string; t: T; ago: (iso: string) => string; signedIn: boolean;
  /** Reloads the feed so comment counts stay right. */
  refresh: () => void;
}) {
  const [items, setItems] = useState<Comment[] | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; key: string } | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [busy, setBusy] = useState(false);

  const [version, setVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/media/${mediaId}/comments`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => { if (!cancelled) setItems(d.items); })
      .catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
  }, [mediaId, version]);

  async function act(action: () => Promise<MediaResult>, okKey: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await action();
    setBusy(false);
    // Messages stay next to the comment box, where the person is looking.
    setNotice({ ok: res.ok, key: res.ok ? okKey : `result.${res.reason ?? "error"}` });
    if (res.ok) { setVersion((v) => v + 1); refresh(); }
    return res.ok;
  }

  return (
    <div className="space-y-2 border-t border-gray-100 pt-2 dark:border-gray-800">
      {items === null ? <p className="text-xs text-gray-500">…</p>
        : items.length === 0 ? <p className="text-xs text-gray-500">{t("noComments")}</p>
        : (
          <ul className="space-y-2">
            {items.map((c) => (
              <li key={c.id} className="rounded-md bg-gray-50 px-2 py-1.5 dark:bg-gray-800">
                {editId === c.id ? (
                  <form className="flex gap-2" onSubmit={async (e) => {
                    e.preventDefault();
                    const parsed = commentBodySchema.safeParse(editBody);
                    if (!parsed.success) return setError(`result.${parsed.error.issues[0].message}`);
                    if (await act(() => editComment({ commentId: c.id, body: parsed.data }), "result.saved")) setEditId(null);
                  }}>
                    <input autoFocus value={editBody} onChange={(e) => setEditBody(e.target.value)} maxLength={mediaConfig.commentMax}
                           aria-label={t("edit")} className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-950" />
                    <button disabled={busy} className="text-blue-600">{t("save")}</button>
                    <button type="button" onClick={() => setEditId(null)} className="text-gray-500">{t("cancel")}</button>
                  </form>
                ) : (
                  <p className="whitespace-pre-wrap break-words">{c.body}</p>
                )}
                <p className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-gray-500">
                  <span>{t("by", { name: c.author, ago: ago(c.created_at) })}</span>
                  {c.edited_at && <span>· {t("edited")}</span>}
                  {c.mine && editId !== c.id && (
                    <>
                      <button type="button" className="text-blue-600 hover:underline" onClick={() => { setEditId(c.id); setEditBody(c.body); }}>{t("edit")}</button>
                      <button type="button" className="text-red-600 hover:underline"
                              onClick={() => { if (confirm(t("confirmDeleteComment"))) void act(() => deleteComment(c.id), "result.deleted"); }}>
                        {t("delete")}
                      </button>
                    </>
                  )}
                  {!c.mine && signedIn && (
                    <button type="button" className="text-gray-500 hover:text-red-600 hover:underline"
                            onClick={() => { if (confirm(t("confirmReportComment"))) void act(() => reportComment(c.id), "result.commentReported"); }}>
                      {t("reportComment")}
                    </button>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}

      {signedIn && (
        <form className="flex gap-2" onSubmit={async (e) => {
          e.preventDefault();
          const parsed = commentBodySchema.safeParse(body);
          if (!parsed.success) return setError(`result.${parsed.error.issues[0].message}`);
          if (await act(() => addComment({ mediaId, body: parsed.data }), "result.commented")) setBody("");
        }}>
          <input value={body} onChange={(e) => setBody(e.target.value)} maxLength={mediaConfig.commentMax}
                 placeholder={t("writeComment")} aria-label={t("writeComment")}
                 className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-950" />
          <button disabled={busy || !body.trim()} className="rounded-md bg-blue-600 px-3 py-1.5 text-white disabled:opacity-50">{t("send")}</button>
        </form>
      )}
      {error ? <p role="alert" className="text-xs text-amber-700">{t(error)}</p> : <Notice t={t} notice={notice} />}
    </div>
  );
}

/** Report an upload to the admins, with a reason. */
function ReportForm({ mediaId, t, onDone }: { mediaId: string; t: T; onDone: () => void }) {
  const [reason, setReason] = useState("inappropriate");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; key: string } | null>(null);
  if (result?.ok) return <p role="status" className="text-xs text-green-700 dark:text-green-400">{t(result.key)}</p>;
  return (
    <form className="space-y-2 rounded-md bg-gray-50 p-2.5 text-xs dark:bg-gray-800" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      const r = await reportMedia({ mediaId, reason, note });
      setBusy(false);
      if (r.ok) {
        // Show "Sent" on the button for a moment, then the thank-you line.
        setSent(true);
        setTimeout(() => setResult({ ok: true, key: "result.reported" }), 900);
      } else setResult({ ok: false, key: `result.${r.reason ?? "error"}` });
    }}>
      <fieldset className="space-y-1">
        <legend className="mb-1 font-medium">{t("reportWhy")}</legend>
        {["inappropriate", "not_this_place", "private_info", "spam", "other"].map((r) => (
          <label key={r} className="flex items-center gap-2">
            <input type="radio" name={`reason-${mediaId}`} checked={reason === r} onChange={() => setReason(r)} className="accent-blue-600" />
            {t(`reason.${r}`)}
          </label>
        ))}
      </fieldset>
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={t("reportNote")} aria-label={t("reportNote")}
             className="w-full rounded border border-gray-300 bg-transparent px-2 py-1 dark:border-gray-600" />
      <div className="flex gap-2">
        <ParticleButton type="submit" particles={false}
                        status={busy ? "pending" : sent ? "success" : result && !result.ok ? "error" : "idle"}
                        pendingLabel={t("sending")} successLabel={t("sent")} errorLabel={t("tryAgain")}
                        className="h-7 rounded border border-gray-400 bg-transparent px-2.5 text-xs text-inherit hover:bg-gray-100 dark:hover:bg-gray-700">
          {t("sendReport")}
        </ParticleButton>
        <button type="button" onClick={onDone} className="px-2 text-gray-500">{t("cancel")}</button>
      </div>
      {result && !result.ok && <p role="alert" className="text-amber-700">{t(result.key)}</p>}
    </form>
  );
}

/** Comments straight on a place: no photo or video needed. */
export function PlaceComments({ placeId, lang }: { placeId: string; lang: Language }) {
  const t = translator(messages, lang);
  const { ago, stamp } = useAgo(t);
  const [items, setItems] = useState<Comment[] | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; key: string } | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/places/${placeId}/comments`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => { if (!cancelled) { setItems(d.items); setSignedIn(d.signed_in); stamp(); } })
      .catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeId, version]);

  async function act(run: () => Promise<MediaResult>, okKey: string) {
    setBusy(true); setNotice(null);
    const res = await run();
    setBusy(false);
    setNotice({ ok: res.ok, key: res.ok ? okKey : `result.${res.reason ?? "error"}` });
    if (res.ok) setVersion((v) => v + 1);
    return res.ok;
  }
  async function post(e: React.FormEvent) {
    e.preventDefault();
    const parsed = commentBodySchema.safeParse(body);
    if (!parsed.success) { setNotice({ ok: false, key: `result.${parsed.error.issues[0].message}` }); return; }
    if (await act(() => addPlaceComment({ placeId, body: parsed.data }), "place.posted")) setBody("");
  }

  return (
    <section aria-labelledby={`pc-${placeId}`}>
      <h3 id={`pc-${placeId}`} className="text-sm font-medium">{t("place.title")}{items?.length ? ` (${items.length})` : ""}</h3>
      {signedIn ? (
        <form onSubmit={post} className="mt-2 flex gap-2">
          <input value={body} onChange={(e) => setBody(e.target.value)} maxLength={mediaConfig.commentMax} placeholder={t("place.placeholder")}
                 aria-label={t("place.placeholder")}
                 className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700" />
          <button type="submit" disabled={busy || !body.trim()} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50">{t("send")}</button>
        </form>
      ) : items && (
        <Link href="/login?next=/map" className="mt-2 inline-block text-sm text-blue-600 hover:underline">{t("place.signIn")}</Link>
      )}
      <Notice t={t} notice={notice} />
      {items && items.length === 0 && <p className="mt-2 text-sm text-gray-500">{t("place.none")}</p>}
      {items && items.length > 0 && (
        <ul className="mt-2 space-y-2">
          {items.map((c) => (
            <li key={c.id} className="rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-800/60">
              <p className="whitespace-pre-wrap break-words">{c.body}</p>
              <p className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-gray-500">
                <span>{t("by", { name: c.author, ago: ago(c.created_at) })}</span>
                {c.edited_at && <span>· {t("edited")}</span>}
                {c.mine && (
                  <button type="button" className="text-red-600 hover:underline"
                          onClick={() => { if (confirm(t("confirmDeleteComment"))) void act(() => deleteComment(c.id), "result.deleted"); }}>
                    {t("delete")}
                  </button>
                )}
                {!c.mine && signedIn && (
                  <button type="button" className="hover:text-red-600 hover:underline"
                          onClick={() => { if (confirm(t("confirmReportComment"))) void act(() => reportComment(c.id), "result.commentReported"); }}>
                    {t("reportComment")}
                  </button>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
