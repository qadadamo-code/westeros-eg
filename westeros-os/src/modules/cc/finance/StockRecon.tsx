/** مطابقة المخزون: قيمة المخزون في المخازن ضد رصيد حسابات المخزون في الشجرة، وبضاعة بالطريق. */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, RefreshCw, Scale, TriangleAlert } from "lucide-react";
import { useDb, useLive } from "@/data/hooks";
import { cn } from "@/lib/cn";
import { Button, Card, Input, useToast } from "@/ui";
import { fmtAt, listsOf } from "../lib";
import { ExportButton } from "../ui";
import { cairoDay } from "./journal";
import { useActor, useFinPerms } from "./perms";
import { COSTING } from "./Settings";
import { inTransit, postedMoves, postRevaluation, stockRecon } from "./sync";
import { Amount, Confirm, fmt, PrintButton, printTable, today } from "./ui";
import { useFinance } from "./useFinance";
import { runSync, useSyncState } from "./useStockSync";

export default function StockRecon() {
  const fin = useFinance();
  const db = useDb();
  const nav = useNavigate();
  const { toast } = useToast();
  const actor = useActor();
  const can = useFinPerms().has("journal.approve");
  const sync = useSyncState();
  const moves = useLive("stockMoves").data;
  const itemRows = useLive("stockItems").data;
  const locRows = useLive("storageLocations").data;
  const lists = listsOf(useLive("mfgSettings").data[0]);
  const [to, setTo] = useState(today());
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const items = useMemo(() => new Map(itemRows.map((i) => [i.id, i])), [itemRows]);
  const locations = useMemo(() => new Map(locRows.map((l) => [l.id, l])), [locRows]);
  const rows = useMemo(() => stockRecon({ accounts: fin.accounts, entries: fin.entries, settings: fin.settings, moves, items, locations, lists, to }), [fin.accounts, fin.entries, fin.settings, moves, items, locations, lists, to]);
  const sum = rows.reduce((s, r) => ({ ledger: s.ledger + r.ledger, stock: s.stock + r.stock, recorded: s.recorded + r.recorded, diff: s.diff + r.diff }), { ledger: 0, stock: 0, recorded: 0, diff: 0 });
  const start = fin.settings.startDate;
  const pending = useMemo(() => { if (!start) return 0; const done = postedMoves(fin.entries); return moves.filter((m) => !done.has(m.id) && cairoDay(m.at) >= start).length; }, [moves, fin.entries, start]);
  const transit = useMemo(() => inTransit(moves).filter((t) => !start || cairoDay(t.at) >= start), [moves, start]);
  const late = (at: string) => (Date.now() - Date.parse(at)) / 86_400_000 > fin.settings.transitDays;
  const off = rows.some((r) => r.diff);
  const method = COSTING.find((c) => c.id === fin.settings.costing)!.label;
  const head = ["الكود", "حساب المخزون", "رصيد الدفتر", `قيمة المخازن (${method})`, "الفرق", "القيمة المسجلة بالمخازن", "عدد الأصناف"];
  const adjust = async () => {
    setBusy(true);
    try { const e = await postRevaluation(db, rows, to, actor); toast({ tone: "success", title: e ? "تم ترحيل قيد التسوية" : "لا يوجد فرق" }); setAsk(false); } catch (e) { toast({ tone: "error", title: "تعذر الترحيل", description: String((e as Error).message ?? e), duration: 9000 }); } finally { setBusy(false); }
  };
  if (!start) return <p className="rounded-xl border border-warn/50 px-3 py-3 text-[14px] text-warn">حدد تاريخ بداية القيود التلقائية من الإعدادات أولا، وبعدها تظهر المطابقة.</p>;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <Input label="حتى تاريخ" type="date" dir="ltr" className="w-44" value={to} onChange={(e) => setTo(e.target.value || today())} />
        <Button variant="secondary" icon={<RefreshCw />} loading={sync.busy} onClick={() => runSync(db)}>ترحيل الحركات الآن</Button>
        {can && off && !pending && to === today() ? <Button icon={<Scale />} onClick={() => setAsk(true)}>قيد تسوية الفرق</Button> : null}
        <span className="flex-1" />
        <ExportButton file="مطابقة-المخزون" head={head} rows={() => rows.map((r) => [r.account.code, r.account.name.ar, r.ledger / 100000, r.stock / 100000, r.diff / 100000, r.recorded / 100000, r.items])} />
        <PrintButton onClick={() => printTable("مطابقة المخزون", `حتى ${to.split("-").reverse().join("/")} · ${method}`, head, rows.map((r) => [r.account.code, r.account.name.ar, { text: fmt(r.ledger), align: "end" as const }, { text: fmt(r.stock), align: "end" as const }, { text: fmt(r.diff), align: "end" as const }, { text: fmt(r.recorded), align: "end" as const }, r.items]), ["", "الإجمالي", { text: fmt(sum.ledger), align: "end" }, { text: fmt(sum.stock), align: "end" }, { text: fmt(sum.diff), align: "end" }, { text: fmt(sum.recorded), align: "end" }, ""])} />
      </div>
      <div className={cn("flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[14px] font-semibold", pending || off ? "border-warn/50 text-warn" : "border-ok/40 text-ok")}>
        {pending || off ? <TriangleAlert className="size-4.5" /> : <CheckCircle2 className="size-4.5" />}
        {pending ? `يوجد ${pending} حركة مخزنية لم تترحل بعد. اضغط ترحيل الحركات الآن.` : off ? "يوجد فرق بين المخازن والدفتر" : "المخازن والدفتر متطابقين"}
      </div>
      {sync.problems.length ? <ul className="grid gap-1 rounded-xl border border-danger/50 px-3 py-2.5 text-[14px] text-danger">{sync.problems.map((p) => <li key={p}>{p}</li>)}</ul> : null}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto thin-scrollbar">
          <table className="w-full text-[14px]">
            <thead><tr className="text-[12.5px] text-muted">{head.map((h, i) => <th key={h} className={cn("border-b border-line px-3 py-2.5 font-semibold", i > 1 ? "text-end" : "text-start")}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.account.id} className="cursor-pointer border-t border-line/60 hover:bg-surface-2" onClick={() => nav(`/finance/ledger?account=${r.account.id}`)}>
                  <td className="num px-3 py-2 text-muted" dir="ltr">{r.account.code}</td>
                  <td className="px-3 py-2">{r.account.name.ar}</td>
                  <td className="px-3 py-2 text-end"><Amount value={r.ledger} zero="0.00" /></td>
                  <td className="px-3 py-2 text-end"><Amount value={r.stock} zero="0.00" /></td>
                  <td className={cn("px-3 py-2 text-end font-bold", r.diff ? "text-danger" : "text-ok")}><Amount value={r.diff} zero="0.00" /></td>
                  <td className="px-3 py-2 text-end text-muted"><Amount value={r.recorded} zero="0.00" /></td>
                  <td className="num px-3 py-2 text-end text-muted">{r.items}</td>
                </tr>
              ))}
              {!rows.length ? <tr><td colSpan={head.length} className="px-3 py-8 text-center text-muted">لا يوجد مخزون ولا حركات على حسابات المخزون</td></tr> : null}
              <tr className="border-t border-line bg-surface-2 font-bold"><td className="px-3 py-2.5" colSpan={2}>الإجمالي</td><td className="px-3 py-2.5 text-end"><Amount value={sum.ledger} zero="0.00" /></td><td className="px-3 py-2.5 text-end"><Amount value={sum.stock} zero="0.00" /></td><td className="px-3 py-2.5 text-end"><Amount value={sum.diff} zero="0.00" /></td><td className="px-3 py-2.5 text-end"><Amount value={sum.recorded} zero="0.00" /></td><td /></tr>
            </tbody>
          </table>
        </div>
      </Card>
      <Card className="grid gap-2 p-4">
        <h2 className="text-[16px] font-bold">بضاعة بالطريق</h2>
        {transit.length ? (
          <ul className="grid gap-1.5 text-[14px]">
            {transit.map((t) => (
              <li key={t.id} className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border px-3 py-2", late(t.at) ? "border-danger/50" : "border-line")}>
                <span>خرجت من {locations.get(t.locationId)?.name.ar ?? "—"}</span>
                <span className="num text-muted">{fmtAt(t.at)}</span>
                <span className="flex-1" />
                <Amount value={t.value} />
                {late(t.at) ? <span className="font-semibold text-danger">متأخرة أكثر من {fin.settings.transitDays} يوم</span> : null}
              </li>
            ))}
          </ul>
        ) : <p className="text-[14px] text-muted">لا توجد بضاعة خرجت من مخزن ولم تستلم.</p>}
      </Card>
      <Confirm open={ask} onClose={() => setAsk(false)} onConfirm={adjust} loading={busy} title="قيد تسوية تقييم المخزون" confirmLabel="ترحيل قيد التسوية"
        description={`سيترحل قيد تسوية بتاريخ ${to.split("-").reverse().join("/")} يجعل رصيد كل حساب مخزون يساوي قيمة مخازنه، والفرق (${fmt(Math.abs(sum.diff))} ج.م) على حساب فروق أسعار المخزون.`} />
    </div>
  );
}
