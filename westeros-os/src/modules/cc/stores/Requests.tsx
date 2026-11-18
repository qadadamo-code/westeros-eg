/** طلب توريد: the list with each request's status, and a new request from a branch. */
import { SourceEntry } from "../finance/SourceEntry";
import { useMemo, useState } from "react";
import { Plus, Truck } from "lucide-react";
import { useSession } from "@/auth/session";
import { useDb, useLive } from "@/data/hooks";
import type { StockRequest, StockRequestStatus } from "@/data/types";
import { Badge, Button, Card, Dialog, EmptyState, Input, Select, Table, useToast, type Column } from "@/ui";
import { fmtAt, fmtDay, fromLocal, lineUnit, nowLocal, num, REQUEST_STATUS, toLine } from "../lib";
import { finishRequest } from "./receive";
import { whName } from "./Moves";
import { ReadOnly, StockLines, type QtyLine } from "../ui";
import { useCc, type Cc } from "../useCc";

const STATUSES = Object.keys(REQUEST_STATUS) as StockRequestStatus[];

/** موعد التوريد: the day after the request's date */
const nextDay = (local: string) => {
  const d = new Date(`${local.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** the branch that asked: by the branch, or (older requests) by the branch warehouse */
const askedBy = (cc: Cc, r: StockRequest) => (r.branchId ? cc.branchName(r.branchId) : cc.locations.find((l) => l.id === r.branchLocationId)?.name.ar ?? "—");

export default function Requests() {
  const cc = useCc();
  const db = useDb();
  const { can } = useSession();
  const all = useLive("stockRequests", { orderBy: [{ field: "at", dir: "desc" }] }).data;
  const rows = useMemo(() => all.filter((r) => r.kind === "supply"), [all]);
  const [add, setAdd] = useState(false);
  const [show, setShow] = useState<StockRequest | null>(null);
  const [finish, setFinish] = useState<StockRequest | null>(null);
  const manage = can("inventory.manage");
  const columns: Column<StockRequest>[] = [
    { key: "n", header: "رقم الطلب", cell: (r) => <span className="num text-muted">{r.number}</span> },
    { key: "at", header: "التاريخ والوقت", cell: (r) => <span className="num whitespace-nowrap text-[13px]">{fmtAt(r.at)}</span> },
    { key: "due", header: "موعد التوريد", cell: (r) => <span className="num">{fmtDay(r.dueDate)}</span> },
    { key: "br", header: "اسم الفرع", cell: (r) => <span className="font-semibold">{askedBy(cc, r)}</span> },
    { key: "c", header: "المنتجات", align: "end", hideOnMobile: true, cell: (r) => <span className="num">{r.lines.length}</span> },
    { key: "k", header: "الموظف", hideOnMobile: true, cell: (r) => r.keeperName || "—" },
    {
      key: "s", header: "الحالة", cell: (r) =>
        manage && !r.receivedAt ? (
          <span onClick={(e) => e.stopPropagation()}>
            {/* "انتهت" moves the quantities, so it asks for the warehouses first */}
            <Select aria-label="الحالة" value={r.status} onChange={(e) => (e.target.value === "done" ? setFinish(r) : void db.update("stockRequests", r.id, { status: e.target.value as StockRequestStatus }))} options={STATUSES.map((s) => ({ value: s, label: REQUEST_STATUS[s].ar }))} />
          </span>
        ) : <Badge tone={REQUEST_STATUS[r.status].tone} size="sm">{REQUEST_STATUS[r.status].ar}</Badge>,
    },
  ];
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-bold">قائمة طلبات التوريد الحالية والسابقة</h2>
        {can("inventory.count") ? <Button icon={<Plus />} onClick={() => setAdd(true)}>طلب توريد جديد</Button> : null}
      </div>
      <Card className="overflow-hidden">
        <Table columns={columns} rows={rows} rowKey={(r) => r.id} onRowClick={(r) => setShow(r)} empty={<EmptyState compact icon={<Truck />} title="لا توجد طلبات توريد" />} />
      </Card>
      {add ? <RequestDialog cc={cc} number={Math.max(0, ...rows.map((r) => r.number)) + 1} onClose={() => setAdd(false)} /> : null}
      {finish ? <FinishDialog cc={cc} row={finish} onClose={() => setFinish(null)} /> : null}
      {show ? <RequestView cc={cc} row={show} onClose={() => setShow(null)} /> : null}
    </div>
  );
}

function RequestDialog({ cc, number, onClose }: { cc: Cc; number: number; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const [at, setAt] = useState(nowLocal);
  // موعد التوريد follows the request's date until it is typed
  const [dueTyped, setDueTyped] = useState<string | null>(null);
  const due = dueTyped ?? nextDay(at);
  // the asking branch: the first one that is not the main branch, when there is one
  const [branch, setBranch] = useState((cc.branches.find((b) => !b.isDefault) ?? cc.branches[0])?.id ?? "");
  const [lines, setLines] = useState<QtyLine[]>([]);
  const [busy, setBusy] = useState(false);
  const items = useMemo(() => [...cc.made, ...cc.raws].filter((i) => i.active), [cc.made, cc.raws]);
  // what the warehouses outside the asking branch hold now
  const available = (id: string) => {
    const outside = new Set(cc.warehouses.filter((l) => l.branchId !== branch).map((l) => l.id));
    // one branch only: its own warehouses supply each other
    return cc.levels.reduce((a, l) => (l.itemId === id && (!outside.size || outside.has(l.locationId)) ? a + l.qty : a), 0);
  };
  const good = lines.filter((l) => l.qty > 0);
  const valid = good.length > 0 && !!due && !!branch;
  const save = async () => {
    setBusy(true);
    try {
      await db.insert("stockRequests", {
        kind: "supply", number, at: fromLocal(at), dueDate: due, branchLocationId: null, branchId: branch,
        lines: good.map((l) => { const it = cc.itemById.get(l.itemId)!; return { itemId: l.itemId, name: it.name, qty: l.qty, unit: lineUnit(it).label }; }),
        keeperId: cc.staff?.id ?? null, keeperName: cc.staff?.name ?? "", status: "in_progress", note: "", toLocationId: null, receivedAt: null,
      });
      toast({ tone: "success", title: "تم حفظ طلب التوريد" });
      onClose();
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحفظ", description: String((e as Error).message ?? e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} size="xl" title="طلب توريد جديد"
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!valid} onClick={save}>حفظ</Button></div>}>
      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="التاريخ والوقت" type="datetime-local" dir="ltr" value={at} onChange={(e) => setAt(e.target.value)} />
          <Input label="موعد التوريد" hint="تلقائي: بعد يوم من تاريخ الطلب" type="date" dir="ltr" value={due} onChange={(e) => setDueTyped(e.target.value || null)} />
          <Select label="اسم الفرع" value={branch} onChange={(e) => setBranch(e.target.value)} options={cc.branches.length ? cc.branches.map((b) => ({ value: b.id, label: b.name.ar })) : [{ value: "", label: "لا يوجد فرع" }]} />
          <ReadOnly label="اسم الموظف">{cc.staff?.name ?? "—"}</ReadOnly>
        </div>
        <div className="grid gap-2">
          <h3 className="text-[14.5px] font-bold">اختر المنتجات</h3>
          <StockLines items={items} itemById={cc.itemById} lines={lines} onChange={setLines} available={available} qtyLabel="الكمية المطلوب توريدها" placeholder="أضف منتج: اكتب الاسم أو الكود" />
        </div>
      </div>
    </Dialog>
  );
}

function RequestView({ cc, row, onClose }: { cc: Cc; row: StockRequest; onClose: () => void }) {
  const loc = (id: string | null | undefined) => cc.locations.find((x) => x.id === id)?.name.ar ?? "—";
  const th = "px-3 py-2 text-start font-semibold";
  return (
    <Dialog open onClose={onClose} size="lg" title={`طلب توريد رقم ${row.number}`} description={`${fmtAt(row.at)} · موعد التوريد ${fmtDay(row.dueDate)}`}
      footer={<div className="flex flex-wrap justify-end gap-2"><SourceEntry refId={row.id} /><Button onClick={onClose}>إغلاق</Button></div>}>
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2 text-[14px]">
          <Badge tone={REQUEST_STATUS[row.status].tone}>{REQUEST_STATUS[row.status].ar}</Badge>
          <span>الفرع: <b>{askedBy(cc, row)}</b></span>
          <span>الموظف: <b>{row.keeperName || "—"}</b></span>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-[14px]">
            <thead className="bg-surface-2 text-[12.5px] text-muted"><tr><th className={th}>المنتج</th><th className="px-3 py-2 text-end font-semibold">الكمية</th><th className={th}>الوحدة</th>{row.receivedAt ? <><th className={th}>خرج من مخزن</th><th className={th}>دخل مخزن</th></> : null}</tr></thead>
            <tbody>{row.lines.map((l) => <tr key={l.itemId} className="border-t border-line"><td className="px-3 py-2 font-semibold">{l.name.ar}</td><td className="num px-3 py-2 text-end">{num(l.qty)}</td><td className="px-3 py-2 text-muted">{l.unit}</td>{row.receivedAt ? <><td className="px-3 py-2 text-muted">{loc(l.locationId ?? row.toLocationId)}</td><td className="px-3 py-2 text-muted">{loc(l.toLocationId ?? row.branchLocationId)}</td></> : null}</tr>)}</tbody>
          </table>
        </div>
      </div>
    </Dialog>
  );
}

/** "انتهت": for each product, the warehouse it leaves and the warehouse of the branch it enters; then the quantities move. */
function FinishDialog({ cc, row, onClose }: { cc: Cc; row: StockRequest; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  // older requests name one branch warehouse; new ones name the branch
  const legacy = cc.locations.find((l) => l.id === row.branchLocationId);
  const branchId = row.branchId ?? legacy?.branchId ?? "";
  // any warehouse that holds the product, the ones outside the asking branch first
  const fromFor = (itemId: string) => cc.warehouses.filter((l) => l.id !== legacy?.id && cc.onHand(itemId, l.id) > 0).sort((a, b) => Number(a.branchId === branchId) - Number(b.branchId === branchId) || cc.onHand(itemId, b.id) - cc.onHand(itemId, a.id));
  const toFor = (itemId: string) => { if (legacy) return [legacy]; const it = cc.itemById.get(itemId); return it ? cc.warehouses.filter((l) => l.branchId === branchId && cc.fits(l, it)) : []; };
  const [from, setFrom] = useState<Record<string, string>>(() => Object.fromEntries(row.lines.map((l) => { const ok = fromFor(l.itemId); const want = l.locationId ?? row.toLocationId ?? ""; return [l.itemId, ok.some((o) => o.id === want) ? want : ok[0]?.id ?? ""]; })));
  const [to, setTo] = useState<Record<string, string>>(() => Object.fromEntries(row.lines.map((l) => [l.itemId, toFor(l.itemId).find((o) => o.id !== from[l.itemId])?.id ?? ""])));
  const [busy, setBusy] = useState(false);
  const short = row.lines.find((l) => { const it = cc.itemById.get(l.itemId); return !it || !from[l.itemId] || l.qty > toLine(cc.onHand(l.itemId, from[l.itemId]), it) + 1e-6; });
  const noStore = !legacy && !cc.warehouses.some((l) => l.branchId === branchId);
  const valid = !short && row.lines.every((l) => !!to[l.itemId] && to[l.itemId] !== from[l.itemId]);
  const save = async () => {
    setBusy(true);
    try {
      await finishRequest(db, row.id, from, to);
      toast({ tone: "success", title: "تم توريد الكمية للفرع" });
      onClose();
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحفظ", description: String((e as Error).message ?? e) });
    } finally {
      setBusy(false);
    }
  };
  const th = "px-3 py-2 text-start font-semibold";
  return (
    <Dialog open onClose={onClose} size="xl" title={`انتهاء طلب التوريد رقم ${row.number}`}
      description={`اختر لكل منتج المخزن اللي هيخرج منه والمخزن اللي هيدخله في ${askedBy(cc, row)}`}
      footer={<div className="flex items-center justify-end gap-2">{noStore ? <span className="me-auto text-[13px] text-danger">أضف مخزناً لهذا الفرع من خانة المخازن أولاً</span> : short ? <span className="me-auto text-[13px] text-danger">الكمية المتوفرة من {short.name.ar} أقل من المطلوب</span> : null}<Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!valid} onClick={save}>تأكيد التوريد</Button></div>}>
      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full min-w-[640px] text-[14px]">
          <thead className="bg-surface-2 text-[12.5px] text-muted"><tr><th className={th}>المنتج</th><th className="px-3 py-2 text-end font-semibold">الكمية</th><th className={th}>الوحدة</th><th className={th}>يخرج من مخزن</th><th className={th}>يدخل مخزن الفرع</th></tr></thead>
          <tbody>
            {row.lines.map((l) => {
              const f = fromFor(l.itemId);
              const t = toFor(l.itemId);
              return (
                <tr key={l.itemId} className="border-t border-line">
                  <td className="px-3 py-1.5 font-semibold">{l.name.ar}</td>
                  <td className="num px-3 py-1.5 text-end">{num(l.qty)}</td>
                  <td className="px-3 py-1.5 text-muted">{l.unit}</td>
                  <td className="px-3 py-1.5"><Select aria-label="يخرج من مخزن" value={from[l.itemId] ?? ""} onChange={(e) => setFrom((p) => ({ ...p, [l.itemId]: e.target.value }))} options={f.length ? f.map((o) => ({ value: o.id, label: whName(cc, o) })) : [{ value: "", label: "لا يوجد رصيد" }]} /></td>
                  <td className="px-3 py-1.5"><Select aria-label="يدخل مخزن الفرع" value={to[l.itemId] ?? ""} onChange={(e) => setTo((p) => ({ ...p, [l.itemId]: e.target.value }))} options={t.filter((o) => o.id !== from[l.itemId]).length ? t.filter((o) => o.id !== from[l.itemId]).map((o) => ({ value: o.id, label: o.name.ar })) : [{ value: "", label: "لا يوجد مخزن مناسب" }]} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}
