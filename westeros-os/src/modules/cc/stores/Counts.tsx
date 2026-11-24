/** 2.3 جرد المخزن: previous counts, a new count, and its result (surplus / deficit) once saved. */
import { useArea } from "../useAccess";
import { useMemo, useState } from "react";
import { ClipboardCheck, Plus } from "lucide-react";
import { useSession } from "@/auth/session";
import { useDb, useLive } from "@/data/hooks";
import type { CountLine, StockCount } from "@/data/types";
import { nowIso } from "@/lib/time";
import { approveCount } from "@/modules/inventory/stock";
import { Badge, Button, Card, Dialog, EmptyState, Select, Table, useToast, type Column } from "@/ui";
import { fmtAt, num, toBaseQty, toLine } from "../lib";
import { ReadOnly, StockLines, type QtyLine } from "../ui";
import { useCc, type Cc } from "../useCc";

const diff = (l: CountLine) => Math.round(((l.counted ?? l.expected) - l.expected) * 1000) / 1000;

export default function Counts() {
  const cc = useCc();
  const { can } = useSession();
  const area = useArea();
  const counts = useLive("stockCounts", { orderBy: [{ field: "startedAt", dir: "desc" }] }).data;
  const [add, setAdd] = useState(false);
  const [show, setShow] = useState<StockCount | null>(null);
  const columns: Column<StockCount>[] = [
    { key: "at", header: "التاريخ والوقت", cell: (c) => <span className="num whitespace-nowrap text-[13px]">{fmtAt(c.startedAt)}</span> },
    { key: "loc", header: "المخزن", cell: (c) => <span className="font-semibold">{cc.locations.find((l) => l.id === c.locationId)?.name.ar ?? "كل المخازن"}</span> },
    { key: "n", header: "عدد الأصناف", align: "end", cell: (c) => <span className="num">{c.lines.length}</span> },
    { key: "keeper", header: "امين المخزن", hideOnMobile: true, cell: (c) => cc.memberById.get(c.startedBy ?? "")?.name ?? "—" },
    { key: "res", header: "نتيجة الجرد", cell: (c) => <ResultBadges lines={c.lines} /> },
  ];
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-bold">قائمة عمليات الجرد السابقة</h2>
        {can("inventory.count") && area.add ? <Button icon={<Plus />} onClick={() => setAdd(true)}>اضافة عملية جرد</Button> : null}
      </div>
      <Card className="overflow-hidden">
        <Table columns={columns} rows={counts.filter((c) => cc.inView(c.branchId))} rowKey={(c) => c.id} onRowClick={(c) => setShow(c)} empty={<EmptyState compact icon={<ClipboardCheck />} title="لا توجد عمليات جرد" />} />
      </Card>
      {add ? <CountDialog cc={cc} onClose={() => setAdd(false)} onSaved={(c) => (setAdd(false), setShow(c))} /> : null}
      {show ? <CountResult cc={cc} count={show} onClose={() => setShow(null)} /> : null}
    </div>
  );
}

function ResultBadges({ lines }: { lines: CountLine[] }) {
  const up = lines.filter((l) => diff(l) > 0).length;
  const down = lines.filter((l) => diff(l) < 0).length;
  if (!up && !down) return <Badge tone="ok" size="sm">مطابق</Badge>;
  return <span className="flex flex-wrap gap-1">{up ? <Badge tone="info" size="sm">فائض {up}</Badge> : null}{down ? <Badge tone="danger" size="sm">عجز {down}</Badge> : null}</span>;
}

function CountDialog({ cc, onClose, onSaved }: { cc: Cc; onClose: () => void; onSaved: (c: StockCount) => void }) {
  const db = useDb();
  const { toast } = useToast();
  const [at] = useState(() => nowIso());
  const [where, setWhere] = useState(cc.viewWarehouses[0]?.id ?? "");
  const [lines, setLines] = useState<QtyLine[]>([]);
  const [busy, setBusy] = useState(false);
  const loc = cc.viewWarehouses.find((l) => l.id === where);
  const items = useMemo(() => (loc ? cc.all.filter((i) => i.active && cc.fits(loc, i)) : []), [cc, loc]);
  const save = async () => {
    if (!loc) return;
    setBusy(true);
    try {
      const rows: CountLine[] = lines.map((l) => {
        const it = cc.itemById.get(l.itemId)!;
        return { itemId: l.itemId, locationId: where, expected: cc.onHand(l.itemId, where), counted: toBaseQty(Math.max(0, l.qty), it), unitCost: it.lastCost };
      });
      const c = await db.insert("stockCounts", {
        branchId: loc.branchId, locationId: where, kind: "partial", blind: false, status: "submitted", lines: rows, startedBy: db.actorId, startedAt: at,
        submittedAt: at, approvedBy: null, approvedAt: null, varianceValue: 0, note: "",
      });
      // saving the count sets the warehouse to what was counted
      const done = await approveCount(db, c.id, db.actorId);
      onSaved({ ...done, lines: rows });
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحفظ", description: String((e as Error).message ?? e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} size="xl" title="اضافة عملية جرد"
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!loc || !lines.length} onClick={save}>حفظ</Button></div>}>
      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <ReadOnly label="التاريخ والوقت الحاليين"><span className="num">{fmtAt(at)}</span></ReadOnly>
          <Select label="المخزن" value={where} onChange={(e) => (setWhere(e.target.value), setLines([]))} options={cc.viewWarehouses.map((l) => ({ value: l.id, label: l.name.ar }))} />
          <ReadOnly label="اسم امين المخزن">{cc.memberById.get(loc?.keeperId ?? "")?.name ?? cc.staff?.name ?? "—"}</ReadOnly>
        </div>
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[14.5px] font-bold">جرد المخزون</h3>
            <Button variant="secondary" size="sm" onClick={() => setLines(items.filter((i) => cc.onHand(i.id, where) !== 0).map((i) => ({ itemId: i.id, qty: 0 })))}>أضف كل مخزون هذا المخزن</Button>
          </div>
          <StockLines items={items} itemById={cc.itemById} lines={lines} onChange={setLines} qtyLabel="الكمية" placeholder="أضف المخزون الموجود من مواد الخام أو المنتجات المصنعة: اكتب الاسم أو الكود" />
        </div>
      </div>
    </Dialog>
  );
}

function CountResult({ cc, count, onClose }: { cc: Cc; count: StockCount; onClose: () => void }) {
  return (
    <Dialog open onClose={onClose} size="xl" title="نتيجة الجرد" description={`${cc.locations.find((l) => l.id === count.locationId)?.name.ar ?? ""} · ${fmtAt(count.startedAt)}`}
      footer={<div className="flex justify-end"><Button onClick={onClose}>إغلاق</Button></div>}>
      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full min-w-[520px] text-[14px]">
          <thead className="bg-surface-2 text-[12.5px] text-muted">
            <tr><th className="px-3 py-2 text-start font-semibold">المخزون</th><th className="px-3 py-2 text-end font-semibold">رصيد النظام</th><th className="px-3 py-2 text-end font-semibold">الكمية بالجرد</th><th className="px-3 py-2 text-end font-semibold">الفرق</th><th className="px-3 py-2 text-start font-semibold">النتيجة</th></tr>
          </thead>
          <tbody>
            {count.lines.map((l) => {
              const it = cc.itemById.get(l.itemId);
              if (!it) return null;
              const d = diff(l);
              return (
                <tr key={l.itemId + l.locationId} className="border-t border-line">
                  <td className="px-3 py-2 font-semibold">{it.name.ar}</td>
                  <td className="num px-3 py-2 text-end">{num(toLine(l.expected, it))}</td>
                  <td className="num px-3 py-2 text-end">{num(toLine(l.counted ?? l.expected, it))}</td>
                  <td className="num px-3 py-2 text-end" dir="ltr">{num(toLine(d, it))}</td>
                  <td className="px-3 py-2">{d > 0 ? <Badge tone="info" size="sm">فائض</Badge> : d < 0 ? <Badge tone="danger" size="sm">عجز</Badge> : <Badge tone="ok" size="sm">مطابق</Badge>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}
