/**
 * طلب شراء: raw materials to buy. Any employee who opens المخازن والفروع can ask; the request can be edited or deleted
 * until the purchasing employee starts on it. The employees whose role has "مسؤول المشتريات" are told (a message on
 * opening the system and a count on the menu), set it قيد التنفيذ or مؤجل, and when it is bought pick the warehouse
 * each raw material enters.
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarClock, PackageCheck, Pencil, Play, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { useSession } from "@/auth/session";
import { useDb, useLive } from "@/data/hooks";
import type { StockRequest } from "@/data/types";
import { Badge, Button, Card, Dialog, EmptyState, Input, Select, Table, useToast, type Column } from "@/ui";
import { fmtAt, fmtDay, fromLocal, lineUnit, nowLocal, num, REQUEST_STATUS, requestOpen } from "../lib";
import { isManagement, memberCan } from "../perms";
import { ReadOnly, StockLines, type QtyLine } from "../ui";
import { useCc, type Cc } from "../useCc";
import { finishRequest } from "./receive";
import { setRequestStatus } from "./supply";
import { whName } from "./Moves";

const nextDay = (local: string) => {
  const d = new Date(`${local.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const msg = (e: unknown) => String((e as Error).message ?? e);
const toLocal = (iso: string) => { const d = new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60_000); return d.toISOString().slice(0, 16); };
const ACTION: Record<string, string> = { new: "طلب الشراء", edit: "تعديل", in_progress: "قيد التنفيذ", postponed: "تأجيل", bought: "تم الشراء" };

/** editable and deletable: not started yet, by the employee who asked or by management */
const canChange = (cc: Cc, r: StockRequest) => r.status === "new" && !r.receivedAt && (r.keeperId === cc.staff?.id || isManagement(cc.staff));

export default function Purchases() {
  const cc = useCc();
  const { can } = useSession();
  const all = useLive("stockRequests", { orderBy: [{ field: "at", dir: "desc" }] }).data;
  const rows = useMemo(() => all.filter((r) => r.kind === "purchase"), [all]);
  const [onlyOpen, setOnlyOpen] = useState(true);
  const shown = useMemo(() => (onlyOpen ? rows.filter(requestOpen) : rows), [rows, onlyOpen]);
  const [edit, setEdit] = useState<StockRequest | "new" | null>(null);
  const [show, setShow] = useState<string | null>(null);
  // the message on opening links straight to the request
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const open = params.get("open");
    if (!open || !rows.length) return;
    if (rows.some((r) => r.id === open)) setShow(open);
    setParams({}, { replace: true });
  }, [rows.length, params.toString()]); // eslint-disable-line react-hooks/exhaustive-deps
  const columns: Column<StockRequest>[] = [
    { key: "n", header: "رقم الطلب", cell: (r) => <span className="num text-muted">{r.number}</span> },
    { key: "at", header: "التاريخ والوقت", hideOnMobile: true, cell: (r) => <span className="num whitespace-nowrap text-[13px]">{fmtAt(r.at)}</span> },
    { key: "due", header: "مطلوب يوم", cell: (r) => <span className="num">{fmtDay(r.dueDate)}</span> },
    { key: "c", header: "الخامات", align: "end", cell: (r) => <span className="num">{r.lines.length}</span> },
    { key: "p", header: "الموظف", hideOnMobile: true, cell: (r) => r.keeperName || "—" },
    { key: "s", header: "الحالة", cell: (r) => <Badge tone={REQUEST_STATUS[r.status]?.tone ?? "neutral"} size="sm">{r.status === "done" ? "تم الشراء" : REQUEST_STATUS[r.status]?.ar ?? r.status}</Badge> },
  ];
  const current = show ? rows.find((r) => r.id === show) ?? null : null;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[17px] font-bold">قائمة طلبات الشراء</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant={onlyOpen ? "soft" : "outline"} onClick={() => setOnlyOpen((v) => !v)}>{onlyOpen ? "إظهار كل الطلبات" : "المفتوحة فقط"}</Button>
          {can("inventory.count") ? <Button icon={<Plus />} onClick={() => setEdit("new")}>طلب شراء جديد</Button> : null}
        </div>
      </div>
      <Card className="overflow-hidden">
        <Table columns={columns} rows={shown} rowKey={(r) => r.id} onRowClick={(r) => setShow(r.id)} empty={<EmptyState compact icon={<ShoppingCart />} title={onlyOpen ? "لا توجد طلبات شراء مفتوحة" : "لا توجد طلبات شراء"} />} />
      </Card>
      {edit ? <PurchaseDialog cc={cc} row={edit === "new" ? null : edit} number={Math.max(0, ...rows.map((r) => r.number)) + 1} onClose={() => setEdit(null)} /> : null}
      {current ? <PurchaseView cc={cc} row={current} onClose={() => setShow(null)} onEdit={() => { setShow(null); setEdit(current); }} /> : null}
    </div>
  );
}

function PurchaseDialog({ cc, row, number, onClose }: { cc: Cc; row: StockRequest | null; number: number; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const [at, setAt] = useState(() => (row ? toLocal(row.at) : nowLocal()));
  const [dueTyped, setDueTyped] = useState<string | null>(row?.dueDate ?? null);
  const due = dueTyped ?? nextDay(at);
  const [lines, setLines] = useState<QtyLine[]>(() => row?.lines.map((l) => ({ itemId: l.itemId, qty: l.qty })) ?? []);
  const [note, setNote] = useState(row?.note ?? "");
  const [busy, setBusy] = useState(false);
  const items = useMemo(() => cc.raws.filter((i) => i.active), [cc.raws]);
  const good = lines.filter((l) => l.qty > 0);
  const save = async () => {
    setBusy(true);
    try {
      const out = good.map((l) => { const it = cc.itemById.get(l.itemId)!; return { itemId: l.itemId, name: it.name, qty: l.qty, unit: lineUnit(it).label, kind: "raw" as const }; });
      const ev = { at: new Date().toISOString(), by: cc.staff?.id ?? null, name: cc.staff?.name ?? "" };
      if (row) await db.update("stockRequests", row.id, { at: fromLocal(at), dueDate: due, lines: out, note: note.trim(), history: [...(row.history ?? []), { ...ev, action: "edit" }] });
      else await db.insert("stockRequests", {
        kind: "purchase", number, at: fromLocal(at), dueDate: due, branchLocationId: null, branchId: cc.staff?.branchIds[0] ?? cc.branchId ?? null,
        lines: out, keeperId: cc.staff?.id ?? null, keeperName: cc.staff?.name ?? "", status: "new", note: note.trim(), toLocationId: null, receivedAt: null, sentAt: null, history: [{ ...ev, action: "new" }],
      });
      toast({ tone: "success", title: row ? "تم حفظ التعديل" : "تم إرسال طلب الشراء", description: row ? undefined : "وصل إشعار لمسؤول المشتريات" });
      onClose();
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحفظ", description: msg(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} size="xl" title={row ? `تعديل طلب الشراء رقم ${row.number}` : "طلب شراء جديد"}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!good.length || !due} onClick={save}>{row ? "حفظ" : "إرسال الطلب"}</Button></div>}>
      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="التاريخ والوقت" type="datetime-local" dir="ltr" value={at} onChange={(e) => setAt(e.target.value)} />
          <Input label="مطلوب يوم" hint="تلقائي: بعد يوم من تاريخ الطلب" type="date" dir="ltr" value={due} onChange={(e) => setDueTyped(e.target.value || null)} />
          <ReadOnly label="اسم الموظف">{row?.keeperName || cc.staff?.name || "—"}</ReadOnly>
          <Input label="ملاحظات" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <h3 className="text-[14.5px] font-bold">اختر مواد الخام</h3>
          <StockLines items={items} itemById={cc.itemById} lines={lines} onChange={setLines} available={(id) => cc.onHand(id)} qtyLabel="الكمية المطلوب شراؤها" placeholder="أضف خامة: اكتب الاسم أو الكود" />
        </div>
      </div>
    </Dialog>
  );
}

function PurchaseView({ cc, row, onClose, onEdit }: { cc: Cc; row: StockRequest; onClose: () => void; onEdit: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const buyer = memberCan(cc.staff, cc.lists, "purchase.handle") && requestOpen(row);
  const change = canChange(cc, row);
  const [later, setLater] = useState(false);
  const [newDue, setNewDue] = useState(nextDay(nowLocal()));
  const [del, setDel] = useState(false);
  const [bought, setBought] = useState(false);
  const [busy, setBusy] = useState(false);
  const loc = (id: string | null | undefined) => cc.locations.find((x) => x.id === id)?.name.ar ?? "—";
  const status = async (s: "in_progress" | "postponed") => {
    setBusy(true);
    try {
      await setRequestStatus(db, row, cc.staff, s, s === "postponed" ? newDue : undefined);
      toast({ tone: "success", title: s === "postponed" ? `تم تأجيل الطلب إلى ${fmtDay(newDue)}` : "الطلب قيد التنفيذ" });
      setLater(false);
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحفظ", description: msg(e) });
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await db.remove("stockRequests", row.id);
      toast({ tone: "success", title: `تم حذف طلب الشراء رقم ${row.number}` });
      onClose();
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحذف", description: msg(e) });
    } finally {
      setBusy(false);
    }
  };
  const th = "px-3 py-2 text-start font-semibold";
  if (bought) return <BoughtDialog cc={cc} row={row} onClose={onClose} />;
  return (
    <Dialog open onClose={onClose} size="lg" title={`طلب شراء رقم ${row.number}`} description={`${fmtAt(row.at)} · مطلوب يوم ${fmtDay(row.dueDate)}`}
      footer={<div className="flex flex-wrap justify-end gap-2">
        {change ? <Button variant="danger" icon={<Trash2 />} onClick={() => setDel(true)}>حذف</Button> : null}
        {change ? <Button variant="outline" icon={<Pencil />} onClick={onEdit}>تعديل</Button> : null}
        {buyer ? <Button icon={<PackageCheck />} onClick={() => setBought(true)}>تم الشراء</Button> : null}
        <Button variant="ghost" onClick={onClose}>إغلاق</Button></div>}>
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2 text-[14px]">
          <Badge tone={REQUEST_STATUS[row.status]?.tone ?? "neutral"}>{row.status === "done" ? "تم الشراء" : REQUEST_STATUS[row.status]?.ar ?? row.status}</Badge>
          <span>الموظف: <b>{row.keeperName || "—"}</b></span>
          {row.note ? <span className="text-muted">· {row.note}</span> : null}
        </div>
        {buyer ? (
          <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-line p-3">
            <Button variant={row.status === "in_progress" ? "soft" : "outline"} icon={<Play />} disabled={busy} onClick={() => void status("in_progress")}>قيد التنفيذ</Button>
            <Button variant={later ? "soft" : "outline"} icon={<CalendarClock />} disabled={busy} onClick={() => setLater((v) => !v)}>مؤجل</Button>
            {later ? (
              <>
                <div className="w-44"><Input label="الموعد الجديد" type="date" dir="ltr" value={newDue} onChange={(e) => setNewDue(e.target.value)} /></div>
                <Button disabled={busy || !newDue} onClick={() => void status("postponed")}>تأكيد التأجيل</Button>
              </>
            ) : null}
          </div>
        ) : null}
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-[14px]">
            <thead className="bg-surface-2 text-[12.5px] text-muted"><tr><th className={th}>الخامة</th><th className="px-3 py-2 text-end font-semibold">الكمية</th><th className={th}>الوحدة</th>{row.receivedAt ? <th className={th}>دخل مخزن</th> : null}</tr></thead>
            <tbody>{row.lines.map((l) => <tr key={l.itemId} className="border-t border-line"><td className="px-3 py-2 font-semibold">{l.name.ar}</td><td className="num px-3 py-2 text-end">{num(l.qty)}</td><td className="px-3 py-2 text-muted">{l.unit}</td>{row.receivedAt ? <td className="px-3 py-2 text-muted">{loc(l.locationId ?? row.toLocationId)}</td> : null}</tr>)}</tbody>
          </table>
        </div>
        {row.history?.length ? (
          <ol className="grid gap-1 text-[13px]">
            {row.history.map((h, i) => <li key={i} className="flex flex-wrap gap-x-2"><span className="num text-muted">{fmtAt(h.at)}</span><b>{ACTION[h.action] ?? h.action}</b><span>{h.name}</span>{h.note ? <span className="text-muted">· {h.note}</span> : null}</li>)}
          </ol>
        ) : null}
      </div>
      {del ? (
        <Dialog open onClose={() => setDel(false)} size="sm" title={`حذف طلب الشراء رقم ${row.number}؟`} description="تقدر ترجع عنه من السجل والاسترجاع."
          footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setDel(false)}>إلغاء</Button><Button variant="danger" loading={busy} icon={<Trash2 />} onClick={remove}>حذف</Button></div>}>
          {null}
        </Dialog>
      ) : null}
    </Dialog>
  );
}

/** تم الشراء: the warehouse each raw material enters, then the quantities enter the stock */
function BoughtDialog({ cc, row, onClose }: { cc: Cc; row: StockRequest; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const toFor = (itemId: string) => { const it = cc.itemById.get(itemId); return it ? cc.warehouses.filter((l) => cc.fits(l, it)) : []; };
  const [to, setTo] = useState<Record<string, string>>(() => Object.fromEntries(row.lines.map((l) => [l.itemId, toFor(l.itemId)[0]?.id ?? ""])));
  const [busy, setBusy] = useState(false);
  const valid = row.lines.every((l) => !!to[l.itemId]);
  const save = async () => {
    setBusy(true);
    try {
      const done = await finishRequest(db, row.id, to);
      await db.update("stockRequests", row.id, { history: [...(done.history ?? row.history ?? []), { at: new Date().toISOString(), by: cc.staff?.id ?? null, name: cc.staff?.name ?? "", action: "bought" }] });
      toast({ tone: "success", title: "تم الشراء ودخلت الخامات المخزن" });
      onClose();
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحفظ", description: msg(e) });
    } finally {
      setBusy(false);
    }
  };
  const th = "px-3 py-2 text-start font-semibold";
  return (
    <Dialog open onClose={onClose} size="lg" title={`تم شراء طلب رقم ${row.number}`} description="اختر المخزن اللي كل خامة هتدخله"
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!valid} onClick={save}>تأكيد</Button></div>}>
      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full min-w-[520px] text-[14px]">
          <thead className="bg-surface-2 text-[12.5px] text-muted"><tr><th className={th}>الخامة</th><th className="px-3 py-2 text-end font-semibold">الكمية</th><th className={th}>يدخل مخزن</th></tr></thead>
          <tbody>
            {row.lines.map((l) => {
              const t = toFor(l.itemId);
              return (
                <tr key={l.itemId} className="border-t border-line">
                  <td className="px-3 py-1.5 font-semibold">{l.name.ar}</td>
                  <td className="num px-3 py-1.5 text-end">{num(l.qty)} <span className="text-muted">{l.unit}</span></td>
                  <td className="px-3 py-1.5"><Select aria-label="يدخل مخزن" value={to[l.itemId] ?? ""} onChange={(e) => setTo((p) => ({ ...p, [l.itemId]: e.target.value }))} options={t.length ? t.map((o) => ({ value: o.id, label: whName(cc, o) })) : [{ value: "", label: "لا يوجد مخزن مناسب" }]} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}
