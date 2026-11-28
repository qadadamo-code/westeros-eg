/**
 * 2.1 المخازن: the list of warehouses with edit and delete; opening one shows its data and what it holds now
 * (the products, the quantity with its unit, and when each last moved), with an Excel export.
 */
import { useArea } from "../useAccess";
import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Pencil, Plus, Trash2, Warehouse } from "lucide-react";
import { useSession } from "@/auth/session";
import { useDb, useLive } from "@/data/hooks";
import type { StorageLocation } from "@/data/types";
import { Button, Card, Dialog, EmptyState, Input, Select, Table, useToast, type Column } from "@/ui";
import { fmtAt, lineUnit, num, storeTypeOptions, storeTemp, storeType, storeTypeName, toLine } from "../lib";
import { ExportButton, ReadOnly } from "../ui";
import { useCc, type Cc } from "../useCc";

export default function Warehouses() {
  const cc = useCc();
  const { can } = useSession();
  const [edit, setEdit] = useState<StorageLocation | "new" | null>(null);
  const [show, setShow] = useState<StorageLocation | null>(null);
  const [del, setDel] = useState<StorageLocation | null>(null);
  const manage = can("inventory.manage");
  const area = useArea();
  const nextCode = Math.max(0, ...cc.locations.map((l) => l.code ?? 0)) + 1;
  const columns: Column<StorageLocation>[] = [
    { key: "code", header: "كود المخزن", cell: (l) => <span className="num text-muted">{l.code ?? "—"}</span> },
    { key: "name", header: "اسم المخزن", cell: (l) => <span className="font-semibold">{l.name.ar}</span> },
    { key: "branch", header: "الفرع", cell: (l) => cc.branchName(l.branchId) },
    { key: "type", header: "نوع المخزن", cell: (l) => (storeType(l.type) ? `${storeTypeName(l.type)}${storeType(l.type)!.temp != null ? ` ${storeTemp(l.type)}` : ""}` : <span className="text-warn">غير محدد</span>) },
    { key: "address", header: "عنوان المخزن", hideOnMobile: true, cell: (l) => l.address || "—" },
    { key: "map", header: "موقع المخزن", hideOnMobile: true, cell: (l) => (l.mapUrl ? <a className="inline-flex items-center gap-1 font-semibold text-primary" href={l.mapUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>لوكيشن <ExternalLink className="size-3.5" /></a> : "—") },
    { key: "keeper", header: "امين المخزن", hideOnMobile: true, cell: (l) => cc.memberById.get(l.keeperId ?? "")?.name ?? "—" },
    ...(manage && (area.edit || area.delete)
      ? [{ key: "act", header: "", align: "end" as const, cell: (l: StorageLocation) => (
          <span className="inline-flex gap-2" onClick={(e) => e.stopPropagation()}>
            {area.edit ? <Button size="sm" variant="outline" icon={<Pencil className="size-4" />} onClick={() => setEdit(l)}>تعديل</Button> : null}
            {area.delete ? <Button size="sm" variant="outline" className="text-danger" icon={<Trash2 className="size-4" />} onClick={() => setDel(l)}>حذف</Button> : null}
          </span>
        ) }]
      : []),
  ];
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-bold">قائمة المخازن الحالية</h2>
        {manage && area.add ? <Button icon={<Plus />} onClick={() => setEdit("new")}>انشاء مخزن</Button> : null}
      </div>
      <Card className="overflow-hidden">
        <Table columns={columns} rows={cc.viewWarehouses} rowKey={(l) => l.id} onRowClick={(l) => setShow(l)} empty={<EmptyState compact icon={<Warehouse />} title="لا توجد مخازن" />} />
      </Card>
      {edit ? <WarehouseDialog key={edit === "new" ? "new" : edit.id} row={edit === "new" ? null : edit} code={edit === "new" ? nextCode : (edit.code ?? nextCode)} cc={cc} onClose={() => setEdit(null)} /> : null}
      {show ? <WarehouseView key={show.id} row={cc.locations.find((l) => l.id === show.id) ?? show} cc={cc} onClose={() => setShow(null)} /> : null}
      {del ? <DeleteDialog row={del} cc={cc} onClose={() => setDel(null)} /> : null}
    </div>
  );
}

function WarehouseDialog({ row, code, cc, onClose }: { row: StorageLocation | null; code: number; cc: Cc; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const [d, setD] = useState({ name: row?.name.ar ?? "", address: row?.address ?? "", mapUrl: row?.mapUrl ?? "", type: storeType(row?.type)?.id ?? "", keeperId: row?.keeperId ?? "", branchId: row?.branchId ?? (cc.branchById.has(cc.branchId) ? cc.branchId : cc.branches[0]?.id ?? "") });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const fields = { name: { ar: d.name.trim(), en: row?.name.en && row.name.en !== row.name.ar ? row.name.en : d.name.trim() }, address: d.address.trim(), mapUrl: d.mapUrl.trim(), type: d.type, keeperId: d.keeperId || null, code, branchId: d.branchId };
      if (row) {
        await db.update("storageLocations", row.id, fields);
        // what the warehouse holds follows it to its branch
        if (row.branchId !== d.branchId) for (const l of cc.levels.filter((x) => x.locationId === row.id)) await db.update("stockLevels", l.id, { branchId: d.branchId });
      } else await db.insert("storageLocations", { ...fields, kind: "store", sort: code, active: true });
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
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!d.name.trim() || !d.type || !d.branchId} onClick={save}>حفظ</Button></div>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="اسم المخزن" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        <ReadOnly label="كود المخزن (ترقيم تلقائي)"><span className="num">{code}</span></ReadOnly>
        <Select label="الفرع الموجود فيه المخزن" value={d.branchId} onChange={(e) => setD({ ...d, branchId: e.target.value })} options={cc.branches.length ? cc.branches.map((b) => ({ value: b.id, label: b.name.ar })) : [{ value: "", label: "لا يوجد فرع" }]} />
        <Select label="نوع المخزن" value={d.type} onChange={(e) => setD({ ...d, type: e.target.value })} options={[...(d.type ? [] : [{ value: "", label: "اختر نوع المخزن" }]), ...storeTypeOptions()]} />
        <Input label="عنوان المخزن" value={d.address} onChange={(e) => setD({ ...d, address: e.target.value })} />
        <Input label="موقع المخزن (لينك لوكيشن)" dir="ltr" placeholder="https://maps.google.com/…" value={d.mapUrl} onChange={(e) => setD({ ...d, mapUrl: e.target.value })} />
        <Select label="امين المخزن" value={d.keeperId} onChange={(e) => setD({ ...d, keeperId: e.target.value })} options={[{ value: "", label: "اختر من المستخدمين" }, ...cc.members.map((m) => ({ value: m.id, label: m.name }))]} />
      </div>
    </Dialog>
  );
}

/** بيانات المخزن وجدول رصيده */
function WarehouseView({ row, cc, onClose }: { row: StorageLocation; cc: Cc; onClose: () => void }) {
  // the newest move of every item in this warehouse
  const moves = useLive("stockMoves", { where: { locationId: row.id }, orderBy: [{ field: "at", dir: "desc" }], limit: 2000 }).data;
  const last = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of moves) if (!m.has(x.itemId)) m.set(x.itemId, x.at);
    return m;
  }, [moves]);
  const rows = useMemo(
    () => cc.levels.filter((l) => l.locationId === row.id && l.qty !== 0).map((l) => ({ level: l, item: cc.itemById.get(l.itemId) })).filter((x) => x.item).sort((a, b) => a.item!.sku.localeCompare(b.item!.sku, "en", { numeric: true })),
    [cc.levels, cc.itemById, row.id],
  );
  const info: [string, React.ReactNode][] = [
    ["كود المخزن", <span className="num">{row.code ?? "—"}</span>],
    ["الفرع", cc.branchName(row.branchId)],
    ["نوع المخزن", storeTypeName(row.type)],
    ["درجة الحرارة", <span className="num" dir="ltr">{storeTemp(row.type)}</span>],
    ["امين المخزن", cc.memberById.get(row.keeperId ?? "")?.name ?? "—"],
    ["عنوان المخزن", row.address || "—"],
    ["موقع المخزن", row.mapUrl ? <a className="inline-flex items-center gap-1 font-semibold text-primary" href={row.mapUrl} target="_blank" rel="noreferrer">لوكيشن <ExternalLink className="size-3.5" /></a> : "—"],
  ];
  return (
    <Dialog open onClose={onClose} size="xl" title={row.name.ar} footer={<div className="flex justify-end"><Button onClick={onClose}>إغلاق</Button></div>}>
      <div className="grid gap-4">
        <div className="grid gap-x-6 gap-y-1.5 rounded-2xl border border-line bg-surface-2 p-4 text-[13.5px] sm:grid-cols-2">
          {info.map(([k, v]) => <p key={k} className="flex justify-between gap-3"><span className="text-muted">{k}</span><span className="font-semibold">{v}</span></p>)}
        </div>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[15px] font-bold">رصيد المخزن <span className="num text-muted">({rows.length})</span></h3>
          <ExportButton size="sm" file={`رصيد ${row.name.ar}`} head={["الكود", "المنتج", "الكمية", "وحدة الكمية", "تاريخ ووقت اخر حركة"]} rows={() => rows.map(({ level, item }) => [item!.sku, item!.name.ar, toLine(level.qty, item!), lineUnit(item!).label, last.get(level.itemId) ? fmtAt(last.get(level.itemId)!) : ""])} />
        </div>
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[560px] text-[14px]">
            <thead className="bg-surface-2 text-[12.5px] text-muted"><tr><th className="px-3 py-2 text-start font-semibold">الكود</th><th className="px-3 py-2 text-start font-semibold">المنتج</th><th className="px-3 py-2 text-end font-semibold">الكمية</th><th className="px-3 py-2 text-start font-semibold">وحدة الكمية</th><th className="px-3 py-2 text-start font-semibold">تاريخ ووقت اخر حركة</th></tr></thead>
            <tbody>
              {rows.map(({ level, item }) => (
                <tr key={level.id} className="border-t border-line">
                  <td className="num px-3 py-2 text-muted">{item!.sku}</td>
                  <td className="px-3 py-2 font-semibold">{item!.name.ar}</td>
                  <td className="num px-3 py-2 text-end" dir="ltr">{num(toLine(level.qty, item!))}</td>
                  <td className="px-3 py-2 text-muted">{lineUnit(item!).label}</td>
                  <td className="num px-3 py-2 text-[13px] whitespace-nowrap">{last.get(level.itemId) ? fmtAt(last.get(level.itemId)!) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length ? null : <p className="px-3 py-6 text-center text-[14px] text-muted">المخزن فاضي</p>}
        </div>
      </div>
    </Dialog>
  );
}

/**
 * حذف مخزن: a warehouse that holds stock stays. One that has movements leaves the list and its movements stay in
 * the records; one that was never used is removed. Both can be taken back from السجل والاسترجاع.
 */
function DeleteDialog({ row, cc, onClose }: { row: StorageLocation; cc: Cc; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [used, setUsed] = useState<boolean | null>(null);
  const stock = cc.levels.filter((l) => l.locationId === row.id && l.qty !== 0).length;
  useEffect(() => {
    let live = true;
    void (async () => {
      const moved = (await db.list("stockMoves", { where: { locationId: row.id }, limit: 1 })).length > 0;
      const asked = (await db.list("stockRequests")).some((r) => r.branchLocationId === row.id || r.toLocationId === row.id || r.lines.some((l) => l.locationId === row.id || l.toLocationId === row.id));
      const counted = (await db.list("stockCounts", { where: { locationId: row.id }, limit: 1 })).length > 0;
      if (live) setUsed(moved || asked || counted || cc.prod.settings?.productLocationId === row.id || cc.levels.some((l) => l.locationId === row.id));
    })().catch(() => live && setUsed(true));
    return () => { live = false; };
  }, [db, row.id, cc.levels, cc.prod.settings]);
  const remove = async () => {
    setBusy(true);
    try {
      if (used) await db.update("storageLocations", row.id, { active: false });
      else await db.remove("storageLocations", row.id).catch(() => db.update("storageLocations", row.id, { active: false }));
      toast({ tone: "success", title: `تم حذف ${row.name.ar}` });
      onClose();
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحذف", description: String((e as Error).message ?? e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={() => (busy ? undefined : onClose())} size="sm" title={stock ? `${row.name.ar} فيه رصيد` : `حذف ${row.name.ar}؟`}
      description={stock ? `المخزن فيه ${stock} صنف له رصيد. انقل الرصيد لمخزن تاني أو سجله اتلاف أولاً، وبعدها احذف المخزن.` : used ? "المخزن عليه حركات: هيتشال من قائمة المخازن وتفضل حركاته في السجل. تقدر ترجع عن الحذف من السجل والاسترجاع." : "المخزن هيتحذف. تقدر ترجع عن الحذف من السجل والاسترجاع."}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" disabled={busy} onClick={onClose}>{stock ? "تمام" : "إلغاء"}</Button>{stock ? null : <Button variant="danger" loading={busy} disabled={used === null} icon={<Trash2 />} onClick={remove}>حذف المخزن</Button>}</div>}>
      {null}
    </Dialog>
  );
}
