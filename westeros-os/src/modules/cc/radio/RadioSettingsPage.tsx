/**
 * اللاسلكي (الإعدادات), Saqr 2026-11-25: the walkie-talkie back, organised.
 *   الصلاحيات      each employee: allowed or not, and the employees they may talk to
 *   المجموعات      group chats and their members
 *   سجل المحادثات  every message with its time, sender and receiver (a person or a group)
 * Saved in mfg_settings.lists.radio (see access.ts).
 */
import { useMemo, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Check, History, Play, Plus, RadioTower, Square, Trash2, Users, UsersRound } from "lucide-react";
import { useDb, useLive } from "@/data/hooks";
import type { Membership, RadioSetup } from "@/data/types";
import type { RadioClip } from "@/modules/ops/types";
import { uuid } from "@/lib/id";
import { cn } from "@/lib/cn";
import { PageHeader } from "@/shell/PageHeader";
import { RouteTabs } from "@/modules/marketing/ui";
import { Avatar, Badge, Button, Card, Dialog, EmptyState, IconButton, Input, Select, Switch, useToast } from "@/ui";
import { transportFor } from "@/modules/ops/radio/transport";
import { dmPeer, isDm, isGrp } from "@/modules/ops/radio/channels";
import { AreaGate, useArea, useTabs } from "../useAccess";
import { listsOf } from "../lib";
import { Confirm } from "../finance/ui";
import { radioOf } from "./access";

export default function RadioSettingsPage() {
  const { tabs, first } = useTabs([
    { to: "/radio-settings", end: true, label: "الصلاحيات", icon: <Users />, area: "radio.settings" },
    { to: "/radio-settings/groups", label: "المجموعات", icon: <UsersRound />, area: "radio.settings" },
    { to: "/radio-settings/log", label: "سجل المحادثات", icon: <History />, area: "radio.log" },
  ]);
  return (
    <div className="grid gap-5">
      <PageHeader icon={<RadioTower />} title="اللاسلكي" subtitle="مين يستخدم اللاسلكي، ومع مين يتكلم، والمجموعات، وسجل المحادثات" />
      <RouteTabs label="اللاسلكي" items={tabs} />
      <Routes>
        <Route index element={<AreaGate id="radio.settings" fallback={first === "/radio-settings" ? null : first}><AccessTab /></AreaGate>} />
        <Route path="groups" element={<AreaGate id="radio.settings" fallback={first === "/radio-settings/groups" ? null : first}><GroupsTab /></AreaGate>} />
        <Route path="log" element={<AreaGate id="radio.log" fallback={first === "/radio-settings/log" ? null : first}><LogTab /></AreaGate>} />
        <Route path="*" element={<Navigate to="/radio-settings" replace />} />
      </Routes>
    </div>
  );
}

/** the employees and the saved setup, with a writer */
function useRadioSetup() {
  const db = useDb();
  const settings = useLive("mfgSettings").data[0];
  const lists = listsOf(settings);
  const setup = radioOf(lists);
  const members = useLive("memberships", { where: { active: true } }).data.filter((m) => m.role !== "platform_admin").sort((a, b) => a.name.localeCompare(b.name, "ar"));
  const save = (next: RadioSetup) => (settings ? db.update("mfgSettings", settings.id, { lists: { ...lists, radio: next } }) : Promise.resolve());
  return { setup, members, save, ready: !!settings };
}

function AccessTab() {
  const { setup, members, save, ready } = useRadioSetup();
  const edit = useArea().edit;
  const [peersOf, setPeersOf] = useState<Membership | null>(null);
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "";
  if (!ready) return <EmptyState icon={<RadioTower />} title="لا توجد ثوابت لهذا المطعم" />;
  const setRow = (id: string, p: Partial<RadioSetup["access"][string]>) => {
    const cur = setup.access[id] ?? { on: false, peers: [] };
    void save({ ...setup, access: { ...setup.access, [id]: { ...cur, ...p } } });
  };
  return (
    <div className="grid gap-3">
      {!edit ? <p className="rounded-xl border border-line px-3 py-2 text-[13.5px] text-muted">للمشاهدة بس: الدور بتاعك مالوش صلاحية تعديل اللاسلكي.</p> : null}
      <p className="text-[13.5px] text-muted">الموظف اللي مش مسموح له مش هيشوف زرار اللاسلكي خالص. صاحب المطعم مسموح له دايماً مع الكل. (مباشر) يعني زي الواكي توكي: الرسالة الصوتية بتشتغل لوحدها أول ما توصل، ويتكلم من زرار المايك على طول من غير ما يفتح صفحة اللاسلكي. من غيرها بيوصله إشعار ويفتح الرسالة.</p>
      <Card className="divide-y divide-line p-0">
        {members.map((m) => {
          const owner = m.role === "owner";
          const a = setup.access[m.id];
          const on = owner || !!a?.on;
          const peers = owner ? "all" : a?.peers ?? [];
          const peersText = peers === "all" ? "كل الموظفين المسموح لهم" : peers.length ? peers.map(nameOf).filter(Boolean).join("، ") : "مفيش حد لسه";
          return (
            <div key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3" data-radio-member={m.id}>
              <Avatar name={m.name} color={m.color} size="sm" />
              <div className="min-w-40 flex-1">
                <p className="text-[15px] font-semibold">{m.name}</p>
                {on ? <p className="truncate text-[12.5px] text-muted">يتكلم مع: {peersText}</p> : <p className="text-[12.5px] text-muted">مش مسموح له يستخدم اللاسلكي</p>}
              </div>
              {owner ? <Badge tone="ok">دايماً مسموح</Badge> : <Switch checked={on} disabled={!edit} onChange={(v) => setRow(m.id, { on: v })} label="مسموح" />}
              <Switch checked={on && (a?.live ?? owner)} disabled={!edit || !on} onChange={(v) => setRow(m.id, owner ? { on: true, peers: "all", live: v } : { live: v })} label="مباشر" />
              {owner ? null : <Button size="sm" variant="outline" disabled={!edit || !on} onClick={() => setPeersOf(m)}>مع مين</Button>}
            </div>
          );
        })}
      </Card>
      {peersOf ? (
        <PeersDialog member={peersOf} members={members} value={setup.access[peersOf.id]?.peers ?? []} enabled={(id) => members.find((x) => x.id === id)?.role === "owner" || !!setup.access[id]?.on}
          onClose={() => setPeersOf(null)} onSave={(peers) => (setRow(peersOf.id, { peers }), setPeersOf(null))} />
      ) : null}
    </div>
  );
}

function PeersDialog({ member, members, value, enabled, onClose, onSave }: { member: Membership; members: Membership[]; value: "all" | string[]; enabled: (id: string) => boolean; onClose: () => void; onSave: (v: "all" | string[]) => void }) {
  const [all, setAll] = useState(value === "all");
  const [ids, setIds] = useState<string[]>(value === "all" ? [] : value);
  const others = members.filter((m) => m.id !== member.id);
  const toggle = (id: string) => setIds((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  return (
    <Dialog open onClose={onClose} size="sm" title={`${member.name} يتكلم مع مين`}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button onClick={() => onSave(all ? "all" : ids)}>حفظ</Button></div>}>
      <div className="grid gap-3">
        <Switch checked={all} onChange={setAll} label="كل الموظفين المسموح لهم" />
        {!all ? (
          <div className="grid max-h-[50dvh] gap-1 overflow-y-auto">
            {others.map((m) => (
              <button key={m.id} type="button" onClick={() => toggle(m.id)} className={cn("flex items-center gap-3 rounded-xl border px-3 py-2 text-start", ids.includes(m.id) ? "border-brass bg-brass/10" : "border-line hover:bg-surface-2")}>
                <span className={cn("grid size-5 place-items-center rounded-md border", ids.includes(m.id) ? "border-brass bg-brass text-white" : "border-line-strong")}>{ids.includes(m.id) ? <Check className="size-3.5" /> : null}</span>
                <span className="flex-1 text-[14.5px] font-semibold">{m.name}</span>
                {!enabled(m.id) ? <span className="text-[12px] text-muted">مش مسموح له</span> : null}
              </button>
            ))}
          </div>
        ) : null}
        <p className="text-[12.5px] text-muted">الكلام بيوصل بس لو الطرفين مسموح لهم يستخدموا اللاسلكي.</p>
      </div>
    </Dialog>
  );
}

function GroupsTab() {
  const { setup, members, save, ready } = useRadioSetup();
  const edit = useArea().edit;
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [del, setDel] = useState<string | null>(null);
  if (!ready) return <EmptyState icon={<RadioTower />} title="لا توجد ثوابت لهذا المطعم" />;
  const setGroups = (groups: RadioSetup["groups"]) => save({ ...setup, groups });
  const add = () => {
    const n = name.trim();
    if (!n) return;
    if (setup.groups.some((g) => g.name === n)) return toast({ title: "في مجموعة بنفس الاسم", tone: "warn" });
    void setGroups([...setup.groups, { id: uuid(), name: n, memberIds: [] }]);
    setName("");
  };
  const toggle = (gid: string, mid: string) =>
    void setGroups(setup.groups.map((g) => (g.id === gid ? { ...g, memberIds: g.memberIds.includes(mid) ? g.memberIds.filter((x) => x !== mid) : [...g.memberIds, mid] } : g)));
  const allowed = (m: Membership) => m.role === "owner" || !!setup.access[m.id]?.on;
  return (
    <div className="grid gap-3">
      {edit ? (
        <Card className="flex flex-wrap items-end gap-2 p-4">
          <Input label="مجموعة جديدة" placeholder="مثلاً: المطبخ والصالة" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} wrapClassName="min-w-56 flex-1" />
          <Button icon={<Plus />} onClick={add} disabled={!name.trim()}>إضافة</Button>
        </Card>
      ) : null}
      {!setup.groups.length ? <EmptyState icon={<UsersRound />} title="مفيش مجموعات لسه" body="المجموعة بتخلي كذا موظف يسمعوا نفس الرسالة مرة واحدة." /> : null}
      {setup.groups.map((g) => (
        <Card key={g.id} className="grid gap-3 p-4" data-radio-group={g.id}>
          <div className="flex items-center gap-2">
            <UsersRound className="size-4 text-brass" />
            {edit ? (
              <Input aria-label="اسم المجموعة" defaultValue={g.name} wrapClassName="flex-1" onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== g.name) void setGroups(setup.groups.map((x) => (x.id === g.id ? { ...x, name: v } : x))); }} />
            ) : <p className="flex-1 text-[15px] font-bold">{g.name}</p>}
            <Badge>{g.memberIds.length} موظف</Badge>
            {edit ? <IconButton label="حذف المجموعة" onClick={() => setDel(g.id)}><Trash2 /></IconButton> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {members.map((m) => {
              const inG = g.memberIds.includes(m.id);
              return (
                <button key={m.id} type="button" disabled={!edit} onClick={() => toggle(g.id, m.id)} title={allowed(m) ? undefined : "مش مسموح له يستخدم اللاسلكي"}
                  className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13.5px] font-semibold", inG ? "border-brass bg-brass/15 text-brass-text" : "border-line text-muted hover:text-ink", !allowed(m) && "opacity-60")}>
                  {inG ? <Check className="size-3.5" /> : null}{m.name}
                </button>
              );
            })}
          </div>
          {g.memberIds.some((id) => { const m = members.find((x) => x.id === id); return m && !allowed(m); }) ? <p className="text-[12.5px] text-warn">في أعضاء مش مسموح لهم يستخدموا اللاسلكي: مش هيسمعوا المجموعة لحد ما تسمح لهم من تبويب الصلاحيات.</p> : null}
        </Card>
      ))}
      <Confirm open={!!del} onClose={() => setDel(null)} danger confirmLabel="حذف" title="حذف المجموعة؟" description="المجموعة هتختفي من اللاسلكي. رسايلها القديمة بتفضل في سجل المحادثات."
        onConfirm={() => { void setGroups(setup.groups.filter((g) => g.id !== del)); setDel(null); }} />
    </div>
  );
}

const today = () => new Date().toLocaleDateString("en-CA");
const clockOf = (iso: string) => new Date(iso).toLocaleString("ar-EG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function LogTab() {
  const db = useDb();
  const { setup, members } = useRadioSetup();
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [who, setWho] = useState("");
  const [playing, setPlaying] = useState<{ id: string; audio: HTMLAudioElement } | null>(null);
  const { toast } = useToast();
  const range = useMemo(() => ({ gte: new Date(`${from}T00:00:00`).toISOString(), lte: new Date(`${to}T23:59:59.999`).toISOString() }), [from, to]);
  const clips = useLive("radioClips", { gte: { at: range.gte }, lte: { at: range.lte }, orderBy: [{ field: "at", dir: "desc" }], limit: 1000 }).data;
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? "موظف محذوف";
  const groupOf = (ch: string) => setup.groups.find((g) => `grp:${g.id}` === ch);
  const toOf = (c: RadioClip): string => {
    if (isDm(c.channel)) return nameOf(dmPeer(c.channel, c.fromId) ?? "");
    if (isGrp(c.channel)) return `مجموعة ${groupOf(c.channel)?.name ?? "محذوفة"}`;
    return "قناة عامة";
  };
  const touches = (c: RadioClip) => !who || c.fromId === who || (isDm(c.channel) && dmPeer(c.channel, who) !== null) || (isGrp(c.channel) && !!groupOf(c.channel)?.memberIds.includes(who));
  const rows = clips.filter(touches);
  const stop = () => { playing?.audio.pause(); setPlaying(null); };
  const play = async (c: RadioClip) => {
    stop();
    const blob = await transportFor(db.repo, db.restaurantId).getAudio(c).catch(() => null);
    if (!blob) return toast({ title: "الصوت مش متاح", description: "الملف اتمسح أو مش موجود على الجهاز ده", tone: "warn" });
    const audio = new Audio(URL.createObjectURL(blob));
    audio.onended = () => setPlaying(null);
    setPlaying({ id: c.id, audio });
    void audio.play().catch(() => setPlaying(null));
  };
  return (
    <div className="grid gap-3">
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <Input label="من يوم" type="date" value={from} onChange={(e) => setFrom(e.target.value)} wrapClassName="w-44" />
        <Input label="لحد يوم" type="date" value={to} onChange={(e) => setTo(e.target.value)} wrapClassName="w-44" />
        <Select label="الموظف" value={who} onChange={(e) => setWho(e.target.value)} options={[{ value: "", label: "الكل" }, ...members.map((m) => ({ value: m.id, label: m.name }))]} className="w-56" />
        <Badge>{rows.length} رسالة</Badge>
      </Card>
      {!rows.length ? <EmptyState icon={<History />} title="مفيش محادثات في المدة دي" /> : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-[14px]">
            <thead className="bg-surface-2 text-[12.5px] text-muted">
              <tr><th className="px-3 py-2 text-start">الوقت</th><th className="px-3 py-2 text-start">من</th><th className="px-3 py-2 text-start">إلى</th><th className="px-3 py-2 text-start">الرسالة</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((c) => (
                <tr key={c.id} data-radio-log={c.id}>
                  <td className="num whitespace-nowrap px-3 py-2">{clockOf(c.at)}</td>
                  <td className="px-3 py-2 font-semibold">{c.fromName || nameOf(c.fromId)}</td>
                  <td className="px-3 py-2">{toOf(c)}</td>
                  <td className="px-3 py-2">{c.text ? c.text : <span className="num text-muted">🎙 رسالة صوتية {(c.durationMs / 1000).toFixed(1)} ث</span>}</td>
                  <td className="px-3 py-2 text-end">
                    {!c.text && c.storagePath ? (
                      <Button size="sm" variant={playing?.id === c.id ? "danger" : "secondary"} icon={playing?.id === c.id ? <Square className="size-4" /> : <Play className="size-4" />} onClick={() => (playing?.id === c.id ? stop() : void play(c))}>
                        {playing?.id === c.id ? "وقّف" : "اسمع"}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
