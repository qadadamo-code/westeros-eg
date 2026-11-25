/**
 * The Cost Control radio runtime (Saqr 2026-11-25): runs only for an employee management allowed.
 *   - every incoming message: a sound, the message at the top of the screen, and a phone/laptop notification
 *   - مباشر (live): voice plays at once and the floating mic talks straight to the last person or group, like a
 *     walkie-talkie; otherwise the mic opens /radio and the message waits there
 */
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Mic, RadioTower, X } from "lucide-react";
import { useDb } from "@/data/hooks";
import { useSession } from "@/auth/session";
import { useToast } from "@/ui";
import type { RadioChannelId, RadioClip } from "@/modules/ops/types";
import { radio, useRadioEngine } from "@/modules/ops/radio/engine";
import { dmId, grpId, isDm, isGrp, setRadioGroups } from "@/modules/ops/radio/channels";
import { PttButton, usePttNotices } from "@/modules/ops/radio/PttButton";
import { recorderSupported } from "@/modules/ops/radio/recorder";
import { useUnread } from "@/modules/ops/radio/useClips";
import { useOpsSettings } from "@/modules/ops/settings";
import { radioLive } from "../radio/access";
import { useMyRadio } from "./useRadio";

const LAST_KEY = "westeros.radio.last";
export const lastChannel = (): string | null => {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
};
export const rememberChannel = (ch: string) => {
  try {
    localStorage.setItem(LAST_KEY, ch);
  } catch {
    /* private mode */
  }
};

/** a short two-tone beep (no file to download) */
function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.16);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.16 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.16 + 0.14);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.16);
      o.stop(ctx.currentTime + i * 0.16 + 0.15);
    });
    setTimeout(() => void ctx.close(), 600);
    navigator.vibrate?.([60, 40, 60]);
  } catch {
    /* no audio */
  }
}

/** a phone / laptop notification (needs the permission, asked on the radio screen or the first tap) */
async function notify(title: string, body: string, url: string, tag: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const opts: NotificationOptions = { body, tag, icon: `${import.meta.env.BASE_URL}icons/icon-192.png`, data: { url } };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) return void (await reg.showNotification(title, opts));
  } catch {
    /* fall back below */
  }
  try {
    new Notification(title, opts);
  } catch {
    /* not allowed here */
  }
}

export function askNotifications() {
  if (typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission().catch(() => undefined);
}

export function CcRadio() {
  const my = useMyRadio();
  useEffect(() => setRadioGroups(my.setup.groups), [my.setup.groups]);
  return my.on ? <On /> : null;
}

interface Banner {
  id: string;
  title: string;
  body: string;
  channel: string;
}

function On() {
  const db = useDb();
  const { staff, role } = useSession();
  const { cfg } = useOpsSettings();
  const my = useMyRadio();
  const live = radioLive(my.setup, staff ? { id: staff.id, role: role ?? "" } : null);
  const { toast } = useToast();
  const nav = useNavigate();
  const snap = useRadioEngine();
  const loc = useLocation();
  const unread = useUnread();
  usePttNotices();
  const [banners, setBanners] = useState<Banner[]>([]);
  useEffect(() => {
    if (!staff) return;
    radio.attach({ db, me: staff.id, name: staff.name, role, config: { minMs: cfg.radio.minClipMs, maxMs: cfg.radio.maxClipSec * 1000, autoplay: live } });
  }, [db, staff, role, cfg.radio.minClipMs, cfg.radio.maxClipSec, live]);
  useEffect(() => () => radio.detach(), []);
  // the browser asks for notifications only after a tap
  useEffect(() => {
    window.addEventListener("pointerdown", askNotifications, { once: true });
    return () => window.removeEventListener("pointerdown", askNotifications);
  }, []);
  const groupsRef = useRef(my.setup.groups);
  groupsRef.current = my.setup.groups;
  const liveRef = useRef(live);
  liveRef.current = live;
  useEffect(
    () =>
      radio.onIncoming((clip: RadioClip, played) => {
        const group = isGrp(clip.channel) ? groupsRef.current.find((g) => `grp:${g.id}` === clip.channel)?.name ?? "" : null;
        const title = group ? `${clip.fromName} · مجموعة ${group}` : `${clip.fromName} · ليك`;
        const body = clip.text ?? (played ? "رسالة صوتية (بتشتغل دلوقتي)" : `رسالة صوتية ${(clip.durationMs / 1000).toFixed(0)} ث، افتحها تسمعها`);
        if (!played || clip.text) beep();
        const url = `${location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/radio?ch=${encodeURIComponent(clip.channel)}`;
        void notify(`📻 ${title}`, body, url, clip.id);
        if (location.pathname.endsWith("/radio")) return;
        setBanners((b) => [{ id: clip.id, title, body, channel: clip.channel }, ...b].slice(0, 3));
        setTimeout(() => setBanners((b) => b.filter((x) => x.id !== clip.id)), 7000);
      }),
    [],
  );
  const blockedShown = useRef(0);
  useEffect(() => {
    if (snap.blocked && snap.blocked !== blockedShown.current) {
      blockedShown.current = snap.blocked;
      toast({ title: "رسالة لاسلكي مستنية", description: "المتصفح منع التشغيل التلقائي، دوس شغّل", tone: "warn", action: { label: "شغّل", onClick: () => radio.playBlocked() } });
    }
  }, [snap.blocked, toast]);

  const onRadio = loc.pathname.endsWith("/radio");
  const n = Object.entries(unread).reduce((a, [ch, k]) => (isDm(ch) || isGrp(ch) ? a + k : a), 0);
  const air = snap.onAir.find((a) => a.who !== staff?.id);
  // the channel the live mic talks on: the last one used, if still allowed, else the first allowed
  const me = staff?.id ?? "";
  const allowed = [...my.groups.map((g) => grpId(g.id) as string), ...my.people.map((m) => dmId(me, m.id) as string)];
  const last = lastChannel();
  const talkOn = (last && allowed.includes(last) ? last : allowed[0]) as RadioChannelId | undefined;
  const talkName = talkOn ? (isGrp(talkOn) ? my.groups.find((g) => grpId(g.id) === talkOn)?.name : my.people.find((m) => dmId(me, m.id) === talkOn)?.name) : null;

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[110] flex flex-col items-center gap-2 p-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]" aria-live="polite">
        <AnimatePresence>
          {banners.map((b) => (
            <motion.div key={b.id} initial={{ opacity: 0, y: -24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -24 }}
              className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border border-line bg-surface p-3 shadow-sf-lg" data-radio-banner>
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brass text-white"><RadioTower className="size-4.5" /></span>
              <button type="button" className="min-w-0 flex-1 text-start" onClick={() => (setBanners((x) => x.filter((y) => y.id !== b.id)), nav(`/radio?ch=${encodeURIComponent(b.channel)}`))}>
                <p className="truncate text-[14.5px] font-bold">{b.title}</p>
                <p className="line-clamp-2 text-[13.5px] text-ink-2">{b.body}</p>
              </button>
              <button type="button" aria-label="قفل" className="text-muted hover:text-ink" onClick={() => setBanners((x) => x.filter((y) => y.id !== b.id))}><X className="size-4" /></button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {onRadio ? null : live && talkOn && recorderSupported() ? (
        <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] end-4 z-40 flex flex-col items-center gap-1.5 md:bottom-6" data-cc-radio-fab data-live>
          {air ? <span className="max-w-36 truncate rounded-full bg-danger px-2.5 py-1 text-[11.5px] font-bold text-white shadow-sf">{air.name}</span> : null}
          <PttButton channel={talkOn} size="fab" label={`اضغط واتكلم: ${talkName ?? ""}`} />
          <Link to="/radio" className="relative max-w-32 truncate rounded-full bg-surface px-2.5 py-0.5 text-[11.5px] font-semibold text-muted shadow-sf-sm">
            {talkName}
            {n ? <span className="num ms-1 rounded-full bg-danger px-1.5 text-[10.5px] font-bold text-white">{n}</span> : null}
          </Link>
        </div>
      ) : (
        <Link to="/radio" aria-label="اللاسلكي" data-cc-radio-fab
          className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] end-4 z-40 grid size-14 place-items-center rounded-full bg-brass text-white shadow-sf md:bottom-6">
          <Mic className={air ? "size-6 animate-pulse" : "size-6"} />
          {n ? <span className="num absolute -top-1 -end-1 grid min-w-5 place-items-center rounded-full bg-danger px-1 text-[11.5px] font-bold text-white">{n}</span> : null}
        </Link>
      )}
    </>
  );
}
