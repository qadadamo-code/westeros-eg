/**
 * Orders: everything today (business day) from every channel — POS, waiter, QR, online, phone, delivery —
 * with filters, search, a detail drawer (items trail, payments, receipts + ETA), reprint and manager-approved refunds.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Bike, ClipboardList, Globe, Printer, QrCode, ReceiptText, RotateCcw, Search, ShoppingBag, Store, Trash2, Utensils, Wallet } from "lucide-react";
import { useApproval } from "@/auth/approval";
import { useSession } from "@/auth/session";
import { useViewBranch } from "@/auth/viewBranch";
import { ViewBranchPicker } from "@/shell/ViewBranchPicker";
import { useDb, useLive } from "@/data/hooks";
import type { Order, OrderStatus, Payment, PaymentMethod, Receipt } from "@/data/types";
import { useT } from "@/i18n/i18n";
import { matches } from "@/lib/arabic";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { clock, startOfDay } from "@/lib/time";
import { METHOD_LABEL, type ReceiptModel } from "@/lib/receipt/model";
import { PageHeader } from "@/shell/PageHeader";
import { AnimatedMoney, Badge, Button, Card, Dialog, EmptyState, Segmented, Select, Sheet, StatTile, Table, useToast, type Tone } from "@/ui";
import { ReceiptDialog } from "../pos/components/ReceiptDialog";
import { STATUS_LABEL } from "../pos/components/TicketPanel";
import { ETA_LABEL } from "../pos/EtaQueue";
import { refundSale, returnable } from "../pos/sale";
import { useReceiptSourceBuilder, useShift, useStaffNames } from "../pos/usePos";

type Channel = "all" | "pos" | "qr" | "online" | "delivery";
type Kind = "all" | "dine_in" | "takeaway" | "pickup" | "delivery";
type StatusF = "all" | "active" | "closed" | "void";

const ORDER_TONE: Record<OrderStatus, Tone> = { open: "warn", sent: "info", ready: "ok", served: "primary", closed: "neutral", void: "danger" };
const ORDER_LABEL: Record<OrderStatus, { ar: string; en: string }> = {
  open: { ar: "مفتوح", en: "Open" },
  sent: { ar: "في المطبخ", en: "In kitchen" },
  ready: { ar: "جاهز", en: "Ready" },
  served: { ar: "اتقدّم", en: "Served" },
  closed: { ar: "مقفول", en: "Closed" },
  void: { ar: "ملغي", en: "Void" },
};
const SOURCE_LABEL: Record<Order["source"], { ar: string; en: string }> = {
  pos: { ar: "كاشير", en: "POS" },
  waiter: { ar: "جرسون", en: "Waiter" },
  qr: { ar: "QR", en: "QR" },
  online: { ar: "أونلاين", en: "Online" },
  phone: { ar: "تليفون", en: "Phone" },
  aggregator: { ar: "تطبيق", en: "App" },
};
const kindOf = (o: Order): Exclude<Kind, "all"> => (o.pickupAt ? "pickup" : o.mode);
const KIND_ICON = { dine_in: Utensils, takeaway: ShoppingBag, pickup: Store, delivery: Bike };
type Period = "today" | "yesterday" | "last30" | "month" | "lastMonth" | "last3" | "day" | "range";
const PERIODS: { value: Period; ar: string; en: string }[] = [
  { value: "today", ar: "اليوم", en: "Today" },
  { value: "yesterday", ar: "أمس", en: "Yesterday" },
  { value: "last30", ar: "آخر 30 يوم", en: "Last 30 days" },
  { value: "month", ar: "الشهر الحالي", en: "This month" },
  { value: "lastMonth", ar: "الشهر السابق", en: "Last month" },
  { value: "last3", ar: "آخر 3 شهور", en: "Last 3 months" },
  { value: "day", ar: "يوم معين", en: "A specific day" },
  { value: "range", ar: "من تاريخ إلى تاريخ", en: "From date to date" },
];
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** the business day starts at midnight, but before 5 AM "today" is still yesterday's shift */
function periodRange(p: Period, day: string, until = day): { from: string; to: string } {
  const today = startOfDay();
  if (new Date().getHours() < 5) today.setDate(today.getDate() - 1);
  const at = (y: number, m: number, d: number) => new Date(y, m, d);
  const end = new Date(today); end.setDate(end.getDate() + 1); end.setHours(5, 0, 0, 0);
  const span = (a: Date, b: Date) => ({ from: a.toISOString(), to: new Date(b.getTime() - 1).toISOString() });
  const y = today.getFullYear(), m = today.getMonth(), d = today.getDate();
  switch (p) {
    case "yesterday": return span(at(y, m, d - 1), at(y, m, d));
    case "last30": return span(at(y, m, d - 29), end);
    case "month": return span(at(y, m, 1), end);
    case "lastMonth": return span(at(y, m - 1, 1), at(y, m, 1));
    case "last3": return span(at(y, m - 2, 1), end);
    case "day": { const [yy, mm, dd] = day.split("-").map(Number); return yy ? span(at(yy, mm - 1, dd), at(yy, mm - 1, dd + 1)) : span(today, end); }
    case "range": {
      // من تاريخ إلى تاريخ: both days included, whichever order they were picked in
      const [a, b] = [day, until || day].sort();
      const [y1, m1, d1] = a.split("-").map(Number), [y2, m2, d2] = b.split("-").map(Number);
      return y1 && y2 ? span(at(y1, m1 - 1, d1), at(y2, m2 - 1, d2 + 1)) : span(today, end);
    }
    default: return span(today, end);
  }
}
const channelOf = (o: Order): Exclude<Channel, "all"> => (o.mode === "delivery" ? "delivery" : o.source === "qr" ? "qr" : o.source === "online" ? "online" : "pos");

export default function OrdersPage() {
  const { L, lang } = useT();
  // فلتر التاريخ (Saqr 2026-11-24): اليوم، أمس، آخر 30 يوم، الشهر الحالي، الشهر السابق، آخر 3 شهور، أو يوم معين، أو من تاريخ إلى تاريخ
  const [period, setPeriod] = useState<Period>("today");
  const [day, setDay] = useState(() => isoDay(new Date()));
  const [until, setUntil] = useState(() => isoDay(new Date()));
  const range = useMemo(() => periodRange(period, day, until), [period, day, until]);
  // التشغيل (Saqr 2026-11-24): the orders of the branch picked at the top; كل الفروع for a user of every branch
  const view = useViewBranch();
  const bq = view.ids ? { branchId: view.ids } : {};
  const orders = useLive("orders", { where: bq, gte: { openedAt: range.from }, lte: { openedAt: range.to }, orderBy: [{ field: "openedAt", dir: "desc" }] }).data;
  const oneDay = period === "today" || period === "yesterday" || period === "day" || (period === "range" && day === until);
  const checkIds = useMemo(() => [...new Set(orders.map((o) => o.checkId).filter((x): x is string => !!x))], [orders]);
  // a long period can hold thousands of orders: checks come by the same dates (no id list in the request), and the
  // item counts only for the latest 200 orders, so the request stays small
  const periodChecks = useLive("checks", { where: bq, gte: { openedAt: range.from }, lte: { openedAt: range.to } }, { enabled: !oneDay }).data;
  const dayChecks = useLive("checks", { where: { id: checkIds } }, { enabled: oneDay && checkIds.length > 0 }).data;
  const checks = oneDay ? dayChecks : periodChecks;
  const itemOrderIds = useMemo(() => orders.slice(0, 200).map((o) => o.id), [orders]);
  const items = useLive("orderItems", { where: { orderId: itemOrderIds } }, { enabled: itemOrderIds.length > 0 }).data;
  const tables = useLive("tables").data;
  const customers = useLive("customers").data;
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [channel, setChannel] = useState<Channel>("all");
  const [status, setStatus] = useState<StatusF>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const checkById = useMemo(() => new Map(checks.map((c) => [c.id, c])), [checks]);
  const tableLabel = (ids: string[]) => ids.map((id) => tables.find((t) => t.id === id)?.label ?? "?").join("+");
  const custOf = (o: Order) => customers.find((c) => c.id === o.customerId);
  const rows = orders.filter((o) => {
    if (kind !== "all" && kindOf(o) !== kind) return false;
    if (channel !== "all" && channelOf(o) !== channel) return false;
    if (status === "active" && (o.status === "closed" || o.status === "void")) return false;
    if (status === "closed" && o.status !== "closed") return false;
    if (status === "void" && o.status !== "void") return false;
    if (q.trim()) {
      const c = custOf(o);
      const ch = o.checkId ? checkById.get(o.checkId) : null;
      if (!matches(`${o.number} ${tableLabel(o.tableIds)} ${c?.name ?? ""} ${c?.phone ?? ""} ${ch?.receiptNo ?? ""} ${o.delivery?.address ?? ""}`, q)) return false;
    }
    return true;
  });
  const paid = checks.filter((c) => c.status === "paid");
  const sales = paid.reduce((a, c) => a + c.total, 0);
  const active = orders.filter((o) => o.status !== "closed" && o.status !== "void").length;

  return (
    <div className="grid gap-6">
      <PageHeader icon={<ClipboardList />} title={L("الطلبات", "Orders")} subtitle={L("كل الطلبات من كل القنوات — اختار الفترة من فلتر التاريخ", "Every order from every channel — pick the period in the date filter")} actions={<ViewBranchPicker noCentral />} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile index={0} icon={<ClipboardList />} label={L("عدد الطلبات", "Orders")} value={orders.length} sub={`${active} ${L("شغالين", "active")}`} />
        <StatTile index={1} icon={<Wallet />} tone="brass" label={L("مبيعات مقفولة", "Closed sales")} value={<AnimatedMoney value={sales} whole />} sub={`${paid.length} ${L("شيك", "checks")}`} />
        <StatTile index={2} icon={<ReceiptText />} tone="info" label={L("متوسط الشيك", "Average check")} value={<AnimatedMoney value={paid.length ? Math.round(sales / paid.length) : 0} whole />} />
        <StatTile index={3} icon={<QrCode />} tone="ok" label={L("من QR وأونلاين", "From QR & online")} value={orders.filter((o) => o.source === "qr" || o.source === "online").length} />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
          <label className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L("رقم، ترابيزة، عميل، إيصال…", "Number, table, customer, receipt…")} aria-label={L("بحث", "Search")} className="h-11 w-full rounded-xl border border-line bg-surface ps-9 pe-3 outline-none focus:border-primary focus:shadow-[var(--sf-glow)]" />
          </label>
          <div className="w-full sm:w-44"><Select aria-label={L("التاريخ", "Date")} value={period} onChange={(e) => setPeriod(e.target.value as Period)} options={PERIODS.map((x) => ({ value: x.value, label: L(x.ar, x.en) }))} /></div>
          {period === "day" ? <input type="date" value={day} max={isoDay(new Date())} onChange={(e) => setDay(e.target.value)} aria-label={L("اليوم", "Day")} className="num h-11 rounded-xl border border-line bg-surface px-3 outline-none focus:border-primary" dir="ltr" /> : null}
          {period === "range" ? (
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-muted">{L("من", "From")}</span>
              <input type="date" value={day} max={isoDay(new Date())} onChange={(e) => setDay(e.target.value)} aria-label={L("من تاريخ", "From date")} className="num h-11 rounded-xl border border-line bg-surface px-3 outline-none focus:border-primary" dir="ltr" />
              <span className="text-[13px] text-muted">{L("إلى", "To")}</span>
              <input type="date" value={until} max={isoDay(new Date())} onChange={(e) => setUntil(e.target.value)} aria-label={L("إلى تاريخ", "To date")} className="num h-11 rounded-xl border border-line bg-surface px-3 outline-none focus:border-primary" dir="ltr" />
            </div>
          ) : null}
          <Segmented size="sm" label={L("الحالة", "Status")} value={status} onChange={setStatus} options={[{ value: "all", label: L("الكل", "All") }, { value: "active", label: L("شغال", "Active") }, { value: "closed", label: L("مقفول", "Closed") }, { value: "void", label: L("ملغي", "Void") }]} />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
          <Segmented size="sm" label={L("النوع", "Type")} value={kind} onChange={setKind} options={[{ value: "all", label: L("كل الأنواع", "All types") }, { value: "dine_in", label: L("صالة", "Dine-in"), icon: <Utensils /> }, { value: "takeaway", label: L("تيك أواي", "Takeaway"), icon: <ShoppingBag /> }, { value: "pickup", label: L("استلام", "Pickup"), icon: <Store /> }, { value: "delivery", label: L("دليفري", "Delivery"), icon: <Bike /> }]} />
          <Segmented size="sm" label={L("القناة", "Channel")} value={channel} onChange={setChannel} options={[{ value: "all", label: L("كل القنوات", "All channels") }, { value: "pos", label: L("كاشير/جرسون", "POS") }, { value: "qr", label: "QR", icon: <QrCode /> }, { value: "online", label: L("أونلاين", "Online"), icon: <Globe /> }, { value: "delivery", label: L("دليفري", "Delivery"), icon: <Bike /> }]} />
        </div>
        {rows.length ? (
          <Table
            rows={rows}
            rowKey={(o) => o.id}
            onRowClick={(o) => setOpenId(o.id)}
            selectedKey={openId}
            columns={[
              { key: "n", header: "#", width: "64px", cell: (o) => <span className="num font-bold">{o.number}</span> },
              { key: "t", header: L("الوقت", "Time"), cell: (o) => <span className="num text-[13px] text-muted">{oneDay ? "" : `${new Date(o.openedAt).toLocaleDateString(lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { day: "numeric", month: "numeric" })} · `}{clock(o.openedAt, lang)}</span>, hideOnMobile: true },
              {
                key: "k",
                header: L("النوع", "Type"),
                cell: (o) => {
                  const k = kindOf(o);
                  const Icon = KIND_ICON[k];
                  return (
                    <span className="flex items-center gap-2">
                      <Icon className="size-4 text-muted" />
                      <span className="font-semibold">{o.tableIds.length ? `${L("ترابيزة", "T")} ${tableLabel(o.tableIds)}` : (custOf(o)?.name || { dine_in: L("صالة", "Dine-in"), takeaway: L("تيك أواي", "Takeaway"), pickup: L("استلام", "Pickup"), delivery: L("دليفري", "Delivery") }[k])}</span>
                    </span>
                  );
                },
              },
              { key: "c", header: L("القناة", "Channel"), cell: (o) => <Badge size="sm" tone={o.source === "qr" ? "info" : o.source === "online" ? "brass" : "neutral"}>{SOURCE_LABEL[o.source][lang]}</Badge>, hideOnMobile: true },
              { key: "i", header: L("أصناف", "Items"), align: "center", hideOnMobile: true, cell: (o) => <span className="num">{itemOrderIds.includes(o.id) ? items.filter((i) => i.orderId === o.id && i.status !== "void").reduce((a, i) => a + i.qty, 0) : "—"}</span> },
              { key: "s", header: L("الحالة", "Status"), cell: (o) => <Badge size="sm" dot tone={ORDER_TONE[o.status]}>{ORDER_LABEL[o.status][lang]}</Badge> },
              {
                key: "p",
                header: L("الدفع", "Payment"),
                hideOnMobile: true,
                cell: (o) => {
                  const c = o.checkId ? checkById.get(o.checkId) : null;
                  if (!c) return "—";
                  return c.status === "paid" ? <Badge size="sm" tone="ok">{L("مدفوع", "Paid")}</Badge> : c.paid ? <Badge size="sm" tone="brass">{L("جزئي", "Partial")}</Badge> : c.status === "void" ? <Badge size="sm">—</Badge> : <Badge size="sm" tone="warn">{L("لسه", "Unpaid")}</Badge>;
                },
              },
              { key: "r", header: L("إيصال", "Receipt"), hideOnMobile: true, cell: (o) => <span className="num text-[12.5px] text-muted">{(o.checkId && checkById.get(o.checkId)?.receiptNo) || "—"}</span> },
              { key: "tot", header: L("الإجمالي", "Total"), align: "end", cell: (o) => <span className="num font-semibold">{o.checkId && checkById.get(o.checkId) ? formatMoney(checkById.get(o.checkId)!.total, { lang }) : "—"}</span> },
            ]}
          />
        ) : (
          <EmptyState compact icon={<ClipboardList />} title={L("مفيش طلبات بالفلتر ده", "No orders match")} />
        )}
      </Card>
      <OrderDrawer orderId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function OrderDrawer({ orderId, onClose }: { orderId: string | null; onClose: () => void }) {
  const { L, lang, loc } = useT();
  const nav = useNavigate();
  const db = useDb();
  const approve = useApproval();
  const { toast } = useToast();
  const { can, role } = useSession();
  const names = useStaffNames();
  const { device, shift } = useShift();
  const builder = useReceiptSourceBuilder();
  const order = useLive("orders", { where: { id: orderId ?? "-" } }, { enabled: !!orderId }).data[0] ?? null;
  const checkId = order?.checkId ?? "-";
  const check = useLive("checks", { where: { id: checkId } }, { enabled: !!order?.checkId }).data[0] ?? null;
  const orders = useLive("orders", { where: { checkId } }, { enabled: !!order?.checkId }).data;
  const items = useLive("orderItems", { where: { orderId: orders.map((o) => o.id) } }, { enabled: orders.length > 0 }).data;
  const payments = useLive("payments", { where: { checkId }, orderBy: [{ field: "createdAt" }] }, { enabled: !!order?.checkId }).data;
  const receipts = useLive("receipts", { where: { checkId }, orderBy: [{ field: "seq" }] }, { enabled: !!order?.checkId }).data;
  const tables = useLive("tables").data;
  const [view, setView] = useState<{ model: ReceiptModel; title: string } | null>(null);
  const [refund, setRefund] = useState(false);
  const sale = receipts.find((r) => r.kind === "SC") ?? null;
  const returns = receipts.filter((r) => r.kind === "RC");
  const open = !!orderId && !!order;
  const mine = items.filter((i) => order && i.orderId === order.id);
  // A cancelled order (voided, or every item voided) that never took money can be removed by a manager.
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const cancelled = !!order && (order.status === "void" || mine.every((i) => i.status === "void"));
  const untouchedMoney = payments.length === 0 && receipts.length === 0;
  const canDelete = cancelled && untouchedMoney && (role === "owner" || role === "admin" || role === "manager");
  const deleteOrder = async () => {
    if (!order || !canDelete) return;
    setDeleting(true);
    try {
      await db.audit("order.delete", "orders", order.id, { number: order.number, items: mine.map((i) => ({ name: i.name, qty: i.qty, reason: i.voidReason ?? null })) });
      for (const i of mine) await db.remove("orderItems", i.id);
      await db.remove("orders", order.id);
      // the bill goes too when this was its only order (owners and admins), otherwise it is closed as void
      if (check && orders.every((o) => o.id === order.id)) {
        // the order is already gone: a bill that cannot be removed is closed as void instead
        const removed = role === "owner" || role === "admin" ? await db.remove("checks", check.id).then(() => true, () => false) : false;
        if (!removed) await db.update("checks", check.id, { status: "void" }).catch(() => undefined);
      }
      toast({ title: L(`اتحذف طلب #${order.number}`, `Order #${order.number} deleted`), tone: "success" });
      setConfirmDelete(false);
      onClose();
    } catch {
      toast({ title: L("ماقدرناش نحذف الطلب، جرّب تاني", "Could not delete the order, try again"), tone: "error" });
    } finally {
      setDeleting(false);
    }
  };

  const reprint = (r: Receipt | null) => {
    if (!builder || !check) return;
    const m = r ? builder.fromReceipt(r, check, orders, payments, r.refundOf ? receipts.find((x) => x.id === r.refundOf) : null) : builder.fromCheck(check, orders, items, payments, payments[0]?.takenBy ?? null);
    if (m) setView({ model: m, title: r ? r.receiptNo : check.receiptNo ?? L("شيك مبدئي", "Pre-bill") });
  };

  return (
    <>
      <Sheet open={open} onClose={onClose} size="lg" title={order ? `${L("طلب", "Order")} #${order.number}` : ""} description={order ? `${SOURCE_LABEL[order.source][lang]} · ${clock(order.openedAt, lang)}${order.tableIds.length ? ` · ${L("ترابيزة", "Table")} ${order.tableIds.map((id) => tables.find((t) => t.id === id)?.label).join("+")}` : ""}` : undefined}
        footer={
          order ? (
            <div className="flex w-full flex-wrap gap-2">
              {check && (check.status === "open" || check.status === "bill_requested") && can("pos.use") ? (
                <Button
                  variant="soft"
                  onClick={() => nav(`/pos?check=${check.id}${check.tableIds[0] ? `&table=${check.tableIds[0]}` : ""}`)}
                >
                  {L("افتح في الكاشير", "Open in POS")}
                </Button>
              ) : null}
              {canDelete ? (
                <Button variant="danger-soft" icon={<Trash2 className="size-4" />} onClick={() => setConfirmDelete(true)}>
                  {L("حذف الطلب", "Delete order")}
                </Button>
              ) : null}
              <div className="flex-1" />
              {sale && can("payments.take") ? (
                <Button variant="danger-soft" icon={<RotateCcw className="size-4" />} onClick={() => setRefund(true)}>
                  {L("مرتجع", "Refund")}
                </Button>
              ) : null}
              {check ? (
                <Button icon={<Printer className="size-4" />} onClick={() => reprint(sale)}>
                  {sale ? L("إعادة طباعة", "Reprint") : L("شيك مبدئي", "Pre-bill")}
                </Button>
              ) : null}
            </div>
          ) : null
        }
      >
        {order ? (
          <div className="grid gap-5">
            <div className="flex flex-wrap gap-2">
              <Badge dot tone={ORDER_TONE[order.status]}>{ORDER_LABEL[order.status][lang]}</Badge>
              {check ? <Badge tone={check.status === "paid" ? "ok" : "warn"}>{check.status === "paid" ? L("مدفوع", "Paid") : check.status === "void" ? L("ملغي", "Void") : L("لسه مدفوعش", "Unpaid")}</Badge> : null}
              {order.delivery ? <Badge tone="info" icon={<Bike className="size-3" />}>{order.delivery.address}</Badge> : null}
              {order.pickupAt ? <Badge tone="brass" icon={<Store className="size-3" />}>{clock(order.pickupAt, lang)}</Badge> : null}
            </div>
            <section>
              <h3 className="mb-2 text-[13px] font-bold tracking-wide text-muted">{L("الأصناف", "Items")}</h3>
              <ul className="grid gap-1.5">
                {mine.map((i, k) => (
                  <motion.li key={i.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: k * 0.02 }} className={cn("rounded-xl border border-line px-3 py-2", i.status === "void" && "opacity-60")}>
                    <div className="flex items-center gap-2">
                      <span className="num grid size-7 place-items-center rounded-lg bg-surface-3 text-[13px] font-bold">{i.qty}</span>
                      <span className={cn("min-w-0 flex-1 truncate font-semibold", i.status === "void" && "line-through")}>{loc(i.name)}</span>
                      <Badge size="sm" tone={i.status === "void" ? "danger" : i.status === "ready" ? "ok" : i.status === "new" ? "neutral" : "info"}>
                        {STATUS_LABEL[i.status][lang]}
                      </Badge>
                    </div>
                    {i.modifiers.length || i.notes ? <p className="mt-1 text-[12.5px] text-muted">{[...i.modifiers.map((m) => loc(m.name)), i.notes && `“${i.notes}”`].filter(Boolean).join(" · ")}</p> : null}
                    <p className="num mt-1 text-[11.5px] text-faint">
                      {i.createdBy ? `${names.get(i.createdBy)?.name ?? ""} · ` : ""}
                      {i.firedAt ? `${L("اتبعت", "fired")} ${clock(i.firedAt, lang)}` : ""}
                      {i.readyAt ? ` · ${L("جاهز", "ready")} ${clock(i.readyAt, lang)}` : ""}
                      {i.servedAt ? ` · ${L("اتقدّم", "served")} ${clock(i.servedAt, lang)}` : ""}
                      {i.voidReason ? ` · ${L("اتلغى", "void")}: ${i.voidReason}` : ""}
                    </p>
                  </motion.li>
                ))}
              </ul>
            </section>
            {check ? (
              <section className="rounded-2xl bg-surface-2 p-4">
                <dl className="grid gap-1 text-[14px]">
                  <Line l={L("الإجمالي قبل الخصم", "Subtotal")} v={check.subtotal} lang={lang} />
                  {check.discountTotal ? <Line l={`${L("خصم", "Discount")}${check.discountReason ? ` · ${check.discountReason}` : ""}`} v={-check.discountTotal} lang={lang} /> : null}
                  {check.service ? <Line l={L("خدمة", "Service")} v={check.service} lang={lang} /> : null}
                  {check.vat ? <Line l={L("ضريبة ق.م", "VAT")} v={check.vat} lang={lang} /> : null}
                  <div className="mt-1 flex items-baseline justify-between border-t border-line pt-2 text-[17px] font-semibold">
                    <dt>{L("الإجمالي", "Total")}</dt>
                    <dd className="num">{formatMoney(check.total, { lang })}</dd>
                  </div>
                </dl>
              </section>
            ) : null}
            {payments.length ? (
              <section>
                <h3 className="mb-2 text-[13px] font-bold tracking-wide text-muted">{L("المدفوعات", "Payments")}</h3>
                <ul className="grid gap-1.5">
                  {payments.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">
                          {METHOD_LABEL[p.method][lang]} {p.splitLabel ? <span className="num text-[12px] text-muted">· {p.splitLabel}</span> : null}
                        </span>
                        <span className="block text-[12px] text-muted">
                          {clock(p.createdAt, lang)} · {p.takenBy ? names.get(p.takenBy)?.name : ""}
                          {p.tip ? ` · ${L("إكرامية", "tip")} ${formatMoney(p.tip, { lang })}` : ""}
                        </span>
                      </span>
                      {p.status !== "captured" ? <Badge size="sm" tone={p.status === "refunded" ? "brass" : "neutral"}>{p.status === "refunded" ? L("مرتجع", "Refund") : L("ملغي", "Void")}</Badge> : null}
                      <span className={cn("num font-semibold", p.amount < 0 && "text-danger")}>{formatMoney(p.amount, { lang })}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {receipts.length ? (
              <section>
                <h3 className="mb-2 text-[13px] font-bold tracking-wide text-muted">{L("الإيصالات", "Receipts")}</h3>
                <ul className="grid gap-1.5">
                  {receipts.map((r) => (
                    <li key={r.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2">
                      <ReceiptText className="size-4 text-muted" />
                      <span className="num min-w-0 flex-1 font-semibold">{r.receiptNo}</span>
                      <Badge size="sm" tone={r.kind === "RC" ? "brass" : "neutral"}>{r.kind === "RC" ? L("مرتجع", "Return") : L("بيع", "Sale")}</Badge>
                      <Badge size="sm" tone={r.etaStatus === "valid" ? "ok" : r.etaStatus === "invalid" ? "danger" : r.etaStatus === "not_required" ? "neutral" : "warn"}>
                        ETA · {ETA_LABEL[r.etaStatus][lang]}
                      </Badge>
                      <Button size="sm" variant="ghost" icon={<Printer className="size-4" />} onClick={() => reprint(r)} aria-label={L("اطبع", "Print")} />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : null}
      </Sheet>
      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        size="sm"
        title={L(`حذف طلب #${order?.number ?? ""}؟`, `Delete order #${order?.number ?? ""}?`)}
        description={L("الطلب الملغي هيتشال من القائمة نهائيًا ومش هيرجع. الحذف بيتسجل باسمك في سجل المراجعة.", "The cancelled order is removed for good. The deletion is recorded under your name in the audit log.")}
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button variant="soft" onClick={() => setConfirmDelete(false)}>
              {L("رجوع", "Back")}
            </Button>
            <Button variant="danger" loading={deleting} icon={<Trash2 className="size-4" />} onClick={() => void deleteOrder()}>
              {L("احذف", "Delete")}
            </Button>
          </div>
        }
      />
      <ReceiptDialog open={!!view} onClose={() => setView(null)} model={view?.model ?? null} title={view?.title} />
      {sale && check ? (
        <RefundDialog
          open={refund}
          onClose={() => setRefund(false)}
          sale={sale}
          returns={returns}
          payments={payments}
          shiftOpen={!!shift}
          onRefund={async (picks, method, reason) => {
            const who = await approve({ kind: "refund" }, L(`مرتجع من ${sale.receiptNo}`, `Refund on ${sale.receiptNo}`));
            if (!who) return;
            try {
              const r = await refundSale(db, sale, picks, method, { shift, device, approvedBy: who.id, reason });
              setRefund(false);
              toast({ title: L(`اتعمل مرتجع ${r.receipt.receiptNo}`, `Refund ${r.receipt.receiptNo} issued`), description: formatMoney(r.receipt.bill.payable, { lang }), tone: "success" });
              if (builder) setView({ model: builder.fromReceipt(r.receipt, check, orders, payments, sale), title: r.receipt.receiptNo });
            } catch (e) {
              toast({ title: String((e as Error).message), tone: "error" });
            }
          }}
        />
      ) : null}
    </>
  );
}

function Line({ l, v, lang }: { l: string; v: number; lang: "ar" | "en" }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{l}</dt>
      <dd className="num">{formatMoney(v, { lang })}</dd>
    </div>
  );
}

function RefundDialog({ open, onClose, sale, returns, payments, shiftOpen, onRefund }: {
  open: boolean;
  onClose: () => void;
  sale: Receipt;
  returns: Receipt[];
  payments: Payment[];
  shiftOpen: boolean;
  onRefund: (picks: { lineId: string; qty: number }[], method: PaymentMethod, reason: string) => void;
}) {
  const { L, lang, loc } = useT();
  const left = useMemo(() => returnable(sale, returns), [sale, returns]);
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [method, setMethod] = useState<PaymentMethod>(payments.find((p) => p.status === "captured")?.method ?? "cash");
  const [reason, setReason] = useState("");
  const chosen = Object.entries(picks)
    .filter(([, q]) => q > 0)
    .map(([lineId, qty]) => ({ lineId, qty }));
  const estimate = chosen.reduce((a, p) => {
    const l = sale.bill.lines.find((x) => x.id === p.lineId)!;
    return a + Math.round((l.total * p.qty) / l.qty);
  }, 0);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={L("مرتجع", "Refund")}
      description={L(`من الإيصال ${sale.receiptNo} — بيطلع إيصال مرتجع إلكتروني مربوط بالأصل`, `Against ${sale.receiptNo} — issues a linked return e-receipt`)}
      footer={
        <Button variant="danger" size="lg" disabled={!chosen.length || !reason.trim() || !shiftOpen} onClick={() => onRefund(chosen, method, reason.trim())} icon={<RotateCcw className="size-5" />}>
          {L("رجّع", "Refund")} ≈ {formatMoney(estimate, { lang })}
        </Button>
      }
    >
      <div className="grid gap-4">
        {!shiftOpen ? <p className="rounded-xl bg-warn-soft px-3 py-2 text-[13.5px] font-medium text-warn">{L("لازم وردية مفتوحة على الجهاز ده عشان المرتجع يتسجل في الدرج.", "Open a shift on this device first — the refund goes through its drawer.")}</p> : null}
        <div className="flex justify-end">
          <button type="button" className="text-[13px] font-semibold text-primary" onClick={() => setPicks(Object.fromEntries(sale.bill.lines.map((l) => [l.id, left.get(l.id) ?? 0])))}>
            {L("رجّع الكل", "Return everything")}
          </button>
        </div>
        <ul className="grid gap-1.5">
          {sale.bill.lines.map((l) => {
            const max = left.get(l.id) ?? 0;
            const q = picks[l.id] ?? 0;
            return (
              <li key={l.id} className={cn("flex items-center gap-3 rounded-xl border px-3 py-2", q ? "border-danger/40 bg-danger-soft/40" : "border-line", !max && "opacity-50")}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{loc(l.name)}</span>
                  <span className="num block text-[12px] text-muted">
                    {l.qty} × {formatMoney(l.unitPrice, { lang })} {max < l.qty ? `· ${L("اترجع", "returned")} ${l.qty - max}` : ""}
                  </span>
                </span>
                <span className="num flex items-center gap-1">
                  <button type="button" className="size-9 rounded-lg border border-line disabled:opacity-40" disabled={!q} onClick={() => setPicks((p) => ({ ...p, [l.id]: q - 1 }))} aria-label="-">
                    −
                  </button>
                  <span className="w-10 text-center">
                    {q}/{max}
                  </span>
                  <button type="button" className="size-9 rounded-lg border border-line disabled:opacity-40" disabled={q >= max} onClick={() => setPicks((p) => ({ ...p, [l.id]: q + 1 }))} aria-label="+">
                    +
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
        <div>
          <p className="mb-2 text-[13px] font-semibold text-ink-2">{L("طريقة الرد", "Refund to")}</p>
          <Segmented label={L("طريقة الرد", "Refund to")} value={method} onChange={setMethod} options={(["cash", "card", "wallet", "instapay"] as PaymentMethod[]).map((m) => ({ value: m, label: METHOD_LABEL[m][lang] }))} />
        </div>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={L("سبب المرتجع", "Reason for the refund")} aria-label={L("السبب", "Reason")} className="h-11 rounded-xl border border-line bg-surface px-3.5 outline-none focus:border-primary focus:shadow-[var(--sf-glow)]" />
      </div>
    </Dialog>
  );
}

