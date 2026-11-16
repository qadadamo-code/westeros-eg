/** 2.4 طلب شراء and 2.5 طلب توريد للفرع: the list with each request's status, and a new request. */
import { useMemo, useState } from "react";
import { Plus, ShoppingCart, Truck } from "lucide-react";
import { useSession } from "@/auth/session";
import { useDb, useLive } from "@/data/hooks";
import type { StockRequest, StockRequestStatus } from "@/data/types";
import { Badge, Button, Card, Dialog, EmptyState, Input, Select, Table, useToast, type Column } from "@/ui";
import { fmtAt, fmtDay, fromLocal, holds, lineUnit, nowLocal, num, REQUEST_STATUS, toLine, warehouseType } from "../lib";
import { finishRequest } from "./receive";
import { ReadOnly, StockLines, type QtyLine } from "../ui";
import { useCc, type Cc } from "../useCc";

const STATUSES = Object.keys(REQUEST_STATUS) as StockRequestStatus[];

export default function Requests({ kind }: { kind: "purchase" | "supply" }) {
  const cc = useCc();
  const db = useDb();
  const { can } = useSession();
  const all = useLive("stockRequests", { orderBy: [{ field: "at", dir: "desc" }] }).data;
  const rows = useMemo(() => all.filter((r) => r.kind === kind), [all, kind]);
  const [add, setAdd] = useState(false);
  const [show, setShow] = useState<StockRequest | null>(null);
  const [finish, setFinish] = useState<StockRequest | null>(null);
  const supply = kind === "supply";
  const manage = can("inventory.manage");
  const columns: Column<StockRequest>[] = [
    { key: "n", header: "رقم الطلب", cell: (r) => <span className="num text-muted">{r.number}</span> },
    { key: "at", header: "التاريخ والوقت", cell: (r) => <span className="num whitespace-nowrap text-[13px]">{fmtAt(r.at)}</span> },
    { key: "due", header: "موعد التوريد", cell: (r) => <span className="num">{fmtDay(r.dueDate)}</span> },
    ...(supply ? [{ key: "br", header: "اسم الفرع", cell: (r: StockRequest) => <span className="font-semibold">{cc.locations.find((l) => l.id === r.branchLocationId)?.name.ar ?? "—"}</span> }] : []),
    { key: "c", header: supply ? "المنتجات المصنعة" : "مواد الخام", align: "end", hideOnMobile: true, cell: (r) => <span className="num">{r.lines.length}</span> },
    { key: "k", header: "امين المخزن", hideOnMobile: true, cell: (r) => r.keeperName || "—" },
    {
      key: "s", header: "الحالة", cell: (r) =>
        manage && !r.receivedAt ? (
          <span onClick={(e) => e.stopPropagation()}>
            {/* "انتهت" moves the quantities, so it asks for the warehouse first */}
            <Select aria-label="الحالة" value={r.status} onChange={(e) => (e.target.value === "done" ? setFinish(r) : void db.update("stockRequests", r.id, { status: e.target.value as StockRequestStatus }))} options={STATUSES.map((s) => ({ value: s, label: REQUEST_STATUS[s].ar }))} />
          </span>
        ) : <Badge tone={REQUEST_STATUS[r.status].tone} size="sm">{REQUEST_STATUS[r.status].ar}</Badge>,
    },
  ];
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-bold">{supply ? "قائمة طلبات التوريد الحالية والسابقة" : "قائمة طلبات الشراء الحالية والسابقة"}</h2>
        {can("inventory.count") ? <Button icon={<Plus />} onClick={() => setAdd(true)}>{supply ? "طلب توريد جديد" : "طلب شراء جديد"}</Button> : null}
      </div>
      <Card className="overflow-hidden">
        <Table columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={(r) => setShow(r)} empty={<EmptyState compact icon={supply ? <Truck /> : <ShoppingCart />} title={supply ? "لا توجد طلبات توريد" : "لا توجد طلبات شراء"} />} />
      </Card>
      {add ? <RequestDialog cc={cc} kind={kind} number={Math.max(0, ...rows.map((r) => r.number)) + 1} onClose={() => setAdd(false)} /> : null}
      {finish ? <FinishDialog cc={cc} row={finish} onClose={() => setFinish(null)} /> : null}
      {show ? <RequestView cc={cc} row={show} onClose={() => setShow(null)} /> : null}
    </div>
  );
}

function RequestDialog({ cc, kind, number, onClose }: { cc: Cc; kind: "purchase" | "supply"; number: number; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const supply = kind === "supply";
  // اسم الفرع: من قائمة المخازن فروع مطعم فقط
  const branches = cc.warehouses.filter((l) => warehouseType(l, cc.lists).holds === "branch");
  const [at, setAt] = useState(nowLocal);
  const [due, setDue] = useState("");
  const [branch, setBranch] = useState(branches[0]?.id ?? "");
  const [lines, setLines] = useState<QtyLine[]>([]);
  const [busy, setBusy] = useState(false);
  const stores = cc.warehouses.filter((l) => warehouseType(l, cc.lists).holds === (supply ? "products" : "raw"));
  const [store, setStore] = useState(stores[0]?.id ?? "");
  const items = useMemo(() => (supply ? cc.made : cc.raws).filter((i) => i.active), [cc.made, cc.raws, supply]);
  // what the central kitchen's own warehouses hold now (branches are not counted)
  const central = useMemo(() => new Set(cc.warehouses.filter((l) => warehouseType(l, cc.lists).holds !== "branch").map((l) => l.id)), [cc.warehouses, cc.lists]);
  const available = (id: string) => cc.levels.reduce((a, l) => (l.itemId === id && central.has(l.locationId) ? a + l.qty : a), 0);
  const good = lines.filter((l) => l.qty > 0);
  const valid = good.length > 0 && !!due && (!supply || !!branch);
  const save = async () => {
    setBusy(true);
    try {
      await db.insert("stockRequests", {
        kind, number, at: fromLocal(at), dueDate: due, branchLocationId: supply ? branch : null,
        lines: good.map((l) => { const it = cc.itemById.get(l.itemId)!; return { itemId: l.itemId, name: it.name, qty: l.qty, unit: lineUnit(it).label }; }),
        keeperId: cc.staff?.id ?? null, keeperName: cc.staff?.name ?? "", status: "in_progress", note: "", toLocationId: store || null, receivedAt: null,
      });
      toast({ tone: "success", title: supply ? "تم حفظ طلب التوريد" : "تم حفظ طلب الشراء" });
      onClose();
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحفظ", description: String((e as Error).message ?? e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} size="xl" title={supply ? "طلب توريد جديد" : "طلب شراء جديد"}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!valid} onClick={save}>حفظ</Button></div>}>
      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="التاريخ والوقت" type="datetime-local" dir="ltr" value={at} onChange={(e) => setAt(e.target.value)} />
          <Input label="موعد التوريد" type="date" dir="ltr" value={due} onChange={(e) => setDue(e.target.value)} />
          {supply ? <Select label="اسم الفرع" value={branch} onChange={(e) => setBranch(e.target.value)} hint={branches.length ? undefined : "أضف مخزناً من نوع فرع مطعم أولاً"} options={branches.length ? branches.map((l) => ({ value: l.id, label: l.name.ar })) : [{ value: "", label: "لا يوجد فرع" }]} /> : null}
          <Select label={supply ? "المخزن اللي هتخرج منه الكمية" : "المخزن اللي هتدخل فيه الكمية"} hint="تقدر تغيره لكل صنف عند انتهاء الطلب" value={store} onChange={(e) => setStore(e.target.value)} options={stores.length ? stores.map((l) => ({ value: l.id, label: l.name.ar })) : [{ value: "", label: "لا يوجد مخزن" }]} />
          <ReadOnly label="اسم امين المخزن">{cc.staff?.name ?? "—"}</ReadOnly>
        </div>
        <div className="grid gap-2">
          <h3 className="text-[14.5px] font-bold">{supply ? "اختيار المنتجات المصنعة" : "اختيار مواد الخام"}</h3>
          <StockLines items={items} itemById={cc.itemById} lines={lines} onChange={setLines} available={available} qtyLabel={supply ? "الكمية المطلوب توريدها" : "الكمية المطلوب توريده"} placeholder={supply ? "أضف منتج مصنع: اكتب الاسم أو الكود" : "أضف مادة خام: اكتب الاسم أو الكود"} />
        </div>
      </div>
    </Dialog>
  );
}

function RequestView({ cc, row, onClose }: { cc: Cc; row: StockRequest; onClose: () => void }) {
  const supply = row.kind === "supply";
  return (
    <Dialog open onClose={onClose} size="lg" title={`${supply ? "طلب توريد" : "طلب شراء"} رقم ${row.number}`} description={`${fmtAt(row.at)} · موعد التوريد ${fmtDay(row.dueDate)}`}
      footer={<div className="flex justify-end"><Button onClick={onClose}>إغلاق</Button></div>}>
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2 text-[14px]">
          <Badge tone={REQUEST_STATUS[row.status].tone}>{REQUEST_STATUS[row.status].ar}</Badge>
          {supply ? <span>الفرع: <b>{cc.locations.find((l) => l.id === row.branchLocationId)?.name.ar ?? "—"}</b></span> : null}
          <span>امين المخزن: <b>{row.keeperName || "—"}</b></span>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-[14px]">
            <thead className="bg-surface-2 text-[12.5px] text-muted"><tr><th className="px-3 py-2 text-start font-semibold">{supply ? "المنتج" : "الخام"}</th><th className="px-3 py-2 text-end font-semibold">الكمية</th><th className="px-3 py-2 text-start font-semibold">الوحدة</th><th className="px-3 py-2 text-start font-semibold">{supply ? "خرج من مخزن" : "دخل مخزن"}</th></tr></thead>
            <tbody>{row.lines.map((l) => <tr key={l.itemId} className="border-t border-line"><td className="px-3 py-2 font-semibold">{l.name.ar}</td><td className="num px-3 py-2 text-end">{num(l.qty)}</td><td className="px-3 py-2 text-muted">{l.unit}</td><td className="px-3 py-2 text-muted">{cc.locations.find((x) => x.id === (l.locationId ?? row.toLocationId))?.name.ar ?? "—"}{row.receivedAt ? "" : " (لم يتم بعد)"}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </Dialog>
  );
}

/** "انتهت": choose the warehouse for the whole request or for each item, then the quantities move. */
function FinishDialog({ cc, row, onClose }: { cc: Cc; row: StockRequest; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const supply = row.kind === "supply";
  const stores = cc.warehouses.filter((l) => warehouseType(l, cc.lists).holds !== "branch");
  const optionsFor = (itemId: string) => { const it = cc.itemById.get(itemId); return it ? stores.filter((l) => holds(l, it, cc.lists)) : []; };
  const [locs, setLocs] = useState<Record<string, string>>(() => Object.fromEntries(row.lines.map((l) => { const want = l.locationId ?? row.toLocationId ?? ""; const ok = optionsFor(l.itemId); return [l.itemId, ok.some((o) => o.id === want) ? want : ok[0]?.id ?? ""]; })));
  const [busy, setBusy] = useState(false);
  const all = stores.filter((s) => row.lines.some((l) => optionsFor(l.itemId).some((o) => o.id === s.id)));
  const same = new Set(Object.values(locs)).size === 1 ? Object.values(locs)[0] : "";
  const short = supply ? row.lines.find((l) => { const it = cc.itemById.get(l.itemId); return it && l.qty > toLine(cc.onHand(l.itemId, locs[l.itemId]), it) + 1e-6; }) : undefined;
  const valid = row.lines.every((l) => !!locs[l.itemId]) && !short;
  const save = async () => {
    setBusy(true);
    try {
      await finishRequest(db, row.id, locs);
      toast({ tone: "success", title: supply ? "تم توريد الكمية للفرع" : "تم دخول الكمية للمخزن" });
      onClose();
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحفظ", description: String((e as Error).message ?? e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} size="lg" title={`انتهاء ${supply ? "طلب التوريد" : "طلب الشراء"} رقم ${row.number}`}
      description={supply ? `الكمية هتخرج من المخزن المختار وتدخل ${cc.locations.find((l) => l.id === row.branchLocationId)?.name.ar ?? "الفرع"}` : "الكمية هتدخل المخزن المختار لكل صنف"}
      footer={<div className="flex items-center justify-end gap-2">{short ? <span className="me-auto text-[13px] text-danger">الكمية المتوفرة من {short.name.ar} أقل من المطلوب</span> : null}<Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!valid} onClick={save}>{supply ? "تأكيد التوريد" : "تأكيد الدخول للمخزن"}</Button></div>}>
      <div className="grid gap-3">
        <Select label="مخزن واحد لكل الأصناف" value={same} onChange={(e) => { const id = e.target.value; if (id) setLocs((p) => Object.fromEntries(row.lines.map((l) => [l.itemId, optionsFor(l.itemId).some((o) => o.id === id) ? id : p[l.itemId]]))); }} options={[{ value: "", label: "مخزن مختلف لكل صنف" }, ...all.map((l) => ({ value: l.id, label: l.name.ar }))]} />
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[520px] text-[14px]">
            <thead className="bg-surface-2 text-[12.5px] text-muted"><tr><th className="px-3 py-2 text-start font-semibold">{supply ? "المنتج" : "الخام"}</th><th className="px-3 py-2 text-end font-semibold">الكمية</th><th className="px-3 py-2 text-start font-semibold">الوحدة</th><th className="px-3 py-2 text-start font-semibold">{supply ? "يخرج من مخزن" : "يدخل مخزن"}</th></tr></thead>
            <tbody>
              {row.lines.map((l) => (
                <tr key={l.itemId} className="border-t border-line">
                  <td className="px-3 py-1.5 font-semibold">{l.name.ar}</td>
                  <td className="num px-3 py-1.5 text-end">{num(l.qty)}</td>
                  <td className="px-3 py-1.5 text-muted">{l.unit}</td>
                  <td className="px-3 py-1.5"><Select aria-label="المخزن" value={locs[l.itemId] ?? ""} onChange={(e) => setLocs((p) => ({ ...p, [l.itemId]: e.target.value }))} options={optionsFor(l.itemId).length ? optionsFor(l.itemId).map((o) => ({ value: o.id, label: o.name.ar })) : [{ value: "", label: "لا يوجد مخزن مناسب" }]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Dialog>
  );
}
