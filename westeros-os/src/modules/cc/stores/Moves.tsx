/** 2.2 الحركات المخزنية: the list of movements and adding one (opening balance, damage, transfer). */
import { useMemo, useState } from "react";
import { ArrowLeftRight, Plus } from "lucide-react";
import { useSession } from "@/auth/session";
import { useDb, useLive } from "@/data/hooks";
import type { MoveKind, StockMove } from "@/data/types";
import { uuid } from "@/lib/id";
import { applyMoves } from "@/modules/inventory/stock";
import { Badge, Button, Card, Dialog, EmptyState, Input, Select, Table, useToast, type Column } from "@/ui";
import { fmtAt, fromLocal, holds, nowLocal, num, toBaseQty, toLine } from "../lib";
import { ReadOnly, StockLines, type QtyLine } from "../ui";
import { useCc, type Cc } from "../useCc";

type MoveType = "opening" | "damage" | "transfer";
const TYPE_LABEL: Record<MoveType, string> = { opening: "رصيد افتتاحي للمخزن", damage: "اتلاف", transfer: "نقل" };
const KIND_LABEL: Partial<Record<MoveKind, string>> = {
  opening: "رصيد افتتاحي", receive: "طلب شراء (دخول)", waste: "اتلاف", transfer_out: "نقل (خروج)", transfer_in: "نقل (دخول)", production_in: "تصنيع (ناتج)", production_out: "تصنيع (مكونات)", count_adjust: "تسوية جرد",
};

export default function Moves() {
  const cc = useCc();
  const { can } = useSession();
  const moves = useLive("stockMoves", { orderBy: [{ field: "at", dir: "desc" }], limit: 300 }).data;
  const [add, setAdd] = useState(false);
  const rows = useMemo(() => moves.filter((m) => KIND_LABEL[m.kind]), [moves]);
  const columns: Column<StockMove>[] = [
    { key: "at", header: "التاريخ والوقت", cell: (m) => <span className="num whitespace-nowrap text-[13px]">{fmtAt(m.at)}</span> },
    { key: "kind", header: "نوع الحركة", cell: (m) => <Badge tone={m.kind === "waste" ? "danger" : m.kind === "opening" ? "brass" : "info"} size="sm">{KIND_LABEL[m.kind]}</Badge> },
    { key: "loc", header: "المخزن", cell: (m) => cc.locations.find((l) => l.id === m.locationId)?.name.ar ?? "—" },
    { key: "item", header: "المخزون", cell: (m) => <span className="font-semibold">{cc.itemById.get(m.itemId)?.name.ar ?? "—"}</span> },
    { key: "qty", header: "الكمية", align: "end", cell: (m) => { const it = cc.itemById.get(m.itemId); return it ? <span className="num" dir="ltr">{num(toLine(m.qty, it))}</span> : "—"; } },
    { key: "by", header: "امين المخزن", hideOnMobile: true, cell: (m) => cc.memberById.get(m.by ?? "")?.name ?? "—" },
  ];
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-bold">قائمة الحركات المخزنية الحالية والسابقة</h2>
        {can("inventory.count") ? <Button icon={<Plus />} onClick={() => setAdd(true)}>اضافة حركة مخزنية</Button> : null}
      </div>
      <Card className="overflow-hidden">
        <Table columns={columns} rows={rows} rowKey={(m) => m.id} dense empty={<EmptyState compact icon={<ArrowLeftRight />} title="لا توجد حركات مخزنية" />} />
      </Card>
      {add ? <MoveDialog cc={cc} onClose={() => setAdd(false)} /> : null}
    </div>
  );
}

function MoveDialog({ cc, onClose }: { cc: Cc; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const [at, setAt] = useState(nowLocal);
  const [type, setType] = useState<MoveType>("opening");
  const [from, setFrom] = useState(cc.warehouses[0]?.id ?? "");
  const [to, setTo] = useState("");
  const [lines, setLines] = useState<QtyLine[]>([]);
  const [busy, setBusy] = useState(false);
  const loc = cc.warehouses.find((l) => l.id === from);
  // *** المخزن فيه اصناف حسب نوعه
  const items = useMemo(() => (loc ? cc.all.filter((i) => i.active && holds(loc, i, cc.lists)) : []), [cc.all, cc.lists, loc]);
  const good = lines.filter((l) => l.qty > 0);
  const short = type !== "opening" ? good.find((l) => { const it = cc.itemById.get(l.itemId); return it && toBaseQty(l.qty, it) > cc.onHand(l.itemId, from) + 1e-6; }) : undefined;
  const valid = !!loc && good.length > 0 && !short && (type !== "transfer" || (!!to && to !== from));
  const save = async () => {
    if (!loc) return;
    setBusy(true);
    try {
      const when = fromLocal(at);
      const groupId = uuid();
      const base = good.map((l) => ({ itemId: l.itemId, qty: toBaseQty(l.qty, cc.itemById.get(l.itemId)!) }));
      if (type === "opening") {
        await applyMoves(db, base.map((l) => ({ itemId: l.itemId, locationId: from, branchId: loc.branchId, kind: "opening" as const, qty: l.qty, value: Math.round(l.qty * (cc.itemById.get(l.itemId)?.lastCost ?? 0)), groupId, refType: "opening", refId: groupId, at: when })));
      } else if (type === "damage") {
        await applyMoves(db, base.map((l) => ({ itemId: l.itemId, locationId: from, branchId: loc.branchId, kind: "waste" as const, qty: -l.qty, reason: "other" as const, groupId, refType: "waste", refId: groupId, at: when })));
      } else {
        const dest = cc.warehouses.find((l) => l.id === to)!;
        const out = await applyMoves(db, base.map((l) => ({ itemId: l.itemId, locationId: from, branchId: loc.branchId, kind: "transfer_out" as const, qty: -l.qty, groupId, refType: "transfer", refId: groupId, at: when })));
        await applyMoves(db, base.map((l) => ({ itemId: l.itemId, locationId: to, branchId: dest.branchId, kind: "transfer_in" as const, qty: l.qty, value: Math.abs(out.find((m) => m.itemId === l.itemId)?.value ?? 0), groupId, refType: "transfer", refId: groupId, at: when })));
      }
      toast({ tone: "success", title: "تم تسجيل الحركة المخزنية" });
      onClose();
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحفظ", description: String((e as Error).message ?? e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} size="xl" title="اضافة حركة مخزنية"
      footer={<div className="flex items-center justify-end gap-2">{short ? <span className="me-auto text-[13px] text-danger">الكمية أكبر من المتوفر في المخزن</span> : null}<Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!valid} onClick={save}>حفظ</Button></div>}>
      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="التاريخ والوقت" type="datetime-local" dir="ltr" value={at} onChange={(e) => setAt(e.target.value)} />
          <Select label="نوع الحركة" value={type} onChange={(e) => setType(e.target.value as MoveType)} options={(Object.keys(TYPE_LABEL) as MoveType[]).map((t) => ({ value: t, label: TYPE_LABEL[t] }))} />
          <Select label={type === "transfer" ? "من مخزن" : "المخزن"} value={from} onChange={(e) => (setFrom(e.target.value), setLines([]))} options={cc.warehouses.map((l) => ({ value: l.id, label: l.name.ar }))} />
          {type === "transfer" ? <Select label="الى مخزن" value={to} onChange={(e) => setTo(e.target.value)} options={[{ value: "", label: "اختر المخزن" }, ...cc.warehouses.filter((l) => l.id !== from).map((l) => ({ value: l.id, label: l.name.ar }))]} /> : null}
          <ReadOnly label="اسم امين المخزن">{cc.staff?.name ?? "—"}</ReadOnly>
        </div>
        <div className="grid gap-2">
          <h3 className="text-[14.5px] font-bold">اختيار المخزون</h3>
          <StockLines items={items} itemById={cc.itemById} lines={lines} onChange={setLines} available={(id) => cc.onHand(id, from)} qtyLabel="الكمية المراد تحريكها" placeholder="أضف مخزون من مواد الخام أو المنتجات المصنعة: اكتب الاسم أو الكود" />
        </div>
      </div>
    </Dialog>
  );
}
