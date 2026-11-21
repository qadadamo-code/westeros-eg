/**
 * طلب توريد: the list of requests; a new request (the branch is the employee's workplace unless their role may pick it);
 * the responsible employee's screen (status, quantity sent, raw material stickers); and the receipt by scanning.
 */
import { useArea } from "../useAccess";
import { SourceEntry } from "../finance/SourceEntry";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarClock, CheckCircle2, PackageCheck, Play, Plus, Printer, Send, Truck } from "lucide-react";
import { useSession } from "@/auth/session";
import { useDb, useLive } from "@/data/hooks";
import type { StockRequest } from "@/data/types";
import { cn } from "@/lib/cn";
import { Badge, Button, Card, Dialog, EmptyState, Input, Select, Table, useToast, type Column } from "@/ui";
import { labelSizes, saveLabelSize, savedLabelSize } from "@/modules/production/Label";
import { fmtAt, fmtDay, fromLocal, lineUnit, nowLocal, num, REQUEST_STATUS, requestOpen, storeTypeName, toLine } from "../lib";
import { isManagement, memberCan } from "../perms";
import { Scanner } from "../Scanner";
import { whName } from "./Moves";
import { ReadOnly, StockLines, type QtyLine } from "../ui";
import { useCc, type Cc } from "../useCc";
import { KIND_LABEL, lineKind, matchScan, mineLine, sourcesOf, parseSticker, receiveLines, sendLines, setRequestStatus, waitingToReceive, waitingToSend, type LineKind } from "./supply";
import { printSupplyStickers, SupplyLabel, supplyStickers, type SupplySticker } from "./SupplyLabel";

/** موعد التوريد: the day after the request's date */
const nextDay = (local: string) => {
  const d = new Date(`${local.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const msg = (e: unknown) => String((e as Error).message ?? e);

/** the branch that asked: by the branch, or (older requests) by the branch warehouse */
const askedBy = (cc: Cc, r: StockRequest) => (r.branchId ? cc.branchName(r.branchId) : cc.locations.find((l) => l.id === r.branchLocationId)?.name.ar ?? "—");
const kindsOf = (cc: Cc, r: StockRequest) => [...new Set(r.lines.map((l) => lineKind(l, cc.itemById)))];

export default function Requests() {
  const cc = useCc();
  const { can, staff } = useSession();
  const area = useArea();
  const all = useLive("stockRequests", { orderBy: [{ field: "at", dir: "desc" }] }).data;
  const rows = useMemo(() => all.filter((r) => r.kind === "supply"), [all]);
  const [onlyOpen, setOnlyOpen] = useState(true);
  const shown = useMemo(() => (onlyOpen ? rows.filter(requestOpen) : rows), [rows, onlyOpen]);
  const [add, setAdd] = useState(false);
  const [show, setShow] = useState<string | null>(null);
  const [act, setAct] = useState<{ id: string; mode: "handle" | "receive"; scan?: string } | null>(null);
  const [params, setParams] = useSearchParams();
  // a scanned supply sticker or a notification opens the request
  useEffect(() => {
    const open = params.get("open");
    const r = params.get("r");
    if (!rows.length || (!open && !r)) return;
    if (open && rows.some((x) => x.id === open)) setShow(open);
    if (r) {
      const req = rows.find((x) => x.number === Number(r));
      if (req) {
        const mine = req.keeperId === staff?.id || staff?.role === "owner";
        if (mine && req.lines.some(waitingToReceive)) setAct({ id: req.id, mode: "receive", scan: `?${params.toString()}` });
        else setShow(req.id);
      }
    }
    setParams({}, { replace: true });
  }, [rows.length, params.toString()]); // eslint-disable-line react-hooks/exhaustive-deps
  const columns: Column<StockRequest>[] = [
    { key: "n", header: "رقم الطلب", cell: (r) => <span className="num text-muted">{r.number}</span> },
    { key: "at", header: "التاريخ والوقت", hideOnMobile: true, cell: (r) => <span className="num whitespace-nowrap text-[13px]">{fmtAt(r.at)}</span> },
    { key: "due", header: "موعد التوريد", cell: (r) => <span className="num">{fmtDay(r.dueDate)}</span> },
    { key: "br", header: "اسم الفرع", cell: (r) => <span className="font-semibold">{askedBy(cc, r)}</span> },
    { key: "k", header: "النوع", hideOnMobile: true, cell: (r) => <span className="flex flex-wrap gap-1">{kindsOf(cc, r).map((k) => <Badge key={k} tone="neutral" size="sm">{KIND_LABEL[k]}</Badge>)}</span> },
    { key: "c", header: "المنتجات", align: "end", hideOnMobile: true, cell: (r) => <span className="num">{r.lines.length}</span> },
    { key: "p", header: "الموظف", hideOnMobile: true, cell: (r) => r.keeperName || "—" },
    { key: "s", header: "الحالة", cell: (r) => <Badge tone={REQUEST_STATUS[r.status]?.tone ?? "neutral"} size="sm">{REQUEST_STATUS[r.status]?.ar ?? r.status}</Badge> },
  ];
  const current = show ? rows.find((r) => r.id === show) ?? null : null;
  const acting = act ? rows.find((r) => r.id === act.id) ?? null : null;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[17px] font-bold">قائمة طلبات التوريد</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant={onlyOpen ? "soft" : "outline"} onClick={() => setOnlyOpen((v) => !v)}>{onlyOpen ? "إظهار كل الطلبات" : "المفتوحة فقط"}</Button>
          {can("inventory.count") && area.add ? <Button icon={<Plus />} onClick={() => setAdd(true)}>طلب توريد جديد</Button> : null}
        </div>
      </div>
      <Card className="overflow-hidden">
        <Table columns={columns} rows={shown} rowKey={(r) => r.id} onRowClick={(r) => setShow(r.id)} empty={<EmptyState compact icon={<Truck />} title={onlyOpen ? "لا توجد طلبات مفتوحة" : "لا توجد طلبات توريد"} />} />
      </Card>
      {add ? <RequestDialog cc={cc} number={Math.max(0, ...rows.map((r) => r.number)) + 1} onClose={() => setAdd(false)} /> : null}
      {current ? <RequestView cc={cc} row={current} onClose={() => setShow(null)} onAct={(mode) => { setShow(null); setAct({ id: current.id, mode }); }} /> : null}
      {acting && act?.mode === "handle" ? <HandleDialog cc={cc} row={acting} onClose={() => setAct(null)} /> : null}
      {acting && act?.mode === "receive" ? <ReceiveDialog cc={cc} row={acting} firstScan={act.scan} onClose={() => setAct(null)} /> : null}
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
  // the branch: chosen only with the permission, else the employee's workplace
  const pick = memberCan(cc.staff, cc.lists, "supply.branch");
  const own = cc.staff?.branchIds[0] ?? (cc.branches.length === 1 ? cc.branches[0].id : "");
  const [chosen, setChosen] = useState(own || ((cc.branches.find((b) => !b.isDefault) ?? cc.branches[0])?.id ?? ""));
  const branch = pick ? chosen : own;
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
        lines: good.map((l) => { const it = cc.itemById.get(l.itemId)!; return { itemId: l.itemId, name: it.name, qty: l.qty, unit: lineUnit(it).label, kind: it.kind === "raw" ? "raw" as const : "made" as const }; }),
        keeperId: cc.staff?.id ?? null, keeperName: cc.staff?.name ?? "", status: "new", note: "", toLocationId: null, receivedAt: null,
        sentAt: null, history: [{ at: new Date().toISOString(), by: cc.staff?.id ?? null, name: cc.staff?.name ?? "", action: "new" }],
      });
      toast({ tone: "success", title: "تم إرسال طلب التوريد", description: "وصل إشعار للموظفين المسؤولين حسب نوع المنتجات" });
      onClose();
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحفظ", description: msg(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} size="xl" title="طلب توريد جديد"
      footer={<div className="flex items-center justify-end gap-2">{!branch ? <span className="me-auto text-[13px] text-danger">مكان عملك مش متحدد. اطلب من الإدارة تحدده من المستخدمين.</span> : null}<Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!valid} onClick={save}>إرسال الطلب</Button></div>}>
      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="التاريخ والوقت" type="datetime-local" dir="ltr" value={at} onChange={(e) => setAt(e.target.value)} />
          <Input label="موعد التوريد" hint="تلقائي: بعد يوم من تاريخ الطلب" type="date" dir="ltr" value={due} onChange={(e) => setDueTyped(e.target.value || null)} />
          {pick ? (
            <Select label="اسم الفرع" value={chosen} onChange={(e) => setChosen(e.target.value)} options={cc.branches.length ? cc.branches.map((b) => ({ value: b.id, label: b.name.ar })) : [{ value: "", label: "لا يوجد فرع" }]} />
          ) : (
            <ReadOnly label="اسم الفرع (مكان عملك)">{branch ? cc.branchName(branch) : "غير محدد"}</ReadOnly>
          )}
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

const ACTION: Record<string, string> = { branch: "تغيير الفرع", new: "طلب التوريد", in_progress: "قيد التنفيذ", postponed: "تأجيل", sent: "إرسال", received: "استلام", rejected: "رفض" };

function RequestView({ cc, row, onClose, onAct }: { cc: Cc; row: StockRequest; onClose: () => void; onAct: (mode: "handle" | "receive") => void }) {
  const db = useDb();
  const { toast } = useToast();
  const stores = { locations: cc.locations, levels: cc.levels };
  const mine = (l: StockRequest["lines"][number]) => mineLine(cc.staff, cc.lists, l, row, stores);
  const loc = (id: string | null | undefined) => cc.locations.find((x) => x.id === id)?.name.ar ?? "—";
  const canHandle = requestOpen(row) && row.lines.some((l) => waitingToSend(l) && mine(l));
  // تغيير الفرع بعد الطلب: management only, while nothing was sent
  const canMoveBranch = isManagement(cc.staff) && requestOpen(row) && row.lines.every(waitingToSend);
  const moveBranch = async (branchId: string) => {
    if (branchId === row.branchId) return;
    try {
      await db.update("stockRequests", row.id, { branchId, history: [...(row.history ?? []), { at: new Date().toISOString(), by: cc.staff?.id ?? null, name: cc.staff?.name ?? "", action: "branch", note: `${askedBy(cc, row)} ← ${cc.branchName(branchId)}` }] });
      toast({ tone: "success", title: `الطلب اتحول لفرع ${cc.branchName(branchId)}` });
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحفظ", description: msg(e) });
    }
  };
  const canReceive = requestOpen(row) && (row.keeperId === cc.staff?.id || cc.staff?.role === "owner") && row.lines.some(waitingToReceive);
  const rawSent = row.lines.filter((l) => lineKind(l, cc.itemById) === "raw" && (l.sentQty ?? 0) > 0 && l.receivedQty == null);
  const [print, setPrint] = useState(false);
  const th = "px-3 py-2 text-start font-semibold";
  return (
    <Dialog open onClose={onClose} size="xl" title={`طلب توريد رقم ${row.number}`} description={`${fmtAt(row.at)} · موعد التوريد ${fmtDay(row.dueDate)}`}
      footer={<div className="flex flex-wrap justify-end gap-2"><SourceEntry refId={row.id} />
        {rawSent.some((l) => mine(l) || l.sentBy === cc.staff?.id) ? <Button variant="outline" icon={<Printer />} onClick={() => setPrint(true)}>ملصق الخامات</Button> : null}
        {canHandle ? <Button icon={<Play />} onClick={() => onAct("handle")}>تنفيذ الطلب</Button> : null}
        {canReceive ? <Button icon={<PackageCheck />} onClick={() => onAct("receive")}>توثيق الاستلام</Button> : null}
        <Button variant="ghost" onClick={onClose}>إغلاق</Button></div>}>
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2 text-[14px]">
          <Badge tone={REQUEST_STATUS[row.status]?.tone ?? "neutral"}>{REQUEST_STATUS[row.status]?.ar ?? row.status}</Badge>
          {canMoveBranch ? (
            <span className="w-52"><Select aria-label="الفرع" value={row.branchId ?? ""} onChange={(e) => void moveBranch(e.target.value)} options={cc.branches.map((b) => ({ value: b.id, label: `الفرع: ${b.name.ar}` }))} /></span>
          ) : <span>الفرع: <b>{askedBy(cc, row)}</b></span>}
          <span>طالب التوريد: <b>{row.keeperName || "—"}</b></span>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[620px] text-[14px]">
            <thead className="bg-surface-2 text-[12.5px] text-muted"><tr><th className={th}>المنتج</th><th className={th}>النوع</th><th className="px-3 py-2 text-end font-semibold">المطلوب</th><th className="px-3 py-2 text-end font-semibold">المرسل</th><th className="px-3 py-2 text-end font-semibold">المستلم</th><th className={th}>من مخزن</th><th className={th}>إلى مخزن</th></tr></thead>
            <tbody>
              {row.lines.map((l) => {
                const short = l.receivedQty != null && l.sentQty != null && l.receivedQty < l.sentQty;
                return (
                  <tr key={l.itemId} className="border-t border-line">
                    <td className="px-3 py-2 font-semibold">{l.name.ar}</td>
                    <td className="px-3 py-2 text-muted">{KIND_LABEL[lineKind(l, cc.itemById)]}</td>
                    <td className="num px-3 py-2 text-end">{num(l.qty)} <span className="text-muted">{l.unit}</span></td>
                    <td className="num px-3 py-2 text-end">{l.sentQty == null ? <span className="text-muted">—</span> : num(l.sentQty)}</td>
                    <td className={cn("num px-3 py-2 text-end", short && "font-bold text-danger")}>{l.receivedQty == null ? <span className="text-muted">—</span> : num(l.receivedQty)}</td>
                    <td className="px-3 py-2 text-muted">{l.locationId ? loc(l.locationId) : "—"}</td>
                    <td className="px-3 py-2 text-muted">{l.toLocationId ? loc(l.toLocationId) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {row.history?.length ? (
          <ol className="grid gap-1 text-[13px]">
            {row.history.map((h, i) => (
              <li key={i} className="flex flex-wrap gap-x-2"><span className="num text-muted">{fmtAt(h.at)}</span><b>{ACTION[h.action] ?? h.action}</b><span>{h.name}</span>{h.note ? <span className="text-muted">· {h.note}</span> : null}</li>
            ))}
          </ol>
        ) : null}
      </div>
      {print ? <StickerDialog cc={cc} row={row} onClose={() => setPrint(false)} /> : null}
    </Dialog>
  );
}

/**
 * تنفيذ الطلب: the lines from the warehouses the employee keeps (امين المخزن, with the permission on their role): status, the warehouse each line
 * leaves from and the quantity sent. Nothing moves until the branch scans the stickers.
 */
function HandleDialog({ cc, row, onClose }: { cc: Cc; row: StockRequest; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const stores = { locations: cc.locations, levels: cc.levels };
  const mine = row.lines.filter((l) => waitingToSend(l) && mineLine(cc.staff, cc.lists, l, row, stores));
  // where a line can leave from: warehouses outside the asking branch that hold it, the fullest first;
  // a warehouse keeper sends from the warehouses they keep (when the product's warehouses have keepers)
  const fromFor = (itemId: string) => {
    const all = cc.warehouses.filter((l) => l.branchId !== row.branchId && cc.onHand(itemId, l.id) > 0).sort((a, b) => cc.onHand(itemId, b.id) - cc.onHand(itemId, a.id));
    if (cc.staff?.role === "owner") return all;
    const kept = sourcesOf({ itemId }, row, stores).some((l) => l.keeperId);
    return kept ? all.filter((l) => l.keeperId === cc.staff?.id) : all;
  };
  const [from, setFrom] = useState<Record<string, string>>(() => Object.fromEntries(mine.map((l) => [l.itemId, fromFor(l.itemId)[0]?.id ?? ""])));
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(mine.map((l) => [l.itemId, String(l.qty)])));
  const [later, setLater] = useState(false);
  const [newDue, setNewDue] = useState(row.dueDate && row.dueDate > new Date().toISOString().slice(0, 10) ? row.dueDate : nextDay(nowLocal()));
  const [busy, setBusy] = useState(false);
  const [printFor, setPrintFor] = useState<StockRequest | null>(null);
  const have = (itemId: string) => { const it = cc.itemById.get(itemId); return it && from[itemId] ? toLine(cc.onHand(itemId, from[itemId]), it) : 0; };
  const problem = mine.map((l) => {
    const q = Number(qty[l.itemId] || 0);
    if (!Number.isFinite(q) || q < 0) return `${l.name.ar}: اكتب رقم صحيح`;
    if (q > 0 && !from[l.itemId]) return `${l.name.ar}: مفيش رصيد في مخزن تاني`;
    if (q > have(l.itemId) + 1e-6) return `${l.name.ar}: المتوفر ${num(have(l.itemId))} بس`;
    return "";
  }).find(Boolean) ?? "";
  const status = async (s: "in_progress" | "postponed") => {
    setBusy(true);
    try {
      await setRequestStatus(db, row, cc.staff, s, s === "postponed" ? newDue : undefined);
      toast({ tone: "success", title: s === "postponed" ? `تم تأجيل الطلب إلى ${fmtDay(newDue)}` : "الطلب قيد التنفيذ" });
      onClose();
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحفظ", description: msg(e) });
    } finally {
      setBusy(false);
    }
  };
  const send = async () => {
    setBusy(true);
    try {
      const next = await sendLines(db, row.id, cc.staff, Object.fromEntries(mine.map((l) => [l.itemId, { qty: Number(qty[l.itemId] || 0), locationId: from[l.itemId] || null }])));
      toast({ tone: "success", title: "تم تسجيل الكميات المرسلة", description: "الكمية هتتنقل للفرع بعد ما يأكد الاستلام بالمسح" });
      const raws = next.lines.some((l) => lineKind(l, cc.itemById) === "raw" && (l.sentQty ?? 0) > 0 && l.receivedQty == null && mine.some((m) => m.itemId === l.itemId));
      if (raws) setPrintFor(next);
      else onClose();
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحفظ", description: msg(e) });
    } finally {
      setBusy(false);
    }
  };
  if (printFor) return <StickerDialog cc={cc} row={printFor} onlyItems={mine.map((l) => l.itemId)} onClose={onClose} />;
  const th = "px-3 py-2 text-start font-semibold";
  return (
    <Dialog open onClose={onClose} size="xl" title={`تنفيذ طلب التوريد رقم ${row.number}`} description={`${askedBy(cc, row)} · طالب التوريد ${row.keeperName || "—"} · موعد التوريد ${fmtDay(row.dueDate)}`}
      footer={<div className="flex flex-wrap items-center justify-end gap-2">{problem ? <span className="me-auto text-[13px] text-danger">{problem}</span> : null}<Button variant="ghost" onClick={onClose}>إغلاق</Button><Button loading={busy} disabled={!!problem || !mine.length} icon={<Send />} onClick={send}>تم الإرسال</Button></div>}>
      <div className="grid gap-4">
        <div className="grid gap-2 rounded-2xl border border-line p-3">
          <p className="text-[14px] font-bold">حالة الطلب: <Badge tone={REQUEST_STATUS[row.status]?.tone ?? "neutral"}>{REQUEST_STATUS[row.status]?.ar ?? row.status}</Badge></p>
          <div className="flex flex-wrap items-end gap-2">
            <Button variant={row.status === "in_progress" ? "soft" : "outline"} icon={<Play />} disabled={busy} onClick={() => void status("in_progress")}>قيد التنفيذ</Button>
            <Button variant={later ? "soft" : "outline"} icon={<CalendarClock />} disabled={busy} onClick={() => setLater((v) => !v)}>مؤجل</Button>
            {later ? (
              <>
                <div className="w-44"><Input label="الموعد الجديد" type="date" dir="ltr" value={newDue} onChange={(e) => setNewDue(e.target.value)} /></div>
                <Button disabled={busy || !newDue} onClick={() => void status("postponed")}>تأكيد التأجيل</Button>
              </>
            ) : null}
          </div>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[680px] text-[14px]">
            <thead className="bg-surface-2 text-[12.5px] text-muted"><tr><th className={th}>المنتج</th><th className="px-3 py-2 text-end font-semibold">المطلوب</th><th className={th}>يخرج من مخزن</th><th className="px-3 py-2 text-end font-semibold">المتوفر</th><th className={th}>الكمية المرسلة</th></tr></thead>
            <tbody>
              {mine.map((l) => {
                const f = fromFor(l.itemId);
                return (
                  <tr key={l.itemId} className="border-t border-line">
                    <td className="px-3 py-1.5"><span className="font-semibold">{l.name.ar}</span><span className="block text-[12px] text-muted">{KIND_LABEL[lineKind(l, cc.itemById)]}</span></td>
                    <td className="num px-3 py-1.5 text-end">{num(l.qty)} <span className="text-muted">{l.unit}</span></td>
                    <td className="px-3 py-1.5"><Select aria-label="يخرج من مخزن" value={from[l.itemId] ?? ""} onChange={(e) => setFrom((p) => ({ ...p, [l.itemId]: e.target.value }))} options={f.length ? f.map((o) => ({ value: o.id, label: whName(cc, o) })) : [{ value: "", label: "لا يوجد رصيد" }]} /></td>
                    <td className="num px-3 py-1.5 text-end">{num(have(l.itemId))}</td>
                    <td className="px-3 py-1.5"><div className="w-32"><Input aria-label="الكمية المرسلة" inputMode="decimal" dir="ltr" value={qty[l.itemId] ?? ""} onChange={(e) => setQty((p) => ({ ...p, [l.itemId]: e.target.value.replace(/[^\d.]/g, "") }))} /></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[13px] text-muted">اكتب 0 لو المنتج مش هيتبعت. الكمية مش بتتخصم من المخزن غير لما الفرع يأكد الاستلام بالمسح الضوئي.{mine.some((l) => lineKind(l, cc.itemById) === "raw") ? " بعد الإرسال هيظهر لك ملصق الخامات للطباعة، الزقه على الخامات قبل التوريد." : ""}</p>
      </div>
    </Dialog>
  );
}

/** ملصق الخامات: one sticker per storage unit sent, printed like the expiry sticker */
function StickerDialog({ cc, row, onlyItems, onClose }: { cc: Cc; row: StockRequest; onlyItems?: string[]; onClose: () => void }) {
  const settings = useLive("mfgSettings").data[0];
  const sizes = labelSizes(settings?.lists?.labelSizes);
  const [sizeId, setSizeId] = useState(() => savedLabelSize(sizes).id);
  const size = sizes.find((s) => s.id === sizeId) ?? savedLabelSize(sizes);
  const [busy, setBusy] = useState(false);
  const lines = row.lines.filter((l) => lineKind(l, cc.itemById) === "raw" && (l.sentQty ?? 0) > 0 && l.receivedQty == null && (!onlyItems || onlyItems.includes(l.itemId)));
  const sets: SupplySticker[][] = lines.map((l) => {
    const it = cc.itemById.get(l.itemId);
    return supplyStickers({ request: row.number, sku: it?.sku ?? l.itemId.slice(0, 8), name: l.name.ar, branch: askedBy(cc, row), unit: l.unit, sentAt: row.sentAt ?? new Date().toISOString(), storeType: it ? (cc.storeTypeOf(it) ? storeTypeName(cc.storeTypeOf(it)) : "") : "" }, l.sentQty ?? 0);
  });
  const count = sets.reduce((a, s) => a + s.length, 0);
  const print = async () => {
    setBusy(true);
    try {
      await printSupplyStickers(sets, size);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} size="md" title="ملصق الخامات" description="الزق ملصق على كل وحدة من الخامات قبل التوريد. الفرع هيمسحه عشان يأكد الاستلام."
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>إغلاق</Button><Button loading={busy} disabled={!count} icon={<Printer />} onClick={print}>طباعة {count} ملصق</Button></div>}>
      <div className="grid gap-3">
        <Select label="مقاس الستيكر" value={sizeId} onChange={(e) => { setSizeId(e.target.value); saveLabelSize(e.target.value); }} options={sizes.map((s) => ({ value: s.id, label: `${s.w} × ${s.h} مم` }))} />
        {sets[0]?.[0] ? <div className="grid place-items-center overflow-hidden rounded-xl border border-line bg-white p-3"><SupplyLabel s={sets[0][0]} size={size} index={1} of={sets[0].length} /></div> : <p className="text-[13px] text-muted">مفيش خامات مرسلة مستنية الاستلام.</p>}
        <ul className="grid gap-1 text-[13.5px]">{lines.map((l, i) => <li key={l.itemId} className="flex justify-between"><span>{l.name.ar}</span><span className="num text-muted">{sets[i].length} ملصق</span></li>)}</ul>
      </div>
    </Dialog>
  );
}

/**
 * توثيق الاستلام: the employee who asked scans each sticker (the expiry sticker of a manufactured product, the supply
 * sticker of a raw material), checks the quantity received, and picks the warehouse each product is stored in.
 */
function ReceiveDialog({ cc, row, firstScan, onClose }: { cc: Cc; row: StockRequest; firstScan?: string; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const batches = useLive("mfgBatches").data;
  const lines = row.lines.filter(waitingToReceive);
  const [scans, setScans] = useState<Record<string, string[]>>({});
  const [got, setGot] = useState<Record<string, number>>({});
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [log, setLog] = useState<{ ok: boolean; text: string }[]>([]);
  const toFor = (itemId: string) => { const it = cc.itemById.get(itemId); return it ? cc.warehouses.filter((l) => l.branchId === row.branchId && cc.fits(l, it)) : []; };
  const [to, setTo] = useState<Record<string, string>>(() => Object.fromEntries(lines.map((l) => [l.itemId, toFor(l.itemId)[0]?.id ?? ""])));
  const [busy, setBusy] = useState(false);
  const ctx = useMemo(() => ({
    itemById: cc.itemById,
    productByItem: new Map(cc.prod.products.map((p) => [p.stockItemId, p])),
    batchByNumber: (n: string) => batches.find((b) => b.number === n),
  }), [cc.itemById, cc.prod.products, batches]);
  const onScan = (text: string) => {
    const hit = matchScan(row, scans, got, text, ctx);
    if ("error" in hit) {
      setLog((p) => [{ ok: false, text: hit.error }, ...p].slice(0, 6));
      return;
    }
    const line = lines.find((l) => l.itemId === hit.itemId)!;
    setScans((p) => ({ ...p, [hit.itemId]: [...(p[hit.itemId] ?? []), hit.key] }));
    setGot((p) => ({ ...p, [hit.itemId]: Math.round(((p[hit.itemId] ?? 0) + hit.qty) * 1000) / 1000 }));
    setTyped((p) => { const n = { ...p }; delete n[hit.itemId]; return n; });
    setLog((p) => [{ ok: true, text: `${line.name.ar}: +${num(hit.qty)} ${line.unit}` }, ...p].slice(0, 6));
  };
  // a sticker scanned with the phone camera opened this screen: count it
  useEffect(() => {
    if (firstScan && parseSticker(firstScan)) onScan(firstScan);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const qtyOf = (itemId: string) => (typed[itemId] != null ? Number(typed[itemId] || 0) : got[itemId] ?? 0);
  const ready = lines.filter((l) => (scans[l.itemId]?.length ?? 0) > 0);
  const problem = !ready.length ? "امسح ملصقات المنتجات المستلمة" : ready.map((l) => {
    const q = qtyOf(l.itemId);
    if (!(q > 0)) return `${l.name.ar}: اكتب الكمية المستلمة`;
    if (q > (l.sentQty ?? 0) + 1e-6) return `${l.name.ar}: أكبر من المرسل (${num(l.sentQty ?? 0)})`;
    if (!to[l.itemId]) return `${l.name.ar}: أضف مخزن مناسب لفرعك من خانة المخازن`;
    return "";
  }).find(Boolean) ?? "";
  const save = async () => {
    setBusy(true);
    try {
      const next = await receiveLines(db, row.id, cc.staff, Object.fromEntries(ready.map((l) => [l.itemId, { qty: qtyOf(l.itemId), toLocationId: to[l.itemId], scans: scans[l.itemId] ?? [] }])));
      toast({ tone: "success", title: "تم توثيق الاستلام", description: next.receivedAt ? "اتنقلت الكميات لمخازن الفرع" : "اتنقل اللي اتمسح. الباقي مستني الاستلام" });
      onClose();
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحفظ", description: msg(e) });
    } finally {
      setBusy(false);
    }
  };
  const th = "px-3 py-2 text-start font-semibold";
  return (
    <Dialog open onClose={onClose} size="xl" title={`استلام طلب التوريد رقم ${row.number}`} description="امسح ملصق الصلاحية للمنتجات المصنعة وملصق التوريد للخامات، وبعدها اختار المخزن"
      footer={<div className="flex flex-wrap items-center justify-end gap-2">{problem ? <span className="me-auto text-[13px] text-danger">{problem}</span> : null}<Button variant="ghost" onClick={onClose}>إغلاق</Button><Button loading={busy} disabled={!!problem} icon={<CheckCircle2 />} onClick={save}>تأكيد الاستلام</Button></div>}>
      <div className="grid gap-4">
        <Scanner onScan={onScan} />
        {log.length ? (
          <ul className="grid gap-1 text-[13.5px]">{log.map((x, i) => <li key={i} className={cn("rounded-lg px-3 py-1.5", x.ok ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger", i > 0 && "opacity-70")}>{x.text}</li>)}</ul>
        ) : null}
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[680px] text-[14px]">
            <thead className="bg-surface-2 text-[12.5px] text-muted"><tr><th className={th}>المنتج</th><th className="px-3 py-2 text-end font-semibold">المرسل</th><th className="px-3 py-2 text-end font-semibold">الملصقات</th><th className={th}>الكمية المستلمة</th><th className={th}>يتخزن في</th></tr></thead>
            <tbody>
              {lines.map((l) => {
                const n = scans[l.itemId]?.length ?? 0;
                const t = toFor(l.itemId);
                return (
                  <tr key={l.itemId} className={cn("border-t border-line", n && "bg-ok-soft/30")}>
                    <td className="px-3 py-1.5"><span className="font-semibold">{l.name.ar}</span><span className="block text-[12px] text-muted">{KIND_LABEL[lineKind(l, cc.itemById) as LineKind]} · {l.unit}</span></td>
                    <td className="num px-3 py-1.5 text-end">{num(l.sentQty ?? 0)}</td>
                    <td className="num px-3 py-1.5 text-end">{n}</td>
                    <td className="px-3 py-1.5"><div className="w-28"><Input aria-label="الكمية المستلمة" inputMode="decimal" dir="ltr" disabled={!n} value={typed[l.itemId] ?? (n ? String(got[l.itemId] ?? 0) : "")} onChange={(e) => setTyped((p) => ({ ...p, [l.itemId]: e.target.value.replace(/[^\d.]/g, "") }))} /></div></td>
                    <td className="px-3 py-1.5"><Select aria-label="يتخزن في" value={to[l.itemId] ?? ""} onChange={(e) => setTo((p) => ({ ...p, [l.itemId]: e.target.value }))} options={t.length ? t.map((o) => ({ value: o.id, label: o.name.ar })) : [{ value: "", label: "لا يوجد مخزن مناسب" }]} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[13px] text-muted">المنتج اللي ماتمسحش ملصقه مش هيتنقل، ويفضل مستني الاستلام. الكمية بتتنقل من المخزن اللي اتبعتت منه لمخزن فرعك بعد التأكيد.</p>
      </div>
    </Dialog>
  );
}
