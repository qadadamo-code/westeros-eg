/**
 * الأدوار: the list of roles, and the role card: its name, its code range, and its permissions ticked from a list
 * grouped under headings, with a line under each permission that says what it allows.
 */
import { useState } from "react";
import { Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useDb, useLive } from "@/data/hooks";
import type { Membership, MfgUserType } from "@/data/types";
import { uuid } from "@/lib/id";
import { cn } from "@/lib/cn";
import { Badge, Button, Card, Dialog, EmptyState, IconButton, Input, Table, useToast, type Column } from "@/ui";
import { FINANCE_ON } from "../finance/flag";
import { overlapping, rangeOf, roleForScreens, userTypeOf, userTypesOf } from "../lib";
import { permGroups, permsOfRole, rolePatch, SCREEN_HELP } from "../perms";
import { ACTS, areas, type Act, type Area } from "../access";
import { SCREENS } from "../lib";
import { useCc, type Cc } from "../useCc";
import { useArea } from "../useAccess";

const BOX = "mt-0.5 size-4.5 shrink-0 cursor-pointer accent-[var(--color-brand,#F8BB18)]";

export default function Roles() {
  const cc = useCc();
  const db = useDb();
  const { toast } = useToast();
  const members = useLive("memberships").data;
  const types = userTypesOf(cc.lists);
  const [edit, setEdit] = useState<MfgUserType | "new" | null>(null);
  const [del, setDel] = useState<MfgUserType | null>(null);
  // what this employee may do on the tab (المستخدمين ← الأدوار)
  const area = useArea();
  const usersOf = (t: MfgUserType) => members.filter((m) => m.role !== "owner" && userTypeOf(m, cc.lists)?.id === t.id);
  const total = permGroups(FINANCE_ON).reduce((a, g) => a + g.items.length, 0) + areas().reduce((a, x) => a + x.acts.length, 0);
  const columns: Column<MfgUserType>[] = [
    { key: "name", header: "الدور", cell: (t) => <span className="font-semibold">{t.name}</span> },
    { key: "codes", header: "الأكواد", cell: (t) => <span className="num" dir="ltr">{rangeOf(t).from} – {rangeOf(t).to}</span> },
    { key: "users", header: "المستخدمين", align: "end", cell: (t) => <span className="num">{usersOf(t).length}</span> },
    { key: "perms", header: "الصلاحيات", cell: (t) => <Badge tone="info" size="sm"><span className="num">{permsOfRole(t).size}</span> من <span className="num">{total}</span></Badge> },
    {
      key: "act", header: "", align: "end", width: "96px", cell: (t) => (
        <span className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {area.edit ? <IconButton label="تعديل" onClick={() => setEdit(t)}><Pencil /></IconButton> : null}
          {area.delete ? <IconButton label="حذف" onClick={() => setDel(t)}><Trash2 /></IconButton> : null}
        </span>
      ),
    },
  ];
  const remove = async (t: MfgUserType) => {
    const s = cc.prod.settings;
    if (!s) return;
    try {
      await db.update("mfgSettings", s.id, { lists: { ...cc.lists, userTypes: types.filter((x) => x.id !== t.id) } });
      toast({ tone: "success", title: `تم حذف دور ${t.name}` });
      setDel(null);
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحذف", description: String((e as Error).message ?? e) });
    }
  };
  const delUsers = del ? usersOf(del) : [];
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-bold">قائمة الأدوار</h2>
        {area.add ? <Button icon={<Plus />} onClick={() => setEdit("new")}>دور جديد</Button> : null}
      </div>
      <Card className="overflow-hidden">
        <Table columns={columns} rows={types} rowKey={(t) => t.id} onRowClick={area.edit ? (t) => setEdit(t) : undefined} empty={<EmptyState compact icon={<ShieldCheck />} title="لا توجد أدوار" />} />
      </Card>
      <p className="text-[13px] text-muted">صاحب الحساب معاه كل الصلاحيات دايماً ومش بيتبع دور.</p>
      {edit ? <RoleDialog cc={cc} key={edit === "new" ? "new" : edit.id} role={edit === "new" ? null : edit} members={edit === "new" ? [] : usersOf(edit)} onClose={() => setEdit(null)} /> : null}
      {del ? (
        <Dialog open onClose={() => setDel(null)} size="sm" title={delUsers.length ? `لا يمكن حذف دور ${del.name}` : `حذف دور ${del.name}؟`}
          description={delUsers.length ? `الدور ده معاه ${delUsers.length} مستخدم (${delUsers.slice(0, 3).map((m) => m.name).join("، ")}${delUsers.length > 3 ? "…" : ""}). غيّر دورهم الأول من خانة المستخدمين.` : types.length <= 1 ? "لازم يفضل دور واحد على الأقل." : "تقدر ترجع عنه من السجل والاسترجاع."}
          footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setDel(null)}>{delUsers.length || types.length <= 1 ? "تمام" : "إلغاء"}</Button>{!delUsers.length && types.length > 1 ? <Button variant="danger" icon={<Trash2 />} onClick={() => void remove(del)}>حذف</Button> : null}</div>}>
          {null}
        </Dialog>
      ) : null}
    </div>
  );
}

function RoleDialog({ cc, role, members, onClose }: { cc: Cc; role: MfgUserType | null; members: Membership[]; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const types = userTypesOf(cc.lists);
  const codes = cc.prod.settings?.chefCodes ?? {};
  const nextFrom = Math.max(0, ...types.map((t) => rangeOf(t).to)) + 1;
  const [name, setName] = useState(role?.name ?? "");
  const [from, setFrom] = useState(String(role ? rangeOf(role).from : nextFrom));
  const [count, setCount] = useState(String(role?.count ?? 100));
  const [ids, setIds] = useState<Set<string>>(() => (role ? permsOfRole(role) : new Set(["acc:summary:view", "acc:mfg.make:view", "acc:mfg.make:add"])));
  const [busy, setBusy] = useState(false);
  const groups = permGroups(FINANCE_ON);
  const has = (id: string) => ids.has(id);
  const set = (list: string[], on: boolean) => setIds((s) => { const n = new Set(s); for (const id of list) (on ? n.add(id) : n.delete(id)); return n; });
  const viewsScreen = (screen: string) => areas().some((a) => a.screen === screen && has(`acc:${a.id}:view`));
  const financeOpen = viewsScreen("cc-finance");
  const usersOpen = viewsScreen("cc-users");
  // the range: whole numbers, no overlap with another role, and every user of the role stays inside it
  const f = Number(from), c = Number(count);
  const draft: MfgUserType = { ...(role ?? { id: "", role: "kitchen" as const }), name, from: f, count: c };
  const okNums = Number.isInteger(f) && Number.isInteger(c) && f >= 1 && c >= 1;
  const clash = okNums ? overlapping(draft, types) : null;
  const out = okNums ? members.find((m) => codes[m.id] && (codes[m.id] < f || codes[m.id] > f + c - 1)) : undefined;
  const twin = types.find((t) => t.id !== role?.id && t.name.trim() === name.trim());
  const problem = !name.trim() ? "اكتب اسم الدور" : twin ? "في دور تاني بنفس الاسم" : !okNums ? "اكتب بداية الكود وعدد المستخدمين أرقام صحيحة من 1 أو أكثر" : clash ? `الأكواد متداخلة مع "${clash.name}" (من ${rangeOf(clash).from} إلى ${rangeOf(clash).to})` : out ? `المستخدم "${out.name}" كوده ${codes[out.id]} وهيبقى برا المدى` : "";
  const save = async () => {
    const s = cc.prod.settings;
    if (!s || problem) return;
    setBusy(true);
    try {
      // الاسترجاع needs the users screen: without it the tick is dropped
      const picked = new Set(ids);
      if (!usersOpen) picked.delete("restore");
      const patch = rolePatch(picked);
      const level = roleForScreens(patch.screens ?? [], role?.role ?? "kitchen");
      const next: MfgUserType = { ...(role ?? { id: uuid() }), ...patch, name: name.trim(), from: f, count: c, role: level } as MfgUserType;
      const list = role ? types.map((t) => (t.id === role.id ? next : t)) : [...types, next];
      // keep each user on this role even after its level changes
      await db.update("mfgSettings", s.id, { lists: { ...cc.lists, userTypes: list, userTypeOf: { ...(cc.lists.userTypeOf ?? {}), ...Object.fromEntries(members.map((m) => [m.id, next.id])) } } });
      for (const m of members) if (m.role !== level) await db.update("memberships", m.id, { role: level });
      toast({ tone: "success", title: role ? "تم حفظ الدور" : "تم إضافة الدور" });
      onClose();
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحفظ", description: String((e as Error).message ?? e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} size="xl" title={role ? `تعديل دور ${role.name}` : "دور جديد"}
      footer={<div className="flex items-center justify-end gap-2">{problem ? <span className="me-auto text-[13px] text-danger">{problem}</span> : <span className="me-auto text-[13px] text-muted"><b className="num text-ink">{ids.size}</b> صلاحية متعلم عليها</span>}<Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!!problem} onClick={save}>حفظ</Button></div>}>
      <div className="grid gap-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_130px_130px]">
          <Input label="اسم الدور" placeholder="مثلاً: شيف، أمين مخزن، مدير فرع" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="بداية الكود" inputMode="numeric" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value.replace(/\D/g, ""))} />
          <Input label="عدد المستخدمين" inputMode="numeric" dir="ltr" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ""))} />
          {okNums ? <p className="text-[13px] text-muted sm:col-span-3">أكواد الموظفين في الدور ده من <b className="num text-ink">{f}</b> إلى <b className="num text-ink">{f + c - 1}</b></p> : null}
        </div>
        <AccessMatrix has={has} set={set} />
        {groups.map((g) => {
          const off = (g.id === "finance" && !financeOpen) || (g.id === "admin" && !usersOpen);
          const all = g.items.every((i) => has(i.id));
          return (
            <section key={g.id} className={cn("grid gap-2 rounded-2xl border border-line p-3", off && "opacity-60")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-[15px] font-bold">{g.title}</h3>
                  {off ? <p className="text-[12.5px] text-muted">{g.id === "finance" ? "علّم على مشاهدة خانة في الحسابات الأول" : "علّم على مشاهدة خانة في المستخدمين الأول"}</p> : g.note ? <p className="text-[12.5px] text-muted">{g.note}</p> : null}
                </div>
                {g.items.length > 1 ? <Button size="sm" variant="ghost" disabled={off} onClick={() => set(g.items.map((i) => i.id), !all)}>{all ? "إلغاء الكل" : "تحديد الكل"}</Button> : null}
              </div>
              <div className="grid gap-1.5 md:grid-cols-2">
                {g.items.map((i) => (
                  <label key={i.id} className={cn("flex gap-2.5 rounded-xl border border-line px-3 py-2.5", off ? "cursor-not-allowed" : "cursor-pointer hover:bg-surface-2", has(i.id) && !off && "border-primary/50 bg-primary-soft/30")}>
                    <input type="checkbox" className={BOX} disabled={off} checked={has(i.id)} onChange={(e) => set([i.id], e.target.checked)} />
                    <span className="min-w-0">
                      <span className="block text-[14.5px] font-semibold">{i.label}</span>
                      {i.help ? <span className="block text-[12.5px] leading-relaxed text-muted">{i.help}</span> : null}
                    </span>
                  </label>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </Dialog>
  );
}

const key = (a: Area, x: Act) => `acc:${a.id}:${x}`;

/**
 * صلاحيات الخانات: for every screen, its tabs in rows and مشاهدة / إضافة / تعديل / حذف / استيراد / تصدير in columns
 * (a dash where the tab has no such action). Ticking an action ticks مشاهدة; unticking مشاهدة clears the row.
 */
function AccessMatrix({ has, set }: { has: (id: string) => boolean; set: (list: string[], on: boolean) => void }) {
  const all = areas();
  const tick = (a: Area, x: Act, on: boolean) => {
    if (x === "view") return on ? set([key(a, "view")], true) : set(a.acts.map((y) => key(a, y)), false);
    set(on ? [key(a, x), key(a, "view")] : [key(a, x)], on);
  };
  return (
    <section className="grid gap-3 rounded-2xl border border-line p-3">
      <div>
        <h3 className="text-[15px] font-bold">صلاحيات الخانات</h3>
        <p className="text-[12.5px] text-muted">لكل خانة وكل تبويب: مشاهدة، إضافة، تعديل، حذف، استيراد، تصدير. الشاشة بتظهر للموظف لما يكون معاه مشاهدة خانة واحدة فيها على الأقل.</p>
      </div>
      {SCREENS.map((s) => {
        const rows = all.filter((a) => a.screen === s.id);
        const keys = rows.flatMap((a) => a.acts.map((x) => key(a, x)));
        const full = keys.every(has);
        const some = keys.some(has);
        return (
          <div key={s.id} className={cn("grid gap-1.5 rounded-xl border border-line p-2.5", some && "border-primary/40")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h4 className="text-[14.5px] font-bold">{s.label}</h4>
                {SCREEN_HELP[s.id] ? <p className="text-[12px] text-muted">{SCREEN_HELP[s.id]}</p> : null}
              </div>
              <Button size="sm" variant="ghost" onClick={() => set(keys, !full)}>{full ? "إلغاء الكل" : "تحديد الكل"}</Button>
            </div>
            <div className="overflow-x-auto thin-scrollbar">
              <table className="w-full min-w-[520px] text-[13.5px]">
                <thead><tr className="text-[12px] text-muted"><th className="px-2 py-1.5 text-start font-semibold">الخانة</th>{ACTS.map((x) => <th key={x.id} className="w-[72px] px-1 py-1.5 text-center font-semibold">{x.label}</th>)}</tr></thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id} className="border-t border-line/60">
                      <td className="px-2 py-1.5"><span className="font-semibold">{a.label}</span>{a.note ? <span className="block text-[11.5px] leading-snug text-muted">{a.note}</span> : null}</td>
                      {ACTS.map((x) => (
                        <td key={x.id} className="px-1 py-1.5 text-center">
                          {a.acts.includes(x.id) ? <input type="checkbox" aria-label={`${a.label}: ${x.label}`} className={cn(BOX, "mt-0")} checked={has(key(a, x.id))} onChange={(e) => tick(a, x.id, e.target.checked)} /> : <span className="text-muted">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </section>
  );
}
