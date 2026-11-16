/** المستخدمين: who can sign in, with which role and PIN. */
import { useState } from "react";
import { Link } from "react-router-dom";
import { History, Plus, Users } from "lucide-react";
import type { Role } from "@/auth/roles";
import { useDb, useLive } from "@/data/hooks";
import type { Membership } from "@/data/types";
import { PageHeader } from "@/shell/PageHeader";
import { Badge, Button, Card, Dialog, EmptyState, Input, Select, Switch, Table, useToast, type Column } from "@/ui";

const ROLES: { value: Role; label: string }[] = [
  { value: "admin", label: "إدارة" },
  { value: "manager", label: "مدير / امين مخزن" },
  { value: "chef", label: "شيف" },
  { value: "kitchen", label: "مساعد مطبخ" },
];
const roleLabel = (r: Role) => ROLES.find((x) => x.value === r)?.label ?? (r === "owner" ? "صاحب الحساب" : r);

export default function UsersPage() {
  const members = useLive("memberships").data;
  const [edit, setEdit] = useState<Membership | "new" | null>(null);
  const columns: Column<Membership>[] = [
    { key: "name", header: "الاسم", cell: (m) => <span className="font-semibold">{m.name}</span> },
    { key: "role", header: "الصلاحية", cell: (m) => roleLabel(m.role) },
    { key: "pin", header: "PIN", cell: (m) => (m.hasPin ? <Badge tone="ok" size="sm">له PIN</Badge> : <Badge tone="neutral" size="sm">بدون</Badge>) },
    { key: "active", header: "الحالة", cell: (m) => (m.active ? <Badge tone="ok" size="sm">شغال</Badge> : <Badge tone="neutral" size="sm">موقوف</Badge>) },
  ];
  return (
    <div className="grid gap-5">
      <PageHeader icon={<Users />} title="المستخدمين" actions={<div className="flex gap-2"><Link to="/settings/history" className="inline-flex h-11 items-center gap-2 rounded-xl border border-line px-4 text-[15px] font-semibold hover:bg-surface-2"><History className="size-4" />السجل والاسترجاع</Link><Button icon={<Plus />} onClick={() => setEdit("new")}>مستخدم جديد</Button></div>} />
      <Card className="overflow-hidden">
        <Table columns={columns} rows={members} rowKey={(m) => m.id} onRowClick={(m) => setEdit(m)} empty={<EmptyState compact icon={<Users />} title="لا يوجد مستخدمين" />} />
      </Card>
      {edit ? <UserDialog key={edit === "new" ? "new" : edit.id} member={edit === "new" ? null : edit} onClose={() => setEdit(null)} /> : null}
    </div>
  );
}

function UserDialog({ member, onClose }: { member: Membership | null; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const owner = member?.role === "owner";
  const [name, setName] = useState(member?.name ?? "");
  const [role, setRole] = useState<Role>(member?.role ?? "chef");
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
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!name.trim() || !pinOk} onClick={save}>حفظ</Button></div>}>
      <div className="grid gap-3">
        <Input label="الاسم" value={name} onChange={(e) => setName(e.target.value)} />
        {owner ? null : <Select label="الصلاحية" value={role} onChange={(e) => setRole(e.target.value as Role)} options={ROLES} />}
        <Input label={member ? "PIN جديد (اتركه فاضي لو مش هتغيره)" : "PIN للدخول (من 4 إلى 6 أرقام)"} inputMode="numeric" dir="ltr" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
        {member && !owner ? <Switch checked={active} onChange={setActive} label="المستخدم شغال" description="المستخدم الموقوف لا يقدر يدخل" /> : null}
      </div>
    </Dialog>
  );
}
