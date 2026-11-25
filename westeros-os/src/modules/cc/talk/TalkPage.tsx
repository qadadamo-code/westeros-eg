/** /radio (Cost Control version): hold to talk to one person or a group, only those management allowed (اللاسلكي settings). */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Lock, MessageSquareText, Play, RadioTower, Send, Square, UsersRound, Volume2, VolumeX } from "lucide-react";
import { useSession } from "@/auth/session";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/shell/PageHeader";
import { Avatar, Badge, Button, Card, EmptyState, Input } from "@/ui";
import type { RadioChannelId, RadioClip } from "@/modules/ops/types";
import { dmId, grpId } from "@/modules/ops/radio/channels";
import { radio, useRadioEngine } from "@/modules/ops/radio/engine";
import { PttButton, usePttNotices } from "@/modules/ops/radio/PttButton";
import { useRecentClips, useUnread } from "@/modules/ops/radio/useClips";
import { recorderSupported } from "@/modules/ops/radio/recorder";
import { useMyRadio } from "./useRadio";
import { askNotifications, rememberChannel } from "./runtime";
import { Bell } from "lucide-react";

export default function TalkPage() {
  const { staff } = useSession();
  const my = useMyRadio();
  const snap = useRadioEngine();
  usePttNotices();
  const me = staff?.id ?? "";
  const targets = useMemo(
    () => [
      ...my.groups.map((g) => ({ id: grpId(g.id) as RadioChannelId, name: g.name, group: true, color: "" })),
      ...my.people.map((m) => ({ id: dmId(me, m.id) as RadioChannelId, name: m.name, group: false, color: m.color })),
    ],
    [my.groups, my.people, me],
  );
  const [params, setParams] = useSearchParams();
  const asked = params.get("ch");
  const [channel, setChannel] = useState<RadioChannelId | null>(null);
  const current = targets.find((t) => t.id === (channel ?? asked)) ?? targets[0] ?? null;
  const clips = useRecentClips(my.on);
  const unread = useUnread();
  const [text, setText] = useState("");

  useEffect(() => {
    if (!current) return;
    radio.markRead(current.id);
    rememberChannel(current.id);
    if (params.get("ch") !== current.id) setParams({ ch: current.id }, { replace: true });
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = useMemo(() => (current ? clips.data.filter((c) => c.channel === current.id).slice(0, 60) : []), [clips.data, current]);
  useEffect(() => {
    if (current && list[0]) radio.markRead(current.id);
  }, [list[0]?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!my.on) return <Card><EmptyState icon={<Lock />} title="اللاسلكي مش متاح لك" body="الإدارة بتحدد مين يستخدم اللاسلكي من الإعدادات ← اللاسلكي." /></Card>;

  const send = async () => {
    if (!current || !text.trim()) return;
    await radio.sendText(current.id, text);
    setText("");
  };

  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <PageHeader icon={<RadioTower />} title="اللاسلكي" subtitle="اختار الشخص أو المجموعة، واضغط مطوّل على الزرار واتكلم"
        actions={<div className="flex flex-wrap gap-2">{typeof Notification !== "undefined" && Notification.permission !== "granted" ? <Button size="sm" variant="outline" icon={<Bell className="size-4" />} onClick={askNotifications}>فعّل الإشعارات</Button> : null}{snap.unlocked ? <Badge tone="ok" icon={<Volume2 className="size-3.5" />}>الصوت شغّال</Badge> : <Button size="sm" variant="soft" icon={<VolumeX className="size-4" />} onClick={() => radio.unlock()}>فعّل الصوت</Button>}</div>} />

      {snap.blocked ? (
        <Card className="flex items-center gap-3 border-warn/40 bg-warn-soft p-3">
          <Volume2 className="size-5 text-warn" />
          <p className="flex-1 text-[14px] font-semibold">{snap.blocked} رسالة مستنية، المتصفح منع التشغيل التلقائي</p>
          <Button size="sm" onClick={() => radio.playBlocked()} icon={<Play className="size-4" />}>شغّل</Button>
        </Card>
      ) : null}

      {!targets.length ? <Card><EmptyState icon={<UsersRound />} title="مفيش حد تكلمه لسه" body="الإدارة بتحدد إنت تتكلم مع مين ومجموعاتك من الإعدادات ← اللاسلكي." /></Card> : (
        <>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar" role="tablist" aria-label="مع مين">
            {targets.map((t) => {
              const n = unread[t.id] ?? 0;
              const air = snap.onAir.some((a) => a.channel === t.id && a.who !== me);
              return (
                <button key={t.id} type="button" role="tab" aria-selected={current?.id === t.id} onClick={() => setChannel(t.id)} data-talk={t.id}
                  className={cn("relative flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-[14.5px] font-semibold transition-colors", current?.id === t.id ? "border-transparent bg-ink text-bg" : "border-line bg-surface hover:border-line-strong")}>
                  {t.group ? <UsersRound className={cn("size-4", air && "animate-pulse text-danger")} /> : <span className={cn("size-2.5 rounded-full", air && "animate-pulse")} style={{ background: air ? "var(--sf-danger)" : t.color || "#5b6a64" }} />}
                  {t.name}
                  {n ? <span className="num grid min-w-5 place-items-center rounded-full bg-danger px-1 text-[11.5px] font-bold text-white">{n}</span> : null}
                </button>
              );
            })}
          </div>

          {current ? (
            <Card className="grid place-items-center gap-4 p-6">
              <p className="flex items-center gap-2 text-[15px] font-bold">{current.group ? <UsersRound className="size-4 text-brass" /> : null}{current.group ? `مجموعة ${current.name}` : current.name}</p>
              {recorderSupported() ? <PttButton channel={current.id} /> : <EmptyState compact icon={<RadioTower />} title="الجهاز ده مش بيدعم التسجيل" body="تقدر تبعت رسالة مكتوبة وتسمع." />}
              <div className="flex w-full max-w-md gap-2">
                <Input aria-label="رسالة مكتوبة" placeholder="أو اكتب رسالة قصيرة" value={text} maxLength={280} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void send()} wrapClassName="flex-1" />
                <Button icon={<Send className="size-4" />} disabled={!text.trim()} onClick={() => void send()}>ابعت</Button>
              </div>
            </Card>
          ) : null}

          <section className="grid gap-2" aria-label="آخر الرسايل">
            <h2 className="px-1 text-[15px] font-bold">آخر الرسايل</h2>
            {!list.length ? <EmptyState compact icon={<MessageSquareText />} title="لسه مفيش رسايل هنا" /> : null}
            {list.map((c) => <Row key={c.id} clip={c} mine={c.fromId === me} playing={snap.playing === c.id} />)}
          </section>
        </>
      )}
    </div>
  );
}

function Row({ clip, mine, playing }: { clip: RadioClip; mine: boolean; playing: boolean }) {
  return (
    <div className={cn("flex items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-2.5", mine && "bg-primary-soft/40")}>
      <Avatar name={clip.fromName} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold">{mine ? "أنت" : clip.fromName}<span className="num ms-2 text-[12px] font-normal text-muted">{new Date(clip.at).toLocaleTimeString("ar-EG", { hour: "numeric", minute: "2-digit" })}</span></p>
        {clip.text ? <p className="text-[14px] text-ink-2">{clip.text}</p> : <p className="num text-[12.5px] text-muted">🎙 {(clip.durationMs / 1000).toFixed(1)} ث</p>}
      </div>
      {!clip.text ? (
        <Button size="sm" variant={playing ? "danger" : "secondary"} icon={playing ? <Square className="size-4" /> : <Play className="size-4" />} onClick={() => (playing ? radio.stopPlayback() : radio.playNow(clip))}>{playing ? "وقّف" : "شغّل"}</Button>
      ) : null}
    </div>
  );
}
