/** الإعدادات المالية: نقطة البداية، طريقة تكلفة المخزون، اعتماد القيود، وربط الحسابات بأقسام السيستم. */
import { useMemo, useState } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { useDb, useLive } from "@/data/hooks";
import type { FinCosting, FinLinkRule, FinSettingsData } from "@/data/financeTypes";
import { Button, Card, Input, Segmented, Select, Switch, useToast } from "@/ui";
import { allStoreTypes, lineUnit, listsOf } from "../lib";
import { DEFAULT_TREE } from "./chart";
import { saveSettings } from "./ops";
import { useFinPerms } from "./perms";
import { STOCK_KEYS } from "./posting";
import { STOCK_SOURCE } from "./sync";
import { AccountSelect, fromText, toText } from "./ui";
import { useFinance } from "./useFinance";
import { runSync, useSyncState } from "./useStockSync";
import { fmtAt } from "../lib";

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
export const COSTING: { id: FinCosting; label: string; hint: string }[] = [
  { id: "last", label: "آخر سعر شراء", hint: "المنصرف يتسعر بآخر سعر دخل المخزن. عند دخول سعر جديد يعاد تسعير الرصيد الموجود والفرق يذهب لحساب فروق أسعار المخزون." },
  { id: "average", label: "المتوسط المرجح", hint: "المنصرف يتسعر بمتوسط تكلفة الرصيد الموجود. نفس القيمة المسجلة في أرصدة المخازن." },
  { id: "fifo", label: "الوارد أولا يصرف أولا", hint: "المنصرف يأخذ تكلفة أقدم كمية ما زالت في المخزن." },
  { id: "standard", label: "التكلفة المعيارية", hint: "كل الحركات بتكلفة ثابتة تحددها لكل صنف، وفرق السعر الفعلي يذهب لحساب فروق أسعار المخزون." },
];
/** every posting key, labelled by the account the ready tree gives it */
export const KEY_LABEL: Record<string, string> = Object.fromEntries(DEFAULT_TREE.filter((x) => x.key).map((x) => [x.key!, x.ar]));
const GROUPS: { title: string; keys: (k: string) => boolean }[] = [
  { title: "المخزون والتصنيع", keys: (k) => k.startsWith("stock.") || k.startsWith("waste.") || k.startsWith("count.") || ["staff.meals", "mfg.variance", "price.variance", "purchases.accrued", "opening"].includes(k) },
  { title: "الخزائن والبنوك", keys: (k) => k.startsWith("cash.") || k === "banks" || k.startsWith("wallet") || k.startsWith("aggregator.") },
  { title: "المبيعات والعملاء", keys: (k) => k.startsWith("sales.") || k.startsWith("cogs.") || k.startsWith("customer") || k === "tips.payable" || k === "income.scrap" },
  { title: "المشتريات والموردين والضرائب", keys: (k) => ["suppliers", "discount.received"].includes(k) || k.startsWith("vat.") || k.startsWith("tax.") },
  { title: "الموظفين والرواتب", keys: (k) => ["staff.advances", "salaries.payable", "salaries", "overtime", "bonuses", "social.insurance", "social.employer"].includes(k) },
  { title: "المصروفات والأصول", keys: (k) => k.startsWith("exp.") || k.startsWith("asset.") || ["prepaid", "accrued"].includes(k) },
  { title: "حقوق الملكية والإقفال", keys: (k) => ["capital", "partners", "drawings", "retained", "year.profit", "loans"].includes(k) },
];
const SCOPES: { id: FinLinkRule["scope"]; label: string }[] = [{ id: "storeType", label: "نوع المخزن" }, { id: "category", label: "فئة الخام" }, { id: "location", label: "مخزن بعينه" }, { id: "item", label: "صنف بعينه" }];
const RULE_KEYS = [...STOCK_KEYS, "waste.store", "count.loss", "count.gain", "staff.meals", "cogs.raw", "cogs.packaging"];

export default function Settings() {
  const fin = useFinance();
  const db = useDb();
  const { toast } = useToast();
  const can = useFinPerms().has("settings");
  const s = fin.settings;
  const sync = useSyncState();
  const items = useLive("stockItems").data;
  const locations = useLive("storageLocations").data;
  const lists = listsOf(useLive("mfgSettings").data[0]);
  const started = fin.entries.some((e) => e.sourceType?.startsWith(STOCK_SOURCE));
  const [rule, setRule] = useState<FinLinkRule>({ key: "stock.raw", scope: "storeType", id: "", account: "" });
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"general" | "costing" | "links" | "rules">("general");
  const [grp, setGrp] = useState("");
  const save = async (patch: Partial<FinSettingsData>, title = "تم الحفظ") => {
    try { await saveSettings(db, patch); toast({ tone: "success", title }); } catch (e) { toast({ tone: "error", title: "تعذر الحفظ", description: String((e as Error).message ?? e) }); }
  };
  const keys = useMemo(() => [...new Set([...Object.keys(KEY_LABEL), ...Object.keys(s.links)])], [s.links]);
  const grouped = useMemo(() => {
    const left = new Set(keys);
    const out = GROUPS.map((g) => ({ title: g.title, keys: keys.filter((k) => g.keys(k) && left.delete(k)) }));
    return [...out, { title: "أخرى", keys: [...left] }].filter((g) => g.keys.length);
  }, [keys]);
  const idOf = (code: string | undefined) => fin.ix.byCode.get(code ?? "")?.id ?? "";
  const scopeOptions = (scope: FinLinkRule["scope"]) =>
    scope === "storeType" ? allStoreTypes().map((t) => ({ value: t.id, label: t.name }))
      : scope === "category" ? lists.rawCategories.map((c) => ({ value: c, label: c }))
        : scope === "location" ? locations.map((l) => ({ value: l.id, label: l.name.ar }))
          : items.map((i) => ({ value: i.id, label: `${i.sku} · ${i.name.ar}` }));
  const scopeName = (r: FinLinkRule) => scopeOptions(r.scope).find((o) => o.value === r.id)?.label ?? "—";
  const stdRows = useMemo(() => items.filter((i) => i.active && (!q.trim() || i.name.ar.includes(q.trim()) || i.sku.includes(q.trim()))).slice(0, 60), [items, q]);

  const openGroup = grouped.find((g) => g.title === grp) ?? grouped[0];
  return (
    <div className="grid gap-4">
      <Segmented label="الإعدادات" className="max-sm:grid max-sm:w-full max-sm:grid-cols-2 sm:w-fit" value={tab} onChange={setTab} options={[{ value: "general", label: "السنة والبداية" }, { value: "costing", label: "تكلفة المخزون" }, { value: "links", label: "ربط الحسابات" }, { value: "rules", label: "ربط خاص" }]} />
      {tab === "general" ? <Card className="grid gap-4 p-4">
        <h2 className="text-[16px] font-bold">السنة المالية ونقطة البداية</h2>
        <div className="fin-fill grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select label="بداية السنة المالية" className="w-44" disabled={!can} value={String(s.yearStartMonth)} options={MONTHS.map((m, i) => ({ value: String(i + 1), label: `1 ${m}` }))} onChange={(e) => save({ yearStartMonth: Number(e.target.value) })} />
          <Input label="تاريخ بداية القيود التلقائية" type="date" dir="ltr" className="w-52" disabled={!can || started} value={s.startDate ?? ""} onChange={(e) => save({ startDate: e.target.value || null })}
            hint={started ? "بدأ الترحيل من هذا التاريخ، لا يتغير بعد أول قيد تلقائي" : "حركات المخازن والتصنيع من هذا اليوم تعمل قيودها لوحدها. ما قبله يدخل رصيد افتتاحي للمخزون مرة واحدة."} />
          <Input label="اعتماد القيد اليدوي فوق مبلغ (ج.م)" dir="ltr" inputMode="decimal" className="w-56" disabled={!can} defaultValue={toText(s.approvalLimit)} key={`lim-${s.approvalLimit}`} onBlur={(e) => { const v = fromText(e.target.value); if ((v || null) !== s.approvalLimit) void save({ approvalLimit: v || null }); }} hint="اتركه فارغ: كل القيود تترحل مباشرة" />
          <Input label="تنبيه بضاعة بالطريق بعد (يوم)" dir="ltr" inputMode="numeric" className="w-48" disabled={!can} defaultValue={String(s.transitDays)} key={`tr-${s.transitDays}`} onBlur={(e) => { const v = Math.max(0, Math.round(Number(e.target.value) || 0)); if (v !== s.transitDays) void save({ transitDays: v }); }} />
        </div>
        {!s.startDate ? <p className="rounded-xl border border-warn/50 px-3 py-2.5 text-[14px] text-warn">لم يتحدد تاريخ بداية. القيود التلقائية متوقفة حتى تختار التاريخ.</p> : null}
        <div className="flex flex-wrap items-center gap-3 border-t border-line/60 pt-3">
          <Button variant="secondary" icon={<RefreshCw />} loading={sync.busy} disabled={!s.startDate} onClick={async () => { const r = await runSync(db); toast({ tone: r.problems.length ? "error" : "success", title: r.problems.length ? "يوجد حركات لم تترحل" : r.posted ? `تم ترحيل ${r.posted} قيد` : "كل الحركات مرحلة", description: r.problems[0] }); }}>ترحيل حركات المخازن الآن</Button>
          <span className="text-[13.5px] text-muted">{sync.at ? `آخر ترحيل ${fmtAt(sync.at)}${sync.posted ? `، ${sync.posted} قيد جديد` : ""}` : "الترحيل يعمل لوحده مع كل حركة"}</span>
        </div>
        {sync.problems.length ? <ul className="grid gap-1 rounded-xl border border-danger/50 px-3 py-2.5 text-[14px] text-danger">{sync.problems.map((p) => <li key={p}>{p}</li>)}</ul> : null}
      </Card> : null}

      {tab === "costing" ? <Card className="grid gap-3 p-4">
        <h2 className="text-[16px] font-bold">طريقة تكلفة المخزون في القيود</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {COSTING.map((c) => (
            <button key={c.id} type="button" role="radio" aria-checked={s.costing === c.id} disabled={!can} onClick={() => s.costing !== c.id && save({ costing: c.id }, `طريقة التكلفة: ${c.label}`)}
              className={`rounded-xl border px-3.5 py-3 text-start transition-colors ${s.costing === c.id ? "border-primary bg-primary/10" : "border-line hover:bg-surface-2"}`}>
              <span className="block font-bold">{c.label}</span>
              <span className="block text-[13px] text-muted">{c.hint}</span>
            </button>
          ))}
        </div>
        <p className="text-[13px] text-muted">تغيير الطريقة يطبق على الحركات الجديدة فقط، والقيود القديمة تبقى كما هي. الفرق في قيمة الرصيد يظهر في مطابقة المخزون وتسويه بقيد واحد.</p>
        <Switch checked={s.stockByWarehouse} disabled={!can} onChange={(v) => save({ stockByWarehouse: v })} label="حساب مخزون مستقل لكل مخزن" description="كل مخزن يأخذ حساب فرعي تلقائيا تحت حساب المخزون، فيظهر رصيد كل مخزن في الشجرة." />
        {s.costing === "standard" ? (
          <div className="grid gap-2 border-t border-line/60 pt-3">
            <div className="flex flex-wrap items-end gap-2">
              <Input label="التكلفة المعيارية للأصناف" placeholder="بحث بالاسم أو الكود" className="w-64" value={q} onChange={(e) => setQ(e.target.value)} />
              {can ? <Button variant="secondary" onClick={() => save({ standardCosts: { ...Object.fromEntries(items.filter((i) => i.lastCost > 0).map((i) => [i.id, i.lastCost])), ...s.standardCosts } }, "تم ملء الفارغ من آخر سعر شراء")}>ملء الفارغ من آخر سعر شراء</Button> : null}
            </div>
            <div className="max-h-80 overflow-auto rounded-xl border border-line thin-scrollbar">
              <table className="w-full text-[14px]">
                <thead><tr className="bg-surface-2 text-[12.5px] text-muted"><th className="px-3 py-2 text-start">الكود</th><th className="px-3 py-2 text-start">الصنف</th><th className="px-3 py-2 text-start">الوحدة</th><th className="w-44 px-3 py-2 text-start">التكلفة المعيارية (ج.م)</th></tr></thead>
                <tbody>
                  {stdRows.map((i) => {
                    const u = lineUnit(i);
                    const cur = s.standardCosts[i.id];
                    return (
                      <tr key={i.id} className="border-t border-line/60">
                        <td className="num px-3 py-1.5 text-muted" dir="ltr">{i.sku}</td><td className="px-3 py-1.5">{i.name.ar}</td><td className="px-3 py-1.5 text-muted">{u.label}</td>
                        <td className="px-3 py-1.5"><Input aria-label={`تكلفة ${i.name.ar}`} dir="ltr" inputMode="decimal" disabled={!can} key={`${i.id}-${cur}`} defaultValue={cur == null ? "" : toText(Math.round(cur * u.factor))}
                          onBlur={(e) => { const v = e.target.value.trim() ? fromText(e.target.value) / u.factor : null; if ((v ?? null) === (cur ?? null)) return; const next = { ...s.standardCosts }; if (v == null) delete next[i.id]; else next[i.id] = v; void save({ standardCosts: next }); }} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[13px] text-muted">صنف بدون تكلفة معيارية يتحرك بالمتوسط المرجح.</p>
          </div>
        ) : null}
      </Card> : null}

      {tab === "links" ? <Card className="grid gap-4 p-4">
        <div>
          <h2 className="text-[16px] font-bold">ربط الحسابات</h2>
          <p className="text-[13.5px] text-muted">الحساب الذي ترحل عليه كل حركة في السيستم. يأتي معبأ من الشجرة الجاهزة وتغير أي ربط منه.</p>
        </div>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="مجموعات الربط">
          {grouped.map((g) => {
            const on = g.title === openGroup?.title;
            return <button key={g.title} type="button" role="tab" aria-selected={on} onClick={() => setGrp(g.title)} className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[13.5px] font-semibold transition-colors ${on ? "bg-brass-soft text-brass-text ring-1 ring-brass/40" : "bg-surface-2 text-muted hover:text-ink"}`}>{g.title}<span className="num text-[11.5px] opacity-70">{g.keys.length}</span></button>;
          })}
        </div>
        {openGroup ? (
          <div className="grid gap-x-3 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {openGroup.keys.map((k) => (
              <AccountSelect key={k} fin={fin} label={KEY_LABEL[k] ?? k} leaf={false} placeholder="غير مربوط" value={idOf(s.links[k])}
                onChange={(id) => { if (!can) return; const code = fin.byId.get(id)?.code; void save({ links: { ...s.links, [k]: code ?? "" } }); }} />
            ))}
          </div>
        ) : null}
      </Card> : null}

      {tab === "rules" ? <Card className="grid gap-3 p-4">
        <div>
          <h2 className="text-[16px] font-bold">ربط خاص</h2>
          <p className="text-[13.5px] text-muted">حساب مختلف لنوع مخزن أو فئة خام أو مخزن أو صنف بعينه. الأدق يغلب: الصنف ثم المخزن ثم الفئة ثم نوع المخزن ثم الربط العام.</p>
        </div>
        {s.rules.length ? (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-[14px]">
              <thead><tr className="bg-surface-2 text-[12.5px] text-muted"><th className="px-3 py-2 text-start">الحركة</th><th className="px-3 py-2 text-start">على</th><th className="px-3 py-2 text-start">الحساب</th><th /></tr></thead>
              <tbody>
                {s.rules.map((r, i) => (
                  <tr key={i} className="border-t border-line/60">
                    <td className="px-3 py-2">{KEY_LABEL[r.key] ?? r.key}</td>
                    <td className="px-3 py-2">{SCOPES.find((x) => x.id === r.scope)?.label}: {scopeName(r)}</td>
                    <td className="px-3 py-2">{fin.label(idOf(r.account))}</td>
                    <td className="px-3 py-2 text-end">{can ? <Button size="sm" variant="ghost" icon={<Trash2 />} aria-label="حذف الربط" onClick={() => save({ rules: s.rules.filter((_, j) => j !== i) }, "تم حذف الربط")} /> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {can ? (
          <div className="flex flex-wrap items-end gap-2">
            <Select label="الحركة" className="w-56" value={rule.key} options={RULE_KEYS.map((k) => ({ value: k, label: KEY_LABEL[k] ?? k }))} onChange={(e) => setRule({ ...rule, key: e.target.value })} />
            <Select label="على" className="w-40" value={rule.scope} options={SCOPES.map((x) => ({ value: x.id, label: x.label }))} onChange={(e) => setRule({ ...rule, scope: e.target.value as FinLinkRule["scope"], id: "" })} />
            <Select label="اختر" className="w-60" value={rule.id} options={[{ value: "", label: "اختر" }, ...scopeOptions(rule.scope)]} onChange={(e) => setRule({ ...rule, id: e.target.value })} />
            <AccountSelect fin={fin} label="الحساب" className="w-72" value={idOf(rule.account)} onChange={(id) => setRule({ ...rule, account: fin.byId.get(id)?.code ?? "" })} />
            <Button icon={<Plus />} disabled={!rule.id || !rule.account} onClick={async () => { await save({ rules: [...s.rules.filter((r) => !(r.key === rule.key && r.scope === rule.scope && r.id === rule.id)), rule] }, "تم إضافة الربط"); setRule({ ...rule, id: "", account: "" }); }}>إضافة ربط</Button>
          </div>
        ) : null}
      </Card> : null}
    </div>
  );
}
