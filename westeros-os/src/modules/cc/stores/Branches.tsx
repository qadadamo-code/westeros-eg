/** الفروع: the branches of the restaurant; every warehouse sits in one of them. */
import { useEffect, useState } from "react";
import { ExternalLink, Pencil, Plus, Store, Trash2 } from "lucide-react";
import { useSession } from "@/auth/session";
import { useDb } from "@/data/hooks";
import type { Branch } from "@/data/types";
import { Badge, Button, Card, Dialog, EmptyState, Input, Select, Table, useToast, type Column } from "@/ui";
import { ReadOnly } from "../ui";
import { useCc, type Cc } from "../useCc";

/** كود الفرع: the saved code, else the branch's place in the list (the first branch is 1) */
export const branchCode = (b: Branch, all: Branch[]) => b.code ?? all.indexOf(b) + 1;

export default function Branches() {
  const cc = useCc();
  const { role } = useSession();
  const [edit, setEdit] = useState<Branch | "new" | null>(null);
  const [del, setDel] = useState<Branch | null>(null);
  // the database lets only the account owner and the users-management level define branches
  const manage = role === "owner" || role === "admin";
  const nextCode = Math.max(0, ...cc.branches.map((b) => branchCode(b, cc.branches))) + 1;
  const columns: Column<Branch>[] = [
    { key: "code", header: "كود الفرع", cell: (b) => <span className="num text-muted">{branchCode(b, cc.branches)}</span> },
    { key: "name", header: "اسم الفرع", cell: (b) => <span className="font-semibold">{b.name.ar}{b.isCentral ? <Badge tone="info" size="sm" className="ms-2">مطبخ مركزي</Badge> : null}</span> },
    { key: "address", header: "عنوان الفرع", hideOnMobile: true, cell: (b) => b.address?.ar || "—" },
    { key: "map", header: "موقع الفرع", hideOnMobile: true, cell: (b) => (b.mapUrl ? <a className="inline-flex items-center gap-1 font-semibold text-primary" href={b.mapUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>لوكيشن <ExternalLink className="size-3.5" /></a> : "—") },
    { key: "manager", header: "مدير الفرع", cell: (b) => cc.memberById.get(b.managerId ?? "")?.name ?? "—" },
    { key: "stores", header: "المخازن", align: "end", cell: (b) => <span className="num">{cc.warehouses.filter((l) => l.branchId === b.id).length}</span> },
    ...(manage ? [{ key: "edit", header: "", align: "end" as const, cell: (b: Branch) => (
      <span className="inline-flex gap-2" onClick={(e) => e.stopPropagation()}>
        <Button size="sm" variant="outline" icon={<Pencil className="size-4" />} onClick={() => setEdit(b)}>تعديل</Button>
        <Button size="sm" variant="outline" className="text-danger" icon={<Trash2 className="size-4" />} onClick={() => setDel(b)}>حذف</Button>
      </span>
    ) }] : []),
  ];
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-bold">قائمة الفروع</h2>
        {manage ? <Button icon={<Plus />} onClick={() => setEdit("new")}>اضافة فرع</Button> : null}
      </div>
      <Card className="overflow-hidden">
        <Table columns={columns} rows={cc.branches} rowKey={(b) => b.id} onRowClick={manage ? (b) => setEdit(b) : undefined} empty={<EmptyState compact icon={<Store />} title="لا توجد فروع" />} />
      </Card>
      {edit ? <BranchDialog key={edit === "new" ? "new" : edit.id} row={edit === "new" ? null : edit} code={edit === "new" ? nextCode : branchCode(edit, cc.branches)} cc={cc} onClose={() => setEdit(null)} /> : null}
      {del ? <DeleteBranch key={del.id} row={del} cc={cc} onClose={() => setDel(null)} /> : null}
    </div>
  );
}

function BranchDialog({ row, code, cc, onClose }: { row: Branch | null; code: number; cc: Cc; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const [d, setD] = useState({ name: row?.name.ar ?? "", address: row?.address?.ar ?? "", mapUrl: row?.mapUrl ?? "", managerId: row?.managerId ?? "", isCentral: !!row?.isCentral });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const n = d.name.trim();
      const a = d.address.trim();
      const fields = {
        name: { ar: n, en: row?.name.en && row.name.en !== row.name.ar ? row.name.en : n },
        address: { ar: a, en: row?.address?.en && row.address.en !== row.address.ar ? row.address.en : a },
        mapUrl: d.mapUrl.trim(), managerId: d.managerId || null, code, isCentral: d.isCentral,
      };
      if (row) await db.update("branches", row.id, fields);
      else await db.insert("branches", { ...fields, slug: `branch-${code}-${Date.now().toString(36)}`, phone: null, isDefault: false, etaBranchCode: String(code), openingHours: null });
      toast({ tone: "success", title: "تم حفظ الفرع" });
      onClose();
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحفظ", description: String((e as Error).message ?? e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} size="lg" title={row ? "تعديل فرع" : "اضافة فرع"}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!d.name.trim()} onClick={save}>حفظ</Button></div>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="اسم الفرع" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        <ReadOnly label="كود الفرع (تلقائي)"><span className="num">{code}</span></ReadOnly>
        <Input label="عنوان الفرع" value={d.address} onChange={(e) => setD({ ...d, address: e.target.value })} />
        <Input label="موقع الفرع (لينك لوكيشن)" dir="ltr" placeholder="https://maps.google.com/…" value={d.mapUrl} onChange={(e) => setD({ ...d, mapUrl: e.target.value })} />
        <Select label="اسم مدير الفرع" value={d.managerId} onChange={(e) => setD({ ...d, managerId: e.target.value })} options={[{ value: "", label: "اختر من المستخدمين" }, ...cc.members.map((m) => ({ value: m.id, label: m.name }))]} />
        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border border-line px-3 text-[14.5px] hover:bg-surface-2 sm:col-span-2">
          <input type="checkbox" className="size-4.5 accent-[var(--color-brand,#F8BB18)]" checked={d.isCentral} onChange={(e) => setD({ ...d, isCentral: e.target.checked })} />
          <span>مطبخ مركزي<span className="block text-[12.5px] text-muted">التشغيلات المصنعة تتخزن في مخازن هذا الفرع</span></span>
        </label>
      </div>
    </Dialog>
  );
}

/** حذف فرع: only a branch nothing was recorded under. Anything that still points at it keeps it, with the reason. */
function DeleteBranch({ row, cc, onClose }: { row: Branch; cc: Cc; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  // undefined = still checking, null = free to delete
  const [why, setWhy] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    (async () => {
      const has = async (table: "storageLocations" | "stockMoves" | "mfgBatches" | "stockRequests" | "orders" | "shifts") => (await db.list(table, { where: { branchId: row.id }, limit: 1 } as never)).length > 0;
      if (row.isDefault || cc.branches.length < 2) return "ده الفرع اللي السيستم شغال عليه، ما ينفعش يتحذف. تقدر تعدل اسمه وبياناته.";
      if (row.id === cc.branchId) return "انت شغال على الفرع ده دلوقتي.";
      if (await has("storageLocations")) return "الفرع له مخازن. احذف مخازنه أو انقلها لفرع تاني أولاً.";
      if (await has("stockMoves")) return "الفرع عليه حركات مخزنية مسجلة.";
      if (await has("mfgBatches")) return "الفرع عليه تشغيلات تصنيع مسجلة.";
      if (await has("stockRequests")) return "الفرع عليه طلبات توريد.";
      if ((await has("orders")) || (await has("shifts"))) return "الفرع عليه طلبات بيع أو ورديات مسجلة.";
      if (cc.members.some((m) => m.branchIds?.includes(row.id))) return "في مستخدمين مربوطين بالفرع ده.";
      return null;
    })().then((r) => live && setWhy(r), () => live && setWhy("تعذر التأكد من بيانات الفرع، حاول تاني."));
    return () => { live = false; };
  }, [db, row, cc.branches.length, cc.branchId, cc.members]);
  const remove = async () => {
    setBusy(true);
    try {
      await db.remove("branches", row.id);
      toast({ tone: "success", title: `تم حذف ${row.name.ar}` });
      onClose();
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحذف", description: String((e as Error).message ?? e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={() => (busy ? undefined : onClose())} size="sm" title={why ? `${row.name.ar} لا يمكن حذفه` : `حذف ${row.name.ar}؟`}
      description={why === undefined ? "جاري التأكد إن الفرع مش مستخدم…" : why ?? "الفرع مش مستخدم في أي حاجة وهيتحذف. تقدر ترجع عن الحذف من السجل والاسترجاع."}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" disabled={busy} onClick={onClose}>{why ? "تمام" : "إلغاء"}</Button>{why === null ? <Button variant="danger" loading={busy} icon={<Trash2 />} onClick={remove}>حذف الفرع</Button> : null}</div>}>
      {null}
    </Dialog>
  );
}
