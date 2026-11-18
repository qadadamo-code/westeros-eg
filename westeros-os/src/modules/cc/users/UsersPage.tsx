/** المستخدمين: who can sign in, the user types with their code ranges and permissions, and each user's code. */
import { useState } from "react";
import { Link } from "react-router-dom";
import { History, Plus, Trash2, Users } from "lucide-react";
import type { Role } from "@/auth/roles";
import { useDb, useLive } from "@/data/hooks";
import type { Membership, MfgUserType } from "@/data/types";
import { uuid } from "@/lib/id";
import { PageHeader } from "@/shell/PageHeader";
import { Badge, Button, Card, CardHeader, Dialog, IconButton, EmptyState, Input, Select, Switch, Table, useToast, type Column } from "@/ui";
import { cn } from "@/lib/cn";
import { FIN_PERMS, finPermsOf } from "../finance/perms";
import { canRestore, nextUserCode, overlapping, rangeOf, roleForScreens, SCREENS, screensOf, seesPrices, userTypeOf, userTypesOf } from "../lib";
import { useCc, type Cc } from "../useCc";

export default function UsersPage() {
  const members = useLive("memberships").data;
  const cc = useCc();
  const codes = cc.prod.settings?.chefCodes ?? {};
  const [edit, setEdit] = useState<Membership | "new" | null>(null);
  const columns: Column<Membership>[] = [
    { key: "name", header: "الاسم", cell: (m) => <span className="font-semibold">{m.name}</span> },
    { key: "role", header: "طبيعة المستخدم", cell: (m) => (m.role === "owner" ? "صاحب الحساب" : userTypeOf(m, cc.lists)?.name ?? "—") },
    { key: "code", header: "الكود", cell: (m) => <span className="num">{codes[m.id] || "—"}</span> },
    { key: "pin", header: "PIN", cell: (m) => (m.hasPin ? <Badge tone="ok" size="sm">له PIN</Badge> : <Badge tone="neutral" size="sm">بدون</Badge>) },
    { key: "active", header: "الحالة", cell: (m) => (m.active ? <Badge tone="ok" size="sm">شغال</Badge> : <Badge tone="neutral" size="sm">موقوف</Badge>) },
  ];
  return (
    <div className="grid gap-5">
      <PageHeader icon={<Users />} title="المستخدمين" actions={<div className="flex gap-2"><Link to="/settings/history" className="inline-flex h-11 items-center gap-2 rounded-xl border border-line px-4 text-[15px] font-semibold hover:bg-surface-2"><History className="size-4" />السجل والاسترجاع</Link><Button icon={<Plus />} onClick={() => setEdit("new")}>مستخدم جديد</Button></div>} />
      <Card className="overflow-hidden">
        <Table columns={columns} rows={members} rowKey={(m) => m.id} onRowClick={(m) => setEdit(m)} empty={<EmptyState compact icon={<Users />} title="لا يوجد مستخدمين" />} />
      </Card>
      <UserTypes cc={cc} members={members} />
      {edit ? <UserDialog cc={cc} key={edit === "new" ? "new" : edit.id} member={edit === "new" ? null : edit} onClose={() => setEdit(null)} /> : null}
    </div>
  );
}

function UserDialog({ cc, member, onClose }: { cc: Cc; member: Membership | null; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const owner = member?.role === "owner";
  const [name, setName] = useState(member?.name ?? "");
  const types = userTypesOf(cc.lists);
  const settings = cc.prod.settings;
  const [typeId, setTypeId] = useState(member ? userTypeOf(member, cc.lists)?.id ?? "" : types[0]?.id ?? "");
  const type = types.find((t) => t.id === typeId) ?? null;
  const role = type?.role ?? (member?.role as Role | undefined) ?? "kitchen";
  // كود المستخدم بناء على طبيعته
  const auto = type && settings ? nextUserCode(type, settings.chefCodes, member?.id) : 0;
  const [typed, setTyped] = useState<string | null>(null);
  const code = typed === null ? auto : Number(typed);
  const range = type ? rangeOf(type) : null;
  const twin = settings ? Object.entries(settings.chefCodes).find(([id, c]) => id !== member?.id && c === code && cc.prod.staff.some((m) => m.id === id)) : undefined;
  const codeProblem = !type ? "" : !auto && typed === null ? `أكواد "${type.name}" خلصت. زود عدد المستخدمين للنوع ده من تعريف أنواع المستخدمين.` : !Number.isInteger(code) || code < range!.from || code > range!.to ? `كود "${type.name}" لازم يكون من ${range!.from} إلى ${range!.to}` : twin ? `الكود ${code} مستخدم مع "${cc.prod.staff.find((m) => m.id === twin[0])?.name ?? "مستخدم آخر"}"` : "";
  const [pin, setPin] = useState("");
  const [active, setActive] = useState(member?.active ?? true);
  const [busy, setBusy] = useState(false);
  const pinOk = pin === "" ? !!member : /^\d{4,6}$/.test(pin);
  const save = async () => {
    setBusy(true);
    try {
      let id = member?.id;
      if (member) await db.update("memberships", member.id, { name: name.trim(), ...(owner ? {} : { role, active }), ...(pin ? { hasPin: true } : {}) });
      else id = (await db.insert("memberships", { userId: null, name: name.trim(), role, branchIds: [], phone: null, email: null, color: "#F8BB18", hasPin: true, active: true, lastSeenAt: null })).id;
      if (pin && id) await db.repo.auth.setPin(db.restaurantId, id, pin);
      if (id && type && settings) await db.update("mfgSettings", settings.id, { lists: { ...cc.lists, userTypes: types, userTypeOf: { ...(cc.lists.userTypeOf ?? {}), [id]: type.id } }, chefCodes: { ...settings.chefCodes, [id]: code } });
      toast({ tone: "success", title: "تم حفظ المستخدم" });
      onClose();
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحفظ", description: String((e as Error).message ?? e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} title={member ? "تعديل مستخدم" : "مستخدم جديد"}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!name.trim() || !pinOk || !!codeProblem} onClick={save}>حفظ</Button></div>}>
      <div className="grid gap-3">
        <Input label="الاسم" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
          <Select label="طبيعة المستخدم" value={typeId} onChange={(e) => { setTypeId(e.target.value); setTyped(null); }} options={[...(type ? [] : [{ value: "", label: "—" }]), ...types.map((t) => ({ value: t.id, label: t.name }))]} />
          <Input label="الكود" inputMode="numeric" dir="ltr" disabled={!type} value={typed ?? (auto ? String(auto) : "")} onChange={(e) => setTyped(e.target.value.replace(/\D/g, ""))} />
          {codeProblem ? <p className="text-[13px] text-danger sm:col-span-2">{codeProblem}</p> : <p className="text-[13px] text-muted sm:col-span-2">الكود ده هو اللي بيظهر بين القوسين في رقم التشغيلة.</p>}
        </div>
        <Input label={member ? "PIN جديد (اتركه فاضي لو مش هتغيره)" : "PIN للدخول (من 4 إلى 6 أرقام)"} inputMode="numeric" dir="ltr" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
        {member && !owner ? <Switch checked={active} onChange={setActive} label="المستخدم شغال" description="المستخدم الموقوف لا يقدر يدخل" /> : null}
      </div>
    </Dialog>
  );
}

/** تعريف أنواع المستخدمين: the name, the code range, and the checklist of screens the users of the type may open. */
function UserTypes({ cc, members }: { cc: Cc; members: Membership[] }) {
  const db = useDb();
  const { toast } = useToast();
  const [bump, setBump] = useState(0);
  const s = cc.prod.settings;
  if (!s) return null;
  const lists = cc.lists;
  const types = userTypesOf(lists);
  const save = (next: MfgUserType[]) => db.update("mfgSettings", s.id, { lists: { ...lists, userTypes: next } });
  const setType = (id: string, p: Partial<MfgUserType>) => save(types.map((t) => (t.id === id ? { ...t, ...p } : t)));
  const of = (t: MfgUserType) => members.filter((m) => m.role !== "owner" && userTypeOf(m, lists)?.id === t.id);
  // the code range of a type: refused when it crosses another type's range or leaves a user of the type outside it
  const setRange = (t: MfgUserType, from: number, count: number) => {
    const r = rangeOf(t);
    if (from === r.from && count === (t.count ?? 100)) return;
    const next: MfgUserType = { ...t, from: Math.round(from), count: Math.round(count) };
    const ok = from >= 1 && count >= 1;
    const clash = ok ? overlapping(next, types) : null;
    const out = ok ? of(t).find((m) => s.chefCodes[m.id] && (s.chefCodes[m.id] < next.from! || s.chefCodes[m.id] > next.from! + next.count! - 1)) : undefined;
    const problem = !ok ? "اكتب رقم صحيح من 1 أو أكثر" : clash ? `الأكواد دي متداخلة مع "${clash.name}" (من ${rangeOf(clash).from} إلى ${rangeOf(clash).to})` : out ? `المستخدم "${out.name}" كوده ${s.chefCodes[out.id]} وهيبقى برا المدى` : "";
    if (problem) {
      toast({ tone: "error", title: "المدى غير مقبول", description: problem });
      setBump((n) => n + 1); // put the typed numbers back
      return;
    }
    void setType(t.id, { from: next.from, count: next.count });
  };
  // ticking a screen: saved on the type, and the users of the type get the level that lets them save on the ticked screens
  const toggle = async (t: MfgUserType, screen: string, on: boolean) => {
    const users = of(t);
    const screens = SCREENS.map((x) => x.id).filter((id) => (id === screen ? on : screensOf(t).includes(id)));
    const role = roleForScreens(screens, t.role);
    try {
      // keep each user on this type even after its level changes
      await db.update("mfgSettings", s.id, { lists: { ...lists, userTypes: types.map((x) => (x.id === t.id ? { ...x, screens, role } : x)), userTypeOf: { ...(lists.userTypeOf ?? {}), ...Object.fromEntries(users.map((m) => [m.id, t.id])) } } });
      for (const m of users) if (m.role !== role) await db.update("memberships", m.id, { role });
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحفظ", description: String((e as Error).message ?? e) });
    }
  };
  return (
    <Card>
      <CardHeader title="تعريف أنواع المستخدمين" subtitle="لكل طبيعة مستخدم: مدى الأكواد (بداية الكود وعدد المستخدمين، بدون تداخل) والصلاحيات اللي معاه في السيستم"
        action={<Button size="sm" variant="outline" icon={<Plus />} onClick={() => save([...types, { id: uuid(), name: "نوع جديد", from: Math.max(0, ...types.map((t) => rangeOf(t).to)) + 1, count: 100, role: "kitchen", screens: ["cc-mfg"] }])}>نوع جديد</Button>} />
      <ul className="grid gap-3 px-5 pb-5 lg:grid-cols-2">
        {types.map((t) => {
          const inUse = of(t).length > 0;
          const r = rangeOf(t);
          const open = screensOf(t);
          return (
            <li key={`${t.id}:${r.from}:${r.to}:${bump}`} className="grid content-start gap-3 rounded-xl border border-line p-3">
              <div className="grid items-end gap-2 grid-cols-[minmax(0,1fr)_auto]">
                <Input label="طبيعة المستخدم" defaultValue={t.name} onBlur={(e) => e.target.value.trim() && e.target.value !== t.name && setType(t.id, { name: e.target.value.trim() })} />
                <IconButton label={inUse ? "مستخدم مع مستخدمين" : "حذف"} disabled={inUse || types.length <= 1} onClick={() => save(types.filter((x) => x.id !== t.id))}><Trash2 /></IconButton>
              </div>
              <div className="grid items-end gap-2 grid-cols-2 sm:grid-cols-[120px_120px_minmax(0,1fr)]">
                <Input label="بداية الكود" inputMode="numeric" dir="ltr" defaultValue={String(r.from)} onBlur={(e) => setRange(t, Number(e.target.value), t.count ?? 100)} />
                <Input label="عدد المستخدمين" inputMode="numeric" dir="ltr" defaultValue={String(t.count ?? 100)} onBlur={(e) => setRange(t, r.from, Number(e.target.value))} />
                <p className="col-span-2 text-[13.5px] text-muted sm:col-span-1 sm:pb-2.5">الأكواد من <b className="num text-ink">{r.from}</b> إلى <b className="num text-ink">{r.to}</b></p>
              </div>
              <div>
                <p className="mb-1.5 text-[13.5px] font-semibold">الصلاحيات</p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {SCREENS.map((x) => (
                    <label key={x.id} className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border border-line px-3 text-[14.5px] hover:bg-surface-2">
                      <input type="checkbox" className="size-4.5 accent-[var(--color-brand,#F8BB18)]" checked={open.includes(x.id)} onChange={(e) => void toggle(t, x.id, e.target.checked)} />
                      {x.label}
                    </label>
                  ))}
                </div>
                {open.includes("cc-finance") ? (
                  <div className="mt-2 rounded-lg border border-line p-2.5">
                    <p className="mb-1.5 text-[13px] font-semibold text-muted">صلاحيات الحسابات</p>
                    <div className="grid gap-1 sm:grid-cols-2">
                      {FIN_PERMS.map((x) => (
                        <label key={x.id} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-1.5 text-[13.5px] hover:bg-surface-2">
                          <input type="checkbox" className="size-4 accent-[var(--color-brand,#F8BB18)]" checked={finPermsOf(t).includes(x.id)}
                            onChange={(e) => void setType(t.id, { finance: FIN_PERMS.map((p) => p.id).filter((id) => (id === x.id ? e.target.checked : finPermsOf(t).includes(id))) })} />
                          {x.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}
                <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border border-line px-3 text-[14.5px] hover:bg-surface-2">
                  <input type="checkbox" className="size-4.5 accent-[var(--color-brand,#F8BB18)]" checked={seesPrices(t)} onChange={(e) => void setType(t.id, { seePrices: e.target.checked })} />
                  رؤية الأسعار والتكاليف
                </label>
                <label className={cn("mt-1.5 flex min-h-11 items-center gap-2.5 rounded-lg border border-line px-3 text-[14.5px]", t.role === "admin" ? "cursor-pointer hover:bg-surface-2" : "opacity-60")}>
                  <input type="checkbox" className="size-4.5 accent-[var(--color-brand,#F8BB18)]" disabled={t.role !== "admin"} checked={canRestore(t)} onChange={(e) => void setType(t.id, { restore: e.target.checked })} />
                  <span>الاسترجاع من السجل (التراجع عن إضافة أو تعديل أو حذف){t.role !== "admin" ? <span className="block text-[12.5px] text-muted">تحتاج صلاحية المستخدمين</span> : null}</span>
                </label>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
