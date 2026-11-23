/** ثوابت النظام > الحسابات: the system's currency, and the other currencies accounts may be kept in with their exchange rate. */
import { useState } from "react";
import { Banknote, Coins, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { useDb } from "@/data/hooks";
import { Button, Card, CardHeader, IconButton, Input, Select, Switch, useToast } from "@/ui";
import { baseOf, CURRENCY_LIST, currencyName, currencySymbol, denomsOf, parseDenom, parseRate, rateText } from "../finance/currency";
import { saveSettings } from "../finance/ops";
import { useFinance } from "../finance/useFinance";
import { updateRates, useAutoRates } from "../finance/useRates";

export default function FinanceConstants({ readOnly }: { readOnly: boolean }) {
  const fin = useFinance();
  const db = useDb();
  const { toast } = useToast();
  const s = fin.settings;
  const base = baseOf(s);
  const list = (s.currencies ?? []).filter((c) => c.code !== base);
  const usedBy = (code: string) => fin.accounts.filter((a) => a.currency === code).length;
  // once anything is booked the books are kept in that currency
  const booked = fin.entries.some((e) => e.status === "posted");
  const [add, setAdd] = useState("");
  const [denom, setDenom] = useState("");
  const [busy, setBusy] = useState(false);
  useAutoRates(db, s, !fin.loading && !readOnly);
  const auto = s.ratesAuto !== false;
  const denoms = denomsOf(s);
  const at = s.ratesAt ? new Date(s.ratesAt).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Cairo" }) : null;
  const refresh = async () => {
    setBusy(true);
    try { const n = await updateRates(db, s); toast({ tone: "success", title: n ? `اتحدث سعر ${n} عملة بسعر اليوم` : "ما فيش عملات تتحدث" }); }
    catch { toast({ tone: "error", title: "تعذر جلب أسعار اليوم", description: "اتأكد من النت وجرب تاني، أو اكتب السعر بإيدك" }); }
    finally { setBusy(false); }
  };
  const addDenom = async () => {
    const d = parseDenom(denom);
    if (!d) { toast({ tone: "error", title: "اكتب فئة صحيحة، زي 5 أو 0.5" }); return; }
    if (denoms.includes(d)) { setDenom(""); return; }
    await save({ denominations: [...denoms, d].sort((a, b) => a - b) }, `تمت إضافة فئة ${d}`);
    setDenom("");
  };
  const save = async (patch: Parameters<typeof saveSettings>[1], title = "تم الحفظ") => {
    try { await saveSettings(db, patch); toast({ tone: "success", title }); } catch (e) { toast({ tone: "error", title: "تعذر الحفظ", description: String((e as Error)?.message ?? e) }); }
  };
  const addable = CURRENCY_LIST.filter((c) => c.code !== base && !list.some((x) => x.code === c.code));
  return (
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader icon={<Coins />} title="العملة الأساسية" subtitle="العملة اللي بتتسجل بيها كل المبالغ والقيود والتقارير في السيستم" />
        <div className="grid gap-3 px-5 pb-5">
          <Select label="العملة الأساسية" value={base} disabled={readOnly || booked}
            options={CURRENCY_LIST.map((c) => ({ value: c.code, label: `${c.name} (${c.code})` }))}
            onChange={(e) => e.target.value !== base && save({ currency: e.target.value, currencies: list.filter((c) => c.code !== e.target.value) }, `العملة الأساسية: ${currencyName(e.target.value)}`)}
            hint={booked ? "فيه قيود متسجلة بالفعل، فالعملة الأساسية ثابتة عشان الأرقام ما تتلخبطش" : "تقدر تغيرها لحد أول قيد يتسجل"} />
          <p className="text-[13px] text-muted">سعر كل عملة تانية بيتكتب بالعملة الأساسية، والسند بيبدأ من آخر سعر اتكتب. أي حساب جديد بياخد العملة الأساسية، وتقدر تغير عملة حساب معين من شجرة الحسابات لما تعدله.</p>
        </div>
      </Card>

      <Card>
        <CardHeader icon={<Coins />} title="العملات الأخرى وسعر الصرف" subtitle="التحويل بين حسابين بعملتين مختلفتين بيطلب سعر الصرف" />
        <ul className="grid gap-2 px-5 pb-3">
          {list.map((c) => {
            const n = usedBy(c.code);
            return (
              <li key={c.code} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2 rounded-xl border border-line p-3">
                <div className="grid gap-0.5 pb-1.5"><span className="font-bold">{currencyName(c.code)}</span><span className="num text-[12.5px] text-muted" dir="ltr">{c.code}{n ? ` · ${n} حساب` : ""}</span></div>
                <Input label={`سعر 1 ${c.code} بالـ${currencySymbol(base)}`} dir="ltr" inputMode="decimal" disabled={readOnly} key={`${c.code}-${c.rate}`} defaultValue={rateText(c.rate)}
                  onBlur={(e) => { const r = parseRate(e.target.value); if (!r) { e.target.value = rateText(c.rate); return; } if (r !== c.rate) void save({ currencies: list.map((x) => (x.code === c.code ? { ...x, rate: r } : x)) }, `سعر ${c.code}: ${rateText(r)}`); }} />
                <IconButton label={n ? "عملة حسابات موجودة، غيرها من الحسابات الأول" : "حذف"} disabled={readOnly || !!n} onClick={() => save({ currencies: list.filter((x) => x.code !== c.code) }, `تم حذف ${currencyName(c.code)}`)}><Trash2 /></IconButton>
              </li>
            );
          })}
          {list.length ? null : <li className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-[14px] text-muted">كل الحسابات بالعملة الأساسية. أضف عملة لو عندك خزينة أو بنك بعملة تانية.</li>}
        </ul>
        {list.length ? (
          <div className="mx-5 mb-3 grid gap-2 rounded-xl bg-surface-2 p-3">
            <Switch checked={auto} disabled={readOnly} onChange={(v) => save({ ratesAuto: v }, v ? "الأسعار هتتحدث كل يوم تلقائي" : "الأسعار هتفضل زي ما تكتبها")}
              label="تحديث سعر الصرف تلقائي كل يوم" description="بياخد سعر اليوم مجاناً من مصدر أسعار عام، أول ما حد يفتح الحسابات أو الثوابت في اليوم" />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[12.5px] text-muted">{at ? `آخر تحديث تلقائي: ${at}` : "لسه ما اتحدثتش تلقائي"}</span>
              <Button size="sm" variant="outline" icon={<RefreshCw className={busy ? "animate-spin" : undefined} />} disabled={readOnly || busy} onClick={refresh}>سعر اليوم دلوقتي</Button>
            </div>
          </div>
        ) : null}
        <div className="flex items-end gap-2 px-5 pb-5">
          <div className="min-w-0 flex-1"><Select label="إضافة عملة" className="w-full" value={add} disabled={readOnly} onChange={(e) => setAdd(e.target.value)} options={[{ value: "", label: "اختر العملة" }, ...addable.map((c) => ({ value: c.code, label: `${c.name} (${c.code})` }))]} /></div>
          <Button variant="outline" icon={<Plus />} disabled={readOnly || !add} onClick={async () => { await save({ currencies: [...list, { code: add, rate: 0 }] }, `تمت إضافة ${currencyName(add)}، اكتب سعرها`); setAdd(""); }}>إضافة</Button>
        </div>
      </Card>

      <Card>
        <CardHeader icon={<Banknote />} title={`فئات ${currencyName(base)}`} subtitle="الفلوس الورقية والمعدنية اللي بتتعامل بيها، وبتستخدم في عدّ النقدية في الخزينة" />
        <div className="flex flex-wrap gap-2 px-5 pb-3">
          {denoms.map((d) => (
            <span key={d} className="inline-flex h-9 items-center gap-1 rounded-full border border-line bg-surface ps-3 pe-1 text-[14px] font-semibold">
              <span className="num" dir="ltr">{d}</span>
              <button type="button" aria-label={`حذف فئة ${d}`} disabled={readOnly || denoms.length <= 1} onClick={() => save({ denominations: denoms.filter((x) => x !== d) }, `تم حذف فئة ${d}`)}
                className="grid size-7 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-40 [&_svg]:size-3.5"><X /></button>
            </span>
          ))}
        </div>
        <div className="flex items-end gap-2 px-5 pb-5">
          <div className="min-w-0 flex-1"><Input label="إضافة فئة" dir="ltr" inputMode="decimal" placeholder="1000" value={denom} disabled={readOnly} onChange={(e) => setDenom(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void addDenom(); }} /></div>
          <Button variant="outline" icon={<Plus />} disabled={readOnly || !denom} onClick={addDenom}>إضافة</Button>
        </div>
      </Card>
    </div>
  );
}
