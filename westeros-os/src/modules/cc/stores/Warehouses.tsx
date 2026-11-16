/** 2.1 المخازن: the list of warehouses, create and edit. */
import { useState } from "react";
import { ExternalLink, Plus, Warehouse } from "lucide-react";
import { useSession } from "@/auth/session";
import { useDb } from "@/data/hooks";
import type { StorageLocation } from "@/data/types";
import { Button, Card, Dialog, EmptyState, Input, Select, Table, useToast, type Column } from "@/ui";
import { warehouseType } from "../lib";
import { ReadOnly } from "../ui";
import { useCc } from "../useCc";

export default function Warehouses() {
  const cc = useCc();
  const { can } = useSession();
  const [edit, setEdit] = useState<StorageLocation | "new" | null>(null);
  const manage = can("inventory.manage");
  const nextCode = Math.max(0, ...cc.locations.map((l) => l.code ?? 0)) + 1;
  const columns: Column<StorageLocation>[] = [
    { key: "code", header: "كود المخزن", cell: (l) => <span className="num text-muted">{l.code ?? "—"}</span> },
    { key: "name", header: "اسم المخزن", cell: (l) => <span className="font-semibold">{l.name.ar}</span> },
    { key: "type", header: "نوع المخزن", cell: (l) => warehouseType(l, cc.lists).name },
    { key: "address", header: "عنوان المخزن", hideOnMobile: true, cell: (l) => l.address || "—" },
    { key: "map", header: "موقع المخزن", hideOnMobile: true, cell: (l) => (l.mapUrl ? <a className="inline-flex items-center gap-1 font-semibold text-primary" href={l.mapUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>لوكيشن <ExternalLink className="size-3.5" /></a> : "—") },
    { key: "keeper", header: "امين المخزن", cell: (l) => cc.memberById.get(l.keeperId ?? "")?.name ?? "—" },
  ];
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-bold">قائمة المخازن الحالية</h2>
        {manage ? <Button icon={<Plus />} onClick={() => setEdit("new")}>انشاء مخزن</Button> : null}
      </div>
      <Card className="overflow-hidden">
        <Table columns={columns} rows={cc.warehouses} rowKey={(l) => l.id} onRowClick={manage ? (l) => setEdit(l) : undefined} empty={<EmptyState compact icon={<Warehouse />} title="لا توجد مخازن" />} />
      </Card>
      {edit ? <WarehouseDialog key={edit === "new" ? "new" : edit.id} row={edit === "new" ? null : edit} code={edit === "new" ? nextCode : (edit.code ?? nextCode)} cc={cc} onClose={() => setEdit(null)} /> : null}
    </div>
  );
}

function WarehouseDialog({ row, code, cc, onClose }: { row: StorageLocation | null; code: number; cc: ReturnType<typeof useCc>; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const [d, setD] = useState({ name: row?.name.ar ?? "", address: row?.address ?? "", mapUrl: row?.mapUrl ?? "", type: row?.type ?? cc.lists.warehouseTypes[0]?.id ?? "raw", keeperId: row?.keeperId ?? "" });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const fields = { name: { ar: d.name.trim(), en: row?.name.en && row.name.en !== row.name.ar ? row.name.en : d.name.trim() }, address: d.address.trim(), mapUrl: d.mapUrl.trim(), type: d.type, keeperId: d.keeperId || null, code };
      if (row) await db.update("storageLocations", row.id, fields);
      else await db.insert("storageLocations", { ...fields, branchId: cc.branchId, kind: "store", sort: code, active: true });
      toast({ tone: "success", title: "تم حفظ المخزن" });
      onClose();
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحفظ", description: String((e as Error).message ?? e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} size="lg" title={row ? "تعديل مخزن" : "انشاء مخزن"}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!d.name.trim()} onClick={save}>حفظ</Button></div>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="اسم المخزن" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        <ReadOnly label="كود المخزن (ترقيم تلقائي)"><span className="num">{code}</span></ReadOnly>
        <Input label="عنوان المخزن" value={d.address} onChange={(e) => setD({ ...d, address: e.target.value })} />
        <Input label="موقع المخزن (لينك لوكيشن)" dir="ltr" placeholder="https://maps.google.com/…" value={d.mapUrl} onChange={(e) => setD({ ...d, mapUrl: e.target.value })} />
        <Select label="نوع المخزن" value={d.type} onChange={(e) => setD({ ...d, type: e.target.value })} options={cc.lists.warehouseTypes.map((t) => ({ value: t.id, label: t.name }))} />
        <Select label="امين المخزن" value={d.keeperId} onChange={(e) => setD({ ...d, keeperId: e.target.value })} options={[{ value: "", label: "اختر من المستخدمين" }, ...cc.members.map((m) => ({ value: m.id, label: m.name }))]} />
      </div>
    </Dialog>
  );
}
