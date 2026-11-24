/**
 * المستخدمين: the employees of the company, with search, filters, a toggle that hides the stopped ones, ticking
 * several rows for one action, and the card of an employee (personal data, role and code, workplace, sign-in).
 */
import { useMemo, useRef, useState } from "react";
import { Building2, Camera, Pencil, Plus, Power, Search, ShieldCheck, Trash2, Users, X } from "lucide-react";
import { useSession } from "@/auth/session";
import { useDb, useLive } from "@/data/hooks";
import type { Membership, MfgUserType } from "@/data/types";
import type { ContractType, StaffProfile } from "@/data/hrTypes";
import { searchHit } from "@/lib/search";
import { loadRaw, saveRaw } from "@/lib/storage";
import { Badge, Button, Card, Dialog, EmptyState, Input, PIN_RULE, Select, Switch, Table, useToast, type Column } from "@/ui";
import { useSelection } from "../catalog/Bulk";
import { nextUserCode, rangeOf, userTypeOf, userTypesOf } from "../lib";
import { useCc, type Cc } from "../useCc";
import { useArea } from "../useAccess";
import { PersonPhoto } from "@/modules/hr/ui";
import { fileToDataUrl } from "@/modules/hr/image";
import { ExportButton } from "../ui";
import { ExcelImport } from "../catalog/Import";
import { CONTRACTS, exportUsers, importUsers, USER_FIELDS, USER_HEAD } from "./usersExcel";

const HIDE_KEY = "westeros-os.users.hideStopped";
const ALL = "*";
const today = () => new Date().toISOString().slice(0, 10);

/** مكان العمل: one branch, or every branch (an empty list) */
const workplace = (cc: Cc, m: Pick<Membership, "branchIds">) => (m.branchIds.length ? m.branchIds.map((b) => cc.branchName(b)).join("، ") : "كل الفروع");
const roleName = (cc: Cc, m: Membership) => (m.role === "owner" ? "صاحب الحساب" : userTypeOf(m, cc.lists)?.name ?? "—");

export default function UsersList() {
  const cc = useCc();
  const db = useDb();
  const { toast } = useToast();
  const { staff } = useSession();
  const members = useLive("memberships").data;
  const profiles = useLive("staffProfiles").data;
  const profileOf = useMemo(() => new Map(profiles.map((p) => [p.membershipId, p])), [profiles]);
  const codes = cc.prod.settings?.chefCodes ?? {};
  const types = userTypesOf(cc.lists);
  const [q, setQ] = useState("");
  const [role, setRole] = useState(ALL);
  const [branch, setBranch] = useState(ALL);
  const [hide, setHide] = useState(() => loadRaw(HIDE_KEY) !== "0");
  const [edit, setEdit] = useState<Membership | "new" | null>(null);
  const [bulk, setBulk] = useState<"role" | "branch" | "delete" | null>(null);
  // what this employee may do on the tab (المستخدمين ← الأدوار)
  const area = useArea();
  const excel = { members, profiles, settings: cc.prod.settings!, branches: cc.branches };
  const stopped = members.filter((m) => !m.active).length;
  const rows = useMemo(
    () =>
      members
        .filter((m) => !hide || m.active)
        .filter((m) => role === ALL || (role === "owner" ? m.role === "owner" : m.role !== "owner" && userTypeOf(m, cc.lists)?.id === role))
        .filter((m) => branch === ALL || m.branchIds.length === 0 || m.branchIds.includes(branch))
        .filter((m) => searchHit(q, m.name, m.phone, m.email, String(codes[m.id] ?? ""), profileOf.get(m.id)?.position.ar, profileOf.get(m.id)?.nationalId))
        .sort((a, b) => Number(b.role === "owner") - Number(a.role === "owner") || (codes[a.id] ?? 1e9) - (codes[b.id] ?? 1e9) || a.name.localeCompare(b.name, "ar")),
    [members, hide, role, branch, q, cc.lists, codes, profileOf],
  );
  const sel = useSelection(rows, (m) => m.id);
  const columns: Column<Membership>[] = [
    sel.column,
    { key: "name", header: "الاسم", cell: (m) => <span><span className="font-semibold">{m.name}</span>{profileOf.get(m.id)?.position.ar ? <span className="block text-[12.5px] text-muted">{profileOf.get(m.id)!.position.ar}</span> : null}</span> },
    { key: "code", header: "الكود", cell: (m) => <span className="num">{codes[m.id] || "—"}</span> },
    { key: "role", header: "الدور", cell: (m) => roleName(cc, m) },
    { key: "branch", header: "مكان العمل", hideOnMobile: true, cell: (m) => workplace(cc, m) },
    { key: "phone", header: "الموبايل", hideOnMobile: true, cell: (m) => <span className="num" dir="ltr">{m.phone || "—"}</span> },
    { key: "pin", header: "PIN", hideOnMobile: true, cell: (m) => (m.hasPin ? <Badge tone="ok" size="sm">له PIN</Badge> : <Badge tone="neutral" size="sm">بدون</Badge>) },
    { key: "active", header: "الحالة", cell: (m) => (m.active ? <Badge tone="ok" size="sm">نشط</Badge> : <Badge tone="neutral" size="sm">غير نشط</Badge>) },
  ];
  const picked = sel.rows;
  // the owner and the signed-in user are never stopped or deleted from the list
  const locked = (m: Membership) => m.role === "owner" || m.id === staff?.id;
  const setActive = async (on: boolean) => {
    const target = picked.filter((m) => !locked(m) && m.active !== on);
    try {
      for (const m of target) await db.update("memberships", m.id, { active: on });
      toast({ tone: "success", title: on ? `تم تنشيط ${target.length} مستخدم` : `تم إيقاف ${target.length} مستخدم` });
      sel.clear();
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحفظ", description: String((e as Error).message ?? e) });
    }
  };
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1"><Input icon={<Search />} placeholder="ابحث بالاسم أو الكود أو الموبايل" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="w-full sm:w-48"><Select aria-label="الدور" value={role} onChange={(e) => setRole(e.target.value)} options={[{ value: ALL, label: "كل الأدوار" }, { value: "owner", label: "صاحب الحساب" }, ...types.map((t) => ({ value: t.id, label: t.name }))]} /></div>
        <div className="w-full sm:w-48"><Select aria-label="مكان العمل" value={branch} onChange={(e) => setBranch(e.target.value)} options={[{ value: ALL, label: "كل الفروع" }, ...cc.branches.map((b) => ({ value: b.id, label: b.name.ar }))]} /></div>
        <Button variant={hide ? "soft" : "outline"} icon={<Power />} onClick={() => { const v = !hide; setHide(v); saveRaw(HIDE_KEY, v ? "1" : "0"); }}>
          {hide ? `إظهار غير النشطين${stopped ? ` (${stopped})` : ""}` : "إخفاء غير النشطين"}
        </Button>
        {cc.prod.settings ? <ExportButton file="المستخدمين" head={USER_HEAD} rows={() => exportUsers(excel, rows)} /> : null}
        {cc.prod.settings ? <ExcelImport noun="موظفين" fields={USER_FIELDS} run={(sheet, dry) => importUsers(db, excel, sheet, dry)} skipNote="من غير كود، كود برا مدى أكواد الأدوار، كود جديد من غير اسم، دور مختلف عن مدى الكود، أو فرع ونوع تعاقد مش معروفين." /> : null}
        {area.add ? <Button icon={<Plus />} onClick={() => setEdit("new")}>موظف جديد</Button> : null}
      </div>
      {picked.length ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-primary-soft/40 px-3 py-2">
          <span className="me-auto text-[14.5px] font-semibold">المحدد: <b className="num">{picked.length}</b> مستخدم</span>
          {picked.length === 1 && area.edit ? <Button size="sm" variant="outline" icon={<Pencil />} onClick={() => setEdit(picked[0])}>تعديل</Button> : null}
          {area.edit ? <>
            <Button size="sm" variant="outline" icon={<ShieldCheck />} onClick={() => setBulk("role")}>تغيير الدور</Button>
            <Button size="sm" variant="outline" icon={<Building2 />} onClick={() => setBulk("branch")}>تغيير مكان العمل</Button>
            <Button size="sm" variant="outline" icon={<Power />} onClick={() => void setActive(!picked.every((m) => m.active))}>{picked.every((m) => m.active) ? "إيقاف" : "تنشيط"}</Button>
          </> : null}
          {area.delete ? <Button size="sm" variant="danger" icon={<Trash2 />} onClick={() => setBulk("delete")}>حذف</Button> : null}
          <Button size="sm" variant="ghost" icon={<X />} onClick={sel.clear}>إلغاء التحديد</Button>
        </div>
      ) : null}
      <Card className="overflow-hidden">
        <Table columns={columns} rows={rows} rowKey={(m) => m.id} onRowClick={(m) => setEdit(m)} empty={<EmptyState compact icon={<Users />} title={members.length ? "لا يوجد مستخدمين بالبحث ده" : "لا يوجد مستخدمين"} />} />
      </Card>
      <p className="text-[13px] text-muted">{rows.length} من {members.length} مستخدم{hide && stopped ? ` · ${stopped} غير نشط مخفي` : ""}</p>
      {edit ? <UserDialog cc={cc} key={edit === "new" ? "new" : edit.id} readOnly={edit === "new" ? !area.add : !area.edit} member={edit === "new" ? null : edit} profile={edit === "new" ? null : profileOf.get(edit.id) ?? null} onClose={() => setEdit(null)} /> : null}
      {bulk === "role" ? <BulkRole cc={cc} members={picked.filter((m) => m.role !== "owner")} onClose={() => setBulk(null)} onDone={sel.clear} /> : null}
      {bulk === "branch" ? <BulkBranch cc={cc} members={picked.filter((m) => m.role !== "owner")} onClose={() => setBulk(null)} onDone={sel.clear} /> : null}
      {bulk === "delete" ? <BulkDelete cc={cc} members={picked} locked={locked} onClose={() => setBulk(null)} onDone={sel.clear} /> : null}
    </div>
  );
}

/** بطاقة الموظف */
function UserDialog({ cc, member, profile, readOnly, onClose }: { cc: Cc; member: Membership | null; profile: StaffProfile | null; readOnly?: boolean; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const { staff } = useSession();
  const owner = member?.role === "owner";
  const types = userTypesOf(cc.lists);
  const settings = cc.prod.settings;
  const [name, setName] = useState(member?.name ?? "");
  const [position, setPosition] = useState(profile?.position.ar ?? "");
  const [phone, setPhone] = useState(member?.phone ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [nationalId, setNationalId] = useState(profile?.nationalId ?? "");
  const [birthDate, setBirthDate] = useState(profile?.birthDate ?? "");
  const [address, setAddress] = useState(profile?.address ?? "");
  const [hireDate, setHireDate] = useState(profile?.hireDate ?? today());
  const [contract, setContract] = useState<ContractType>(profile?.contractType ?? "permanent");
  const [device, setDevice] = useState(profile?.deviceUserId ?? "");
  const [emName, setEmName] = useState(profile?.emergencyContact?.name ?? "");
  const [emPhone, setEmPhone] = useState(profile?.emergencyContact?.phone ?? "");
  const [notes, setNotes] = useState(profile?.notes ?? "");
  const [photo, setPhoto] = useState<string | null>(profile?.photoUrl ?? null);
  const photoInput = useRef<HTMLInputElement>(null);
  // a new employee saved once (then a PIN problem) is updated on the next try, never inserted twice
  const created = useRef<string | null>(null);
  const [branch, setBranch] = useState(member?.branchIds[0] ?? (member ? ALL : cc.branchId || ALL));
  const [typeId, setTypeId] = useState(member ? userTypeOf(member, cc.lists)?.id ?? "" : types[0]?.id ?? "");
  const type = types.find((t) => t.id === typeId) ?? null;
  const role = type?.role ?? (member?.role as MfgUserType["role"] | undefined) ?? "kitchen";
  // كود المستخدم بناء على دوره
  const auto = type && settings ? nextUserCode(type, settings.chefCodes, member?.id) : 0;
  const [typed, setTyped] = useState<string | null>(null);
  const code = typed === null ? auto : Number(typed);
  const range = type ? rangeOf(type) : null;
  const twin = settings ? Object.entries(settings.chefCodes).find(([id, c]) => id !== member?.id && c === code && cc.prod.staff.some((m) => m.id === id)) : undefined;
  const codeProblem = owner || !type ? "" : !auto && typed === null ? `أكواد "${type.name}" خلصت. زود عدد المستخدمين للدور ده من خانة الأدوار.` : !Number.isInteger(code) || code < range!.from || code > range!.to ? `كود "${type.name}" لازم يكون من ${range!.from} إلى ${range!.to}` : twin ? `الكود ${code} مستخدم مع "${cc.prod.staff.find((m) => m.id === twin[0])?.name ?? "مستخدم آخر"}"` : "";
  const [pin, setPin] = useState("");
  const [active, setActive] = useState(member?.active ?? true);
  const [busy, setBusy] = useState(false);
  // only top management sets PINs; an employee never changes their own (Mohammed 2026-11-24)
  const canPin = staff?.role === "owner" || staff?.role === "admin";
  const pinOk = pin === "" ? !!member || !canPin : PIN_RULE.test(pin);
  const valid = !!name.trim() && pinOk && !codeProblem && (owner || !!type) && !!hireDate;
  const save = async () => {
    setBusy(true);
    try {
      const branchIds = branch === ALL ? [] : [branch];
      const base = { name: name.trim(), phone: phone.trim() || null, email: email.trim() || null, branchIds };
      let id = member?.id ?? created.current ?? undefined;
      if (!member && id) await db.update("memberships", id, { ...base, role });
      else if (member) await db.update("memberships", member.id, { ...base, ...(owner ? {} : { role, active: member.id === staff?.id ? true : active }), ...(pin ? { hasPin: true } : {}) });
      else created.current = id = (await db.insert("memberships", { ...base, userId: null, role, color: "#F8BB18", hasPin: !!pin, active: true, lastSeenAt: null })).id;
      if (!id) throw new Error("لم يُحفظ المستخدم");
      if (pin) await db.repo.auth.setPin(db.restaurantId, id, pin);
      const card = {
        nationalId: nationalId.trim() || null, birthDate: birthDate || null, address: address.trim() || null, hireDate, contractType: contract,
        position: { ar: position.trim(), en: profile?.position.en ?? "" }, deviceUserId: device.trim() || null,
        emergencyContact: emName.trim() || emPhone.trim() ? { name: emName.trim(), phone: emPhone.trim(), relation: profile?.emergencyContact?.relation ?? "" } : null,
        notes: notes.trim(), photoUrl: photo,
      };
      if (profile) await db.update("staffProfiles", profile.id, card);
      else await db.insert("staffProfiles", { ...card, membershipId: id, nationality: "EG", contractEnd: null, station: null, foodHandler: false, documents: [], weeklyOff: [5], terminatedAt: null, terminationReason: null });
      if (!owner && type && settings) await db.update("mfgSettings", settings.id, { lists: { ...cc.lists, userTypes: types, userTypeOf: { ...(cc.lists.userTypeOf ?? {}), [id]: type.id } }, chefCodes: { ...settings.chefCodes, [id]: code } });
      toast({ tone: "success", title: "تم حفظ المستخدم" });
      onClose();
    } catch (e) {
      const msg = String((e as Error).message ?? e);
      toast({ tone: "error", title: "تعذر الحفظ", description: /device_user_id/.test(msg) ? "رقم البصمة مستخدم مع موظف آخر" : /pin_taken/.test(msg) ? "الـPIN ده مستخدم مع موظف تاني، اختار PIN غيره" : /6 digits|6 أرقام/.test(msg) ? "الـPIN لازم يكون 6 أرقام" : msg });
    } finally {
      setBusy(false);
    }
  };
  const h3 = "text-[14.5px] font-bold";
  return (
    <Dialog open onClose={onClose} size="xl" title={member ? `بيانات ${member.name}` : "موظف جديد"}
      footer={<div className="flex items-center justify-end gap-2">{!type && !owner ? <span className="me-auto text-[13px] text-danger">اختر دور الموظف</span> : null}<Button variant="ghost" onClick={onClose}>{readOnly ? "إغلاق" : "إلغاء"}</Button>{readOnly ? null : <Button loading={busy} disabled={!valid} onClick={save}>حفظ</Button>}</div>}>
      <fieldset disabled={readOnly} className="grid gap-5">
        <section className="grid gap-3">
          <h3 className={h3}>البيانات الأساسية</h3>
          <div className="flex items-center gap-4">
            <PersonPhoto m={{ name: name || "؟", color: member?.color ?? "#F8BB18" }} p={{ photoUrl: photo }} size="xl" />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" icon={<Camera />} onClick={() => photoInput.current?.click()}>{photo ? "غيّر الصورة" : "صورة الموظف"}</Button>
              {photo ? <Button size="sm" variant="ghost" onClick={() => setPhoto(null)}>شيل الصورة</Button> : null}
            </div>
            <input ref={photoInput} type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setPhoto(await fileToDataUrl(f, 320)); }} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="الاسم" value={name} onChange={(e) => setName(e.target.value)} />
            <Input label="المسمى الوظيفي" placeholder="مثلاً: شيف صوصات" value={position} onChange={(e) => setPosition(e.target.value)} />
            <Input label="رقم الموبايل" inputMode="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <Input label="الإيميل" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input label="الرقم القومي" inputMode="numeric" dir="ltr" maxLength={14} value={nationalId} onChange={(e) => setNationalId(e.target.value.replace(/\D/g, ""))} />
            <Input label="تاريخ الميلاد" type="date" dir="ltr" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
            <div className="sm:col-span-2"><Input label="العنوان" value={address} onChange={(e) => setAddress(e.target.value)} /></div>
          </div>
        </section>
        <section className="grid gap-3">
          <h3 className={h3}>العمل</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {owner ? (
              <Input label="الدور" value="صاحب الحساب (كل الصلاحيات)" disabled />
            ) : (
              <div className="grid gap-3 grid-cols-[minmax(0,1fr)_110px]">
                <Select label="الدور" value={typeId} onChange={(e) => { setTypeId(e.target.value); setTyped(null); }} options={[...(type ? [] : [{ value: "", label: "—" }]), ...types.map((t) => ({ value: t.id, label: t.name }))]} />
                <Input label="الكود" inputMode="numeric" dir="ltr" disabled={!type} value={typed ?? (auto ? String(auto) : "")} onChange={(e) => setTyped(e.target.value.replace(/\D/g, ""))} />
              </div>
            )}
            <Select label="مكان العمل (الفرع)" value={branch} onChange={(e) => setBranch(e.target.value)} options={[{ value: ALL, label: "كل الفروع" }, ...cc.branches.map((b) => ({ value: b.id, label: b.name.ar }))]} />
            {codeProblem ? <p className="text-[13px] text-danger sm:col-span-2">{codeProblem}</p> : !owner ? <p className="text-[13px] text-muted sm:col-span-2">الكود بيظهر بين القوسين في رقم التشغيلة. الفرع بيحدد فرع طلبات التوريد اللي الموظف يعملها.</p> : null}
            <Input label="تاريخ التعيين" type="date" dir="ltr" value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
            <Select label="نوع التعاقد" value={contract} onChange={(e) => setContract(e.target.value as ContractType)} options={CONTRACTS} />
            <Input label="رقم البصمة" hint="رقم الموظف على جهاز البصمة" inputMode="numeric" dir="ltr" value={device} onChange={(e) => setDevice(e.target.value.replace(/\s/g, ""))} />
          </div>
        </section>
        <section className="grid gap-3">
          <h3 className={h3}>للطوارئ</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="اسم شخص للتواصل" value={emName} onChange={(e) => setEmName(e.target.value)} />
            <Input label="موبايله" inputMode="tel" dir="ltr" value={emPhone} onChange={(e) => setEmPhone(e.target.value)} />
          </div>
        </section>
        <section className="grid gap-3">
          <h3 className={h3}>الدخول للسيستم</h3>
          {canPin ? (
            <Input label={member ? "PIN جديد من 6 أرقام (اتركه فاضي لو مش هتغيره)" : "PIN للدخول (6 أرقام)"} hint="ممنوع يتكرر: كل موظف ليه PIN مختلف" inputMode="numeric" dir="ltr" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
          ) : (
            <p className="text-[13px] text-muted">{member?.hasPin ? "الموظف ليه PIN. " : ""}تحديد وتغيير الـPIN للإدارة العليا بس.</p>
          )}
          {member && !owner && member.id !== staff?.id ? <Switch checked={active} onChange={setActive} label="الموظف نشط" description="الموظف غير النشط لا يقدر يدخل السيستم" /> : null}
        </section>
        <Input label="ملاحظات" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </fieldset>
    </Dialog>
  );
}

/** تغيير الدور لأكثر من موظف: each one takes the first free code of the new role */
function BulkRole({ cc, members, onClose, onDone }: { cc: Cc; members: Membership[]; onClose: () => void; onDone: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const types = userTypesOf(cc.lists);
  const [to, setTo] = useState(types[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const t = types.find((x) => x.id === to);
    const s = cc.prod.settings;
    if (!t || !s) return;
    setBusy(true);
    try {
      const codes = { ...s.chefCodes };
      for (const m of members) {
        const c = nextUserCode(t, codes, m.id);
        if (!c) throw new Error(`أكواد "${t.name}" خلصت. زود عدد المستخدمين للدور من خانة الأدوار.`);
        codes[m.id] = c;
      }
      await db.update("mfgSettings", s.id, { chefCodes: codes, lists: { ...cc.lists, userTypes: types, userTypeOf: { ...(cc.lists.userTypeOf ?? {}), ...Object.fromEntries(members.map((m) => [m.id, t.id])) } } });
      for (const m of members) if (m.role !== t.role) await db.update("memberships", m.id, { role: t.role });
      toast({ tone: "success", title: `تم تغيير دور ${members.length} مستخدم إلى ${t.name}` });
      onDone();
      onClose();
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحفظ", description: String((e as Error).message ?? e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} size="sm" title={`تغيير دور ${members.length} مستخدم`} description="كل موظف بياخد أول كود فاضي في الدور الجديد. صاحب الحساب مش بيتغير."
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!to || !members.length} onClick={save}>حفظ</Button></div>}>
      <Select label="الدور الجديد" value={to} onChange={(e) => setTo(e.target.value)} options={types.map((t) => ({ value: t.id, label: t.name }))} />
    </Dialog>
  );
}

function BulkBranch({ cc, members, onClose, onDone }: { cc: Cc; members: Membership[]; onClose: () => void; onDone: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const [to, setTo] = useState(cc.branches[0]?.id ?? ALL);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      for (const m of members) await db.update("memberships", m.id, { branchIds: to === ALL ? [] : [to] });
      toast({ tone: "success", title: `تم تغيير مكان عمل ${members.length} مستخدم` });
      onDone();
      onClose();
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحفظ", description: String((e as Error).message ?? e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} size="sm" title={`تغيير مكان عمل ${members.length} مستخدم`}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!members.length} onClick={save}>حفظ</Button></div>}>
      <Select label="مكان العمل (الفرع)" value={to} onChange={(e) => setTo(e.target.value)} options={[{ value: ALL, label: "كل الفروع" }, ...cc.branches.map((b) => ({ value: b.id, label: b.name.ar }))]} />
    </Dialog>
  );
}

/**
 * حذف: a member who made a batch, asked for a supply, moved stock, manages a branch or keeps a warehouse stays,
 * with the reason (stopping them keeps the history right). The owner and the signed-in user are never deleted.
 */
function BulkDelete({ cc, members, locked, onClose, onDone }: { cc: Cc; members: Membership[]; locked: (m: Membership) => boolean; onClose: () => void; onDone: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<{ name: string; why: string }[] | null>(null);
  const run = async () => {
    setBusy(true);
    const out: { name: string; why: string }[] = [];
    let deleted = 0;
    try {
      const gone: string[] = [];
      for (const m of members) {
        if (m.role === "owner") { out.push({ name: m.name, why: "صاحب الحساب" }); continue; }
        if (locked(m)) { out.push({ name: m.name, why: "ده المستخدم اللي داخل دلوقتي" }); continue; }
        const why =
          (await db.list("mfgBatches", { where: { chefId: m.id }, limit: 1 })).length ? "له تشغيلات تصنيع"
          : (await db.list("stockRequests", { where: { keeperId: m.id }, limit: 1 })).length ? "له طلبات توريد"
          : (await db.list("stockMoves", { where: { by: m.id }, limit: 1 })).length ? "له حركات مخزنية"
          : cc.branches.some((b) => b.managerId === m.id) ? "مدير فرع"
          : cc.locations.some((l) => l.keeperId === m.id) ? "أمين مخزن"
          : "";
        if (why) { out.push({ name: m.name, why: `${why}، تقدر توقفه بدل الحذف` }); continue; }
        await db.remove("memberships", m.id);
        gone.push(m.id);
        deleted++;
      }
      const s = cc.prod.settings;
      if (gone.length && s) {
        const codes = { ...s.chefCodes };
        const of = { ...(cc.lists.userTypeOf ?? {}) };
        for (const id of gone) { delete codes[id]; delete of[id]; }
        await db.update("mfgSettings", s.id, { chefCodes: codes, lists: { ...cc.lists, userTypeOf: of } });
      }
      if (deleted) toast({ tone: "success", title: `تم حذف ${deleted} مستخدم` });
      onDone();
      if (out.length) setRefused(out);
      else onClose();
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحذف", description: String((e as Error).message ?? e) });
    } finally {
      setBusy(false);
    }
  };
  if (refused)
    return (
      <Dialog open onClose={onClose} size="md" title={`${refused.length} مستخدم لم يتحذف`} description="دول لهم شغل مسجل في السيستم، فضلوا زي ما هم."
        footer={<div className="flex justify-end"><Button onClick={onClose}>تمام</Button></div>}>
        <ul className="thin-scrollbar max-h-72 overflow-y-auto rounded-xl border border-line text-[14px]">
          {refused.map((r, i) => (
            <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 border-b border-line px-3 py-2 last:border-b-0">
              <span className="font-semibold">{r.name}</span>
              <span className="text-[13px] text-muted">{r.why}</span>
            </li>
          ))}
        </ul>
      </Dialog>
    );
  return (
    <Dialog open onClose={() => (busy ? undefined : onClose())} size="sm" title={`حذف ${members.length} مستخدم؟`}
      description="اللي له تشغيلات أو طلبات أو حركات مسجلة مش هيتحذف، وهيظهر لك بالسبب. الحذف تقدر ترجع عنه من السجل والاسترجاع."
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" disabled={busy} onClick={onClose}>إلغاء</Button><Button variant="danger" loading={busy} icon={<Trash2 />} onClick={run}>حذف</Button></div>}>
      {null}
    </Dialog>
  );
}
