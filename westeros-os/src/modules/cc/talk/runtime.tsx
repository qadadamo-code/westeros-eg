/**
 * The Cost Control radio runtime (Saqr 2026-11-25): runs only for an employee management allowed. Plays incoming
 * messages from people and groups, and shows a floating mic that opens /radio with the unread count.
 */
import { useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Mic } from "lucide-react";
import { useDb } from "@/data/hooks";
import { useSession } from "@/auth/session";
import { useToast } from "@/ui";
import { radio, useRadioEngine } from "@/modules/ops/radio/engine";
import { isDm, isGrp, setRadioGroups } from "@/modules/ops/radio/channels";
import { useUnread } from "@/modules/ops/radio/useClips";
import { useOpsSettings } from "@/modules/ops/settings";
import { useMyRadio } from "./useRadio";

export function CcRadio() {
  const my = useMyRadio();
  useEffect(() => setRadioGroups(my.setup.groups), [my.setup.groups]);
  return my.on ? <On /> : null;
}

function On() {
  const db = useDb();
  const { staff, role } = useSession();
  const { cfg } = useOpsSettings();
  const my = useMyRadio();
  const { toast } = useToast();
  const nav = useNavigate();
  const snap = useRadioEngine();
  const loc = useLocation();
  const unread = useUnread();
  useEffect(() => {
    if (!staff) return;
    radio.attach({ db, me: staff.id, name: staff.name, role, config: { minMs: cfg.radio.minClipMs, maxMs: cfg.radio.maxClipSec * 1000, autoplay: cfg.radio.autoplay } });
  }, [db, staff, role, cfg.radio.minClipMs, cfg.radio.maxClipSec, cfg.radio.autoplay]);
  useEffect(() => () => radio.detach(), []);
  const groupsRef = useRef(my.setup.groups);
  groupsRef.current = my.setup.groups;
  useEffect(
    () =>
      radio.onIncoming((clip) => {
        if (location.pathname.endsWith("/radio")) return;
        const to = isGrp(clip.channel) ? `مجموعة ${groupsRef.current.find((g) => `grp:${g.id}` === clip.channel)?.name ?? ""}` : "ليك";
        toast({ title: `📻 ${clip.fromName} · ${to}`, description: clip.text ?? "رسالة صوتية", duration: 3500, action: { label: "افتح", onClick: () => nav(`/radio?ch=${encodeURIComponent(clip.channel)}`) } });
      }),
    [toast, nav],
  );
  const blockedShown = useRef(0);
  useEffect(() => {
    if (snap.blocked && snap.blocked !== blockedShown.current) {
      blockedShown.current = snap.blocked;
      toast({ title: "رسالة لاسلكي مستنية", description: "المتصفح منع التشغيل التلقائي، دوس شغّل", tone: "warn", action: { label: "شغّل", onClick: () => radio.playBlocked() } });
    }
  }, [snap.blocked, toast]);
  if (loc.pathname.endsWith("/radio")) return null;
  const n = Object.entries(unread).reduce((a, [ch, k]) => (isDm(ch) || isGrp(ch) ? a + k : a), 0);
  const air = snap.onAir.find((a) => a.who !== staff?.id);
  return (
    <Link to="/radio" aria-label="اللاسلكي" data-cc-radio-fab
      className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] end-4 z-40 grid size-14 place-items-center rounded-full bg-brass text-white shadow-sf md:bottom-6">
      <Mic className={air ? "size-6 animate-pulse" : "size-6"} />
      {n ? <span className="num absolute -top-1 -end-1 grid min-w-5 place-items-center rounded-full bg-danger px-1 text-[11.5px] font-bold text-white">{n}</span> : null}
    </Link>
  );
}
