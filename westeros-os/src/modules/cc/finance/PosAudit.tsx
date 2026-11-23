/**
 * تدقيق البيع والورديات: every till shift with its Z figures, the drawer count and whether it reached the accounts;
 * and what needs a second look: discounts, lines cancelled after they went to the kitchen, and returns.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, BadgePercent, BookOpen, CircleDollarSign, RefreshCw, Scale, Undo2, XCircle } from "lucide-react";
import type { Shift } from "@/data/types";
import { useDb, useLive } from "@/data/hooks";
import { Badge, Button, Card, EmptyState, Segmented, Table, type Column } from "@/ui";
import { ExportButton } from "../ui";
import type { ZReportU } from "@/modules/pos/sale";
import { cairoDay } from "./journal";
import { useActor } from "./perms";
import { POS_FROM } from "./posSync";
import { SALES_DAY, salesOf } from "./sales";
import { useFilter, Tiles } from "./Summaries";
import { fmt, GroupTitle } from "./ui";
import { runShiftSync, useShiftSyncState } from "./useStockSync";
import { useFinance } from "./useFinance";

const time = (iso: string | null) => (iso ? new Intl.DateTimeFormat("ar-EG-u-nu-latn", { timeZone: "Africa/Cairo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—");
const inF = (day: string, branchId: string | null, f: { from: string | null; to: string | null; branchId: string | null }) => (!f.from || day >= f.from) && (!f.to || day <= f.to) && (!f.branchId || branchId === f.branchId);

interface Row { s: Shift; z: ZReportU | null; docId: string | null; entryId: string | null }
interface Check { id: string; kind: "discount" | "void" | "return"; at: string; ref: string; what: string; amount: number; reason: string; by: string }

export default function PosAudit() {
  const fin = useFinance();
  const db = useDb();
  const actor = useActor();
  const { f, bar } = useFilter(fin);
  const [tab, setTab] = useState<"shifts" | "checks">("shifts");
  const sync = useShiftSyncState();
  const [busy, setBusy] = useState(false);
  const shifts = useLive("shifts").data;
  const docs = useLive("finDocs", { where: { kind: SALES_DAY } }).data;
  const members = useLive("memberships").data;
  const checks = useLive("checks").data;
  const items = useLive("orderItems", { where: { status: "void" } }).data;
  const receipts = useLive("receipts", { where: { kind: "RC" } }).data;
  const who = (id: string | null) => (id ? members.find((m) => m.id === id)?.name ?? "—" : "—");

  const rows = useMemo<Row[]>(() => {
    const byShift = new Map(docs.filter((d) => d.status === "posted").map((d) => [salesOf(d).shiftId, d]));
    return shifts
      .filter((s) => inF(cairoDay(s.openedAt), s.branchId, f))
      .sort((a, b) => b.openedAt.localeCompare(a.openedAt))
      .map((s) => { const d = byShift.get(s.id); return { s, z: (s.zReport as unknown as ZReportU | null) ?? null, docId: d?.id ?? null, entryId: d ? salesOf(d).entryId : null }; });
  }, [shifts, docs, f]);

  const review = useMemo<Check[]>(() => {
    const out: Check[] = [];
    for (const c of checks) if (c.discount && c.status !== "void" && inF(cairoDay(c.closedAt ?? c.openedAt), c.branchId, f))
      out.push({ id: `d${c.id}`, kind: "discount", at: c.closedAt ?? c.openedAt, ref: c.receiptNo ?? "شيك مفتوح", what: c.discount.kind === "percent" ? `خصم ${c.discount.rate / 100}%` : "خصم مبلغ", amount: c.discountTotal, reason: c.discountReason ?? "", by: c.discountApprovedBy ? `بموافقة ${who(c.discountApprovedBy)}` : "" });
    for (const i of items) { const at = i.updatedAt ?? i.createdAt; if (inF(cairoDay(at), null, { ...f, branchId: null }))
      out.push({ id: `v${i.id}`, kind: "void", at, ref: i.firedAt ? "بعد الإرسال للمطبخ" : "قبل الإرسال", what: `${i.qty} × ${i.name.ar}`, amount: Math.round(i.qty * i.unitPrice), reason: i.voidReason ?? "", by: who(i.voidedBy) }); }
    for (const r of receipts) if (inF(cairoDay(r.issuedAt), r.branchId, f))
      out.push({ id: `r${r.id}`, kind: "return", at: r.issuedAt, ref: r.receiptNo, what: r.bill.lines.map((l) => `${l.qty} × ${l.name.ar}`).join("، "), amount: r.bill.payable, reason: "", by: who(r.issuedBy) });
    return out.sort((a, b) => b.at.localeCompare(a.at));
  }, [checks, items, receipts, f, members]); // eslint-disable-line react-hooks/exhaustive-deps

  const closed = rows.filter((r) => r.z);
  const sum = (g: (z: ZReportU) => number) => closed.reduce((s, r) => s + g(r.z!), 0);
  const diff = sum((z) => z.cash.difference ?? 0);
  const waiting = closed.filter((r) => !r.docId && cairoDay(r.s.openedAt) >= POS_FROM).length;

  const KIND = { discount: { label: "خصم", tone: "warn" as const, icon: <BadgePercent /> }, void: { label: "إلغاء صنف", tone: "danger" as const, icon: <XCircle /> }, return: { label: "مرتجع", tone: "neutral" as const, icon: <Undo2 /> } };

  const cols: Column<Row>[] = [
    { key: "z", header: "الوردية", cell: (r) => <div><div className="flex items-center gap-2 font-semibold"><span>{r.s.device}</span>{r.s.zNumber ? <span className="num text-[12.5px] text-muted" dir="ltr">Z{r.s.zNumber}</span> : null}</div><div className="num text-[12px] text-muted">{time(r.s.openedAt)} ← {time(r.s.closedAt)}</div></div> },
    { key: "who", header: "الكاشير", hideOnMobile: true, cell: (r) => who(r.s.openedBy) },
    { key: "sales", header: "المبيعات", align: "end", cell: (r) => r.z ? <div><div className="num font-semibold" dir="ltr">{fmt(r.z.sales.total)}</div><div className="text-[12px] text-muted"><span className="num">{r.z.sales.count}</span> فاتورة</div></div> : <span className="text-muted">—</span> },
    { key: "disc", header: "الخصومات", align: "end", hideOnMobile: true, cell: (r) => <span className="num" dir="ltr">{r.z ? fmt(r.z.sales.discount, "—") : "—"}</span> },
    { key: "ret", header: "المرتجعات", align: "end", hideOnMobile: true, cell: (r) => <span className="num" dir="ltr">{r.z ? fmt(r.z.returns.total, "—") : "—"}</span> },
    { key: "cash", header: "الدرج: المتوقع / المعدود", align: "end", hideOnMobile: true, cell: (r) => r.z ? <span className="num" dir="ltr">{fmt(r.z.cash.expected)} / {r.z.cash.counted == null ? "—" : fmt(r.z.cash.counted)}</span> : "—" },
    { key: "diff", header: "عجز / زيادة", align: "end", cell: (r) => { const d = r.z?.cash.difference ?? 0; return r.z ? <span className={`num font-semibold ${d < 0 ? "text-danger" : d > 0 ? "text-ok" : "text-muted"}`} dir="ltr">{fmt(d, "—")}</span> : "—"; } },
    { key: "st", header: "الحسابات", cell: (r) => r.s.status === "open" ? <Badge size="sm" tone="primary">مفتوحة</Badge>
      : r.entryId ? <Link to={`/finance/journal?entry=${r.entryId}`} className="inline-flex items-center gap-1 text-[13px] font-semibold text-brass hover:underline"><BookOpen className="size-3.5" />اترحلت</Link>
      : cairoDay(r.s.openedAt) < POS_FROM ? <Badge size="sm" tone="neutral">قبل الربط</Badge> : <Badge size="sm" tone="warn">مستنية الترحيل</Badge> },
  ];
  const ccols: Column<Check>[] = [
    { key: "k", header: "النوع", cell: (c) => <Badge size="sm" tone={KIND[c.kind].tone}>{KIND[c.kind].label}</Badge> },
    { key: "at", header: "الوقت", cell: (c) => <span className="num text-muted">{time(c.at)}</span> },
    { key: "ref", header: "الفاتورة", hideOnMobile: true, cell: (c) => <span className="num">{c.ref}</span> },
    { key: "what", header: "التفاصيل", cell: (c) => <div className="max-w-[320px]"><div className="truncate">{c.what}</div>{c.reason ? <div className="truncate text-[12px] text-muted">السبب: {c.reason}</div> : null}</div> },
    { key: "amt", header: "القيمة", align: "end", cell: (c) => <span className="num font-semibold" dir="ltr">{fmt(c.amount, "—")}</span> },
    { key: "by", header: "بواسطة", hideOnMobile: true, cell: (c) => <span className="text-muted">{c.by || "—"}</span> },
  ];

  const post = async () => {
    setBusy(true);
    try { await runShiftSync(db, actor); } finally { setBusy(false); }
  };

  return (
    <div className="grid gap-5">
      {bar}
      <Tiles title="الفترة" tiles={[
        { label: "صافي مبيعات الكاشير", value: fmt(sum((z) => z.sales.total) - sum((z) => z.returns.total)), sub: `${closed.length} وردية مقفولة`, icon: <CircleDollarSign /> },
        { label: "الخصومات", value: fmt(sum((z) => z.sales.discount)), icon: <BadgePercent />, tone: "warn" },
        { label: "المرتجعات", value: fmt(sum((z) => z.returns.total)), sub: `${sum((z) => z.returns.count)} مرتجع`, icon: <Undo2 /> },
        { label: diff < 0 ? "عجز الدرج" : "زيادة الدرج", value: fmt(diff), icon: <Scale />, tone: diff < 0 ? "danger" : diff > 0 ? "ok" : undefined },
      ]} />

      {waiting || sync.problems.length ? (
        <Card className="grid gap-2 border-warn/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-4 text-warn" />{waiting ? `${waiting} وردية مستنية الترحيل للحسابات` : "فيه ورديات ما اترحلتش"}</div>
            <Button size="sm" variant="secondary" icon={<RefreshCw />} loading={busy} onClick={post}>رحّل الورديات دلوقتي</Button>
          </div>
          {sync.problems.map((p) => <p key={p} className="text-[13px] text-muted">{p}</p>)}
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented label="العرض" value={tab} onChange={(v) => setTab(v as typeof tab)} options={[{ value: "shifts", label: "الورديات" }, { value: "checks", label: `الخصومات والإلغاءات والمرتجعات (${review.length})` }]} />
        {tab === "shifts"
          ? <ExportButton size="sm" file="ورديات الكاشير" head={["الجهاز", "رقم Z", "فتحت", "قفلت", "الكاشير", "المبيعات", "عدد الفواتير", "الخصومات", "المرتجعات", "المتوقع في الدرج", "المعدود", "عجز / زيادة", "الحسابات"]}
              rows={() => rows.map((r) => [r.s.device, r.s.zNumber ?? "", time(r.s.openedAt), time(r.s.closedAt), who(r.s.openedBy), (r.z?.sales.total ?? 0) / 100000, r.z?.sales.count ?? 0, (r.z?.sales.discount ?? 0) / 100000, (r.z?.returns.total ?? 0) / 100000, (r.z?.cash.expected ?? 0) / 100000, r.z?.cash.counted == null ? "" : r.z.cash.counted / 100000, (r.z?.cash.difference ?? 0) / 100000, r.s.status === "open" ? "مفتوحة" : r.docId ? "اترحلت" : "مستنية"])} />
          : <ExportButton size="sm" file="تدقيق البيع" head={["النوع", "الوقت", "الفاتورة", "التفاصيل", "السبب", "القيمة", "بواسطة"]}
              rows={() => review.map((c) => [KIND[c.kind].label, time(c.at), c.ref, c.what, c.reason, c.amount / 100000, c.by])} />}
      </div>

      {tab === "shifts" ? (
        rows.length ? <Card className="overflow-hidden"><Table columns={cols} rows={rows} rowKey={(r) => r.s.id} /></Card>
          : <Card><EmptyState compact icon={<Scale />} title="لا توجد ورديات في الفترة دي" body="الوردية بتتفتح من الكاشير، ولما تتقفل بتترحل للحسابات لوحدها." /></Card>
      ) : (
        <>
          <GroupTitle>كل خصم وإلغاء ومرتجع في الفترة</GroupTitle>
          {review.length ? <Card className="overflow-hidden"><Table columns={ccols} rows={review} rowKey={(c) => c.id} /></Card>
            : <Card><EmptyState compact icon={<BadgePercent />} title="لا يوجد خصم أو إلغاء أو مرتجع في الفترة دي" /></Card>}
        </>
      )}
    </div>
  );
}
