/**
 * تشغيلة جديدة — the four manufacturing methods of the Cost Control document (+ fat preparation). The chef picks the
 * method, types what went in and what came out, and sees the figures of the document live; saving signs the batch with the
 * chef, moves the stock and opens the sticker.
 */
import { useMemo, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Beef, Check, Layers, RefreshCw, Scale, Search, ShieldCheck, Shapes } from "lucide-react";
import { useSession } from "@/auth/session";
import { useDb, useLive } from "@/data/hooks";
import type { MfgBatch, MfgCategoryDef, MfgMethod, MfgProduct, MfgRecipeLine } from "@/data/types";
import { useT } from "@/i18n/i18n";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { nowIso } from "@/lib/time";
import { Badge, Button, Card, EmptyState, Input, Segmented, Select, Skeleton, Switch, useToast } from "@/ui";
import { buildBatch, scaleLines, type BatchDraft, type BuildCtx } from "./build";
import { categoryName } from "./defaults";
import { LabelDialog } from "./LabelDialog";
import { packagingItems, recipeItems } from "./ProductsPage";
import { BatchError, saveBatch } from "./ops";
import { ERROR_TEXT, LinesEditor, Num, ResultPanel, r3 } from "./ui";
import { useProduction, type Prod } from "./useProduction";
import { COST_CONTROL_ONLY } from "@/costControl";

type Tab = MfgMethod;
const clean = (l: MfgRecipeLine[]) => l.filter((x) => x.qty > 0).map((x) => ({ itemId: x.itemId, qty: Math.round(x.qty * 10_000) / 10_000 }));

export default function NewBatchPage() {
  const { L } = useT();
  const { can } = useSession();
  const prod = useProduction();
  const [params] = useSearchParams();
  const wanted = params.get("product");
  if (!can("production.run")) return <EmptyState icon={<ShieldCheck />} title={L("تسجيل التشغيلات للشيف وفريق المطبخ", "Recording batches is for the kitchen team")} />;
  // opened from the daily plan with a product: wait for the products so the form starts on it
  if (wanted && !prod.products.length) return <Skeleton className="h-96" rounded="rounded-[20px]" />;
  const initial = wanted ? prod.productById.get(wanted) : undefined;
  return COST_CONTROL_ONLY ? <ByProduct key={wanted ?? ""} prod={prod} initial={initial} /> : <Forms key={wanted ?? ""} prod={prod} initial={initial} />;
}

const tabOf = (p: MfgProduct | undefined): Tab => p?.method ?? "weight";

/**
 * Cost Control version: the chef says WHAT is being made; the way it is made comes from the product itself
 * (set once on the product in قائمة المنتجات), so the methods are never shown here.
 */
function ByProduct({ prod, initial }: { prod: Prod; initial: MfgProduct | undefined }) {
  const { loc } = useT();
  const [productId, setProductId] = useState(initial?.id ?? "");
  const [run, setRun] = useState(0);
  const [q, setQ] = useState("");
  const p = prod.productById.get(productId);
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return prod.products.filter((x) => x.active && (!n || x.name.ar.toLowerCase().includes(n) || x.code.toLowerCase().includes(n)));
  }, [prod.products, q]);
  // after a save: back to choosing the next product
  const again = () => {
    setProductId("");
    setQ("");
    setRun((n) => n + 1);
  };
  if (!p) {
    return (
      <Block title="إيه الصنف اللي هتصنعه؟" hint="اختار الصنف، وهتظهر لك الخانات المطلوبة ومكوناته">
        <div className="grid gap-4">
          <Input icon={<Search />} placeholder="ابحث باسم الصنف أو الكود" value={q} onChange={(e) => setQ(e.target.value)} />
          {prod.products.some((x) => x.active) ? (
            list.length ? <ProductChips products={list} cats={prod.categories} value="" onPick={setProductId} /> : <p className="text-[14px] text-muted">لا يوجد صنف بهذا الاسم.</p>
          ) : (
            <p className="text-[14px] text-muted">لا توجد منتجات مصنعة. أضفها من قائمة المنتجات والخامات.</p>
          )}
        </div>
      </Block>
    );
  }
  const key = `${p.id}-${run}`;
  return (
    <div className="grid gap-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-[12.5px] text-muted">الصنف اللي بيتصنع</p>
          <p className="truncate font-sans text-[18px] font-bold">{loc(p.name)} <span className="num text-[13px] font-semibold text-muted">{p.code}</span></p>
          <p className="text-[13px] text-muted">{loc(categoryName(prod.categories, p.category))}{p.method === "burger" ? " · تشغيلة واحدة بتطلع كل أصناف البرجر في الفئة دي" : ""}</p>
        </div>
        <Button variant="outline" icon={<RefreshCw />} onClick={() => setProductId("")}>تغيير الصنف</Button>
      </Card>
      {p.method === "weight" || p.method === "portion" ? (
        <SimpleForm key={key} method={p.method} prod={prod} onDone={again} initial={p} chosen />
      ) : p.method === "chicken" ? (
        <ChickenForm key={key} prod={prod} onDone={again} initial={p} chosen />
      ) : (
        // one burger run makes every burger product of the category: meat with fat for the beef type, minced chicken otherwise
        <BurgerForm key={`${p.category}-${run}`} kind={prod.categories.find((c) => c.id === p.category)?.burger ?? "chicken"} categoryId={p.category} prod={prod} onDone={again} />
      )}
    </div>
  );
}

function Forms({ prod, initial }: { prod: Prod; initial: MfgProduct | undefined }) {
  const { L } = useT();
  const [tab, setTab] = useState<Tab>(() => tabOf(initial));
  const [run, setRun] = useState(0);
  const key = `${tab}-${run}`;
  const again = () => setRun((n) => n + 1);
  // the product the plan asked for is preselected once, on its own tab
  const first = run === 0 && tabOf(initial) === tab ? initial : undefined;
  return (
    <div className="grid gap-4">
      <Segmented<Tab>
        label={L("طريقة التصنيع", "Manufacturing method")}
        value={tab}
        onChange={setTab}
        options={[
          { value: "weight", label: COST_CONTROL_ONLY ? "1. يخزن بالوزن" : L("بالوزن", "By weight"), icon: <Scale /> },
          { value: "portion", label: COST_CONTROL_ONLY ? "2. يخزن بحصة محددة (بورشن)" : L("بالحصة", "By portion"), icon: <Shapes /> },
          { value: "chicken", label: COST_CONTROL_ONLY ? "3. من مادة خام واحدة" : L("من مادة خام واحدة", "One raw material"), icon: <Layers /> },
          { value: "burger", label: COST_CONTROL_ONLY ? "4. البرجر (لحم / دجاج)" : L("البرجر", "Burger"), icon: <Beef /> },
        ]}
      />
      {tab === "weight" || tab === "portion" ? (
        <SimpleForm key={key} method={tab} prod={prod} onDone={again} initial={first} />
      ) : tab === "chicken" ? (
        <ChickenForm key={key} prod={prod} onDone={again} initial={first} />
      ) : (
        <BurgerTab key={key} prod={prod} onDone={again} initial={first} />
      )}
    </div>
  );
}

/* ───────── shared ───────── */

function useCtx(prod: Prod): BuildCtx {
  const [madeAt] = useState(nowIso);
  return useMemo(() => ({ products: prod.productById, items: prod.itemById, settings: prod.settings, unitCost: prod.unitCost, madeAt }), [prod.productById, prod.itemById, prod.settings, prod.unitCost, madeAt]);
}

/** Who signs the batch, the note, the save button — and the sticker once it is saved. */
function SaveBar({ prod, draft, ready, onDone, afterSave, beforeSave }: { prod: Prod; draft: BatchDraft; ready: boolean; onDone: () => void; afterSave?: () => Promise<unknown>; /** product fields the batch itself needs, saved first */ beforeSave?: () => Promise<unknown> }) {
  const { L, lang } = useT();
  const db = useDb();
  const { staff, role } = useSession();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [chefId, setChefId] = useState(staff?.id ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<MfgBatch | null>(null);
  // a chef signs their own batches; a manager may record one on behalf of the chef who made it
  // Cost Control: the batch always belongs to the signed-in user; only management may put it under another chef
  const delegate = role === "owner" || role === "admin" || (!COST_CONTROL_ONLY && role === "manager");
  const chefs = prod.staff.filter((m) => m.active && (m.role === "chef" || m.role === "kitchen" || m.id === staff?.id));
  const chef = (delegate ? chefs.find((c) => c.id === chefId) : null) ?? staff;
  const code = chef ? prod.settings?.chefCodes[chef.id] : undefined;
  const save = async () => {
    if (!chef || !prod.branchId) return;
    setBusy(true);
    try {
      await beforeSave?.();
      const b = await saveBatch(db, draft, { chef, branchId: prod.branchId, note: note.trim() });
      await afterSave?.();
      setSaved(b);
    } catch (e) {
      toast({ tone: "error", title: L("لم تُحفظ التشغيلة", "The batch was not saved"), description: e instanceof BatchError ? e.errors.map((x) => ERROR_TEXT[x][lang]).join("، ") : String((e as Error).message ?? e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-3">
      {delegate && chefs.length > 1 ? (
        <Select label={L("الشيف صاحب التشغيلة", "Chef who made it")} value={chef?.id ?? ""} onChange={(e) => setChefId(e.target.value)} options={chefs.map((c) => ({ value: c.id, label: `${c.name}${prod.settings?.chefCodes[c.id] ? ` (${prod.settings.chefCodes[c.id]})` : ""}` }))} />
      ) : (
        <div className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2.5">
          <ShieldCheck className="size-4 text-primary" aria-hidden />
          <span className="text-[13px] text-muted">{L("تُسجل باسم", "Signed by")}</span>
          <span className="truncate text-[14px] font-bold">{chef?.name ?? "—"}</span>
          {code ? <Badge tone="brass" size="sm">{L("كود", "Code")} {code}</Badge> : null}
        </div>
      )}
      <Input placeholder={L("ملاحظة (اختياري)", "Note (optional)")} value={note} onChange={(e) => setNote(e.target.value)} />
      <Button size="lg" block icon={<Check />} loading={busy} disabled={!ready} onClick={save}>
        {L("حفظ التشغيلة وطباعة الستيكر", "Save batch & print sticker")}
      </Button>
      <LabelDialog
        batch={saved}
        justSaved
        onClose={() => {
          setSaved(null);
          toast({ tone: "success", title: L("التشغيلة في السجل والمخزن اتحدث", "Batch logged and stock updated"), action: { label: L("فتح السجل", "Open log"), onClick: () => navigate(COST_CONTROL_ONLY ? "/manufacturing/log" : "/production/batches") } });
          onDone();
        }}
      />
    </div>
  );
}

function Layout({ children, side }: { children: ReactNode; side: ReactNode }) {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_370px]">
      <div className="grid gap-4">{children}</div>
      <div className="lg:sticky lg:top-4">{side}</div>
    </div>
  );
}

function Block({ title, hint, children, step }: { title: ReactNode; hint?: ReactNode; children: ReactNode; step?: number }) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2.5">
        {step ? <span className="num grid size-7 shrink-0 place-items-center rounded-full bg-primary text-[13px] font-bold text-primary-ink">{step}</span> : null}
        <div className="min-w-0">
          <h3 className="font-sans text-[16px] font-bold">{title}</h3>
          {hint ? <p className="text-[12.5px] text-muted">{hint}</p> : null}
        </div>
      </div>
      {children}
    </Card>
  );
}

function ProductChips({ products, cats, value, onPick, multi }: { products: MfgProduct[]; cats: MfgCategoryDef[]; value: string | string[]; onPick: (id: string) => void; multi?: boolean }) {
  const { L, loc } = useT();
  const on = (id: string) => (Array.isArray(value) ? value.includes(id) : value === id);
  // categories in the order of the constants, then anything whose category was removed
  const known = new Set(cats.map((c) => c.id));
  const groups = [...cats.map((c) => ({ c: c.id, name: c.name, list: products.filter((p) => p.category === c.id) })), { c: "", name: { ar: "بدون فئة", en: "No category" }, list: products.filter((p) => !known.has(p.category)) }].filter((g) => g.list.length);
  if (!products.length) return <p className="text-[14px] text-muted">{L("لا توجد منتجات بهذه الطريقة. أضفها من صفحة المنتجات.", "No products use this method yet. Add them in Products.")}</p>;
  return (
    <div className="grid gap-3">
      {groups.map((g) => (
        <div key={g.c} className="grid gap-1.5">
          {groups.length > 1 ? <span className="text-[12px] font-semibold text-muted">{loc(g.name)}</span> : null}
          <div className="flex flex-wrap gap-1.5">
            {g.list.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={on(p.id)}
                onClick={() => onPick(p.id)}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3.5 text-[14.5px] font-semibold transition-[background-color,border-color,color] duration-150",
                  on(p.id) ? "border-primary bg-primary text-primary-ink shadow-sf-sm" : "border-line bg-surface text-ink-2 hover:border-line-strong hover:bg-surface-2",
                )}
              >
                {multi && on(p.id) ? <Check className="size-4" aria-hidden /> : null}
                {loc(p.name)}
                {p.portionGrams ? <span className="num text-[12px] opacity-70">{p.portionGrams}{L("جم", "g")}</span> : null}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function RecipeSwitch({ value, onChange, empty }: { value: boolean; onChange: (v: boolean) => void; empty: boolean }) {
  const { L } = useT();
  return (
    <div className="rounded-xl border border-line bg-surface-2 px-3.5 py-2">
      <Switch
        checked={value}
        onChange={onChange}
        label={<span className="text-[14px]">{L("احفظ هذه الكميات كوصفة المنتج", "Save these quantities as the product's recipe")}</span>}
        description={empty ? L("المنتج بدون وصفة حتى الآن، والتشغيلة القادمة ستبدأ بهذه الكميات", "This product has no recipe yet; the next batch will start from these quantities") : L("يستبدل الوصفة الحالية", "Replaces the current recipe")}
      />
    </div>
  );
}

/* ───────── 1 + 2 · by weight / by portion ───────── */

function SimpleForm({ method, prod, onDone, initial, chosen }: { method: Extract<MfgMethod, "weight" | "portion">; prod: Prod; onDone: () => void; initial?: MfgProduct; /** the product was chosen before the form: no product step */ chosen?: boolean }) {
  const { L } = useT();
  const db = useDb();
  const ctx = useCtx(prod);
  const list = useMemo(() => prod.products.filter((p) => p.active && p.method === method), [prod.products, method]);
  const [productId, setProductId] = useState(initial?.id ?? "");
  const [meals, setMeals] = useState(1);
  const [net, setNet] = useState(0);
  const [lines, setLines] = useState<MfgRecipeLine[]>(initial?.lines ?? []);
  const [packaging, setPackaging] = useState<MfgRecipeLine[]>(initial?.packaging ?? []);
  const [keep, setKeep] = useState(!!initial && !initial.lines.length);
  const p = prod.productById.get(productId);
  const pick = (id: string) => {
    const x = prod.productById.get(id);
    setProductId(id);
    setLines(x?.lines ?? []);
    setPackaging(x?.packaging ?? []);
    setKeep(!x?.lines.length);
  };
  const draft: BatchDraft =
    method === "weight"
      ? { method, productId, meals, netKg: net, lines: scaleLines(lines, meals), packaging: scaleLines(packaging, meals) }
      : { method, productId, meals, netCount: Math.round(net), lines: scaleLines(lines, meals), packaging: scaleLines(packaging, meals) };
  const built = useMemo(() => buildBatch(draft, ctx), [JSON.stringify(draft), ctx]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = !built.errors.length && lines.some((l) => l.qty > 0);
  return (
    <Layout
      side={<ResultPanel built={built} footer={<SaveBar prod={prod} draft={draft} ready={ready} onDone={onDone} afterSave={keep && p ? () => db.update("mfgProducts", p.id, { lines: clean(lines), packaging: clean(packaging) }) : undefined} />} />}
    >
      {chosen ? null : (
        <Block step={1} title={L("المنتج", "Product")} hint={method === "weight" ? L("صوصات وخلطات وتتبيلات تخزن بالوزن", "Sauces, mixes and marinades stored by weight") : L("منتجات تخزن بحصة محددة (بورشن)", "Products stored in fixed portions")}>
          <ProductChips products={list} cats={prod.categories} value={productId} onPick={pick} />
        </Block>
      )}
      {p ? (
        <>
          <Block step={chosen ? 1 : 2} title={L("الكمية", "Quantity")}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Num big label={L("عدد الوجبات", "Number of meals")} value={meals} onChange={setMeals} hint={L("يضرب كميات الوصفة", "Multiplies the recipe")} />
              {method === "weight" ? (
                <Num big label={L("الوزن الصافي بعد التجهيز", "Net weight after cooking")} suffix={L("كجم", "kg")} value={net} onChange={setNet} />
              ) : (
                <Num big label={L("العدد الصافي الناتج", "Net count produced")} suffix={L("قطعة", "pcs")} value={net} onChange={setNet} hint={p.portionGrams ? L(`وزن الحصة ${p.portionGrams} جم`, `Portion ${p.portionGrams} g`) : L("حدد وزن الحصة من صفحة المنتجات", "Set the portion weight in Products")} />
              )}
            </div>
          </Block>
          <Block step={chosen ? 2 : 3} title={L("المكونات", "Ingredients")} hint={L("الكميات الفعلية التي دخلت هذه التشغيلة", "What actually went into this batch")}>
            <div className="grid gap-5">
              <LinesEditor title={L("الوصفة", "Recipe")} lines={lines} onChange={setLines} by={meals} items={recipeItems(prod, p.recipeType, p.stockItemId)} itemById={prod.itemById} unitCost={prod.unitCost} />
              <LinesEditor title={L("باكيج التخزين", "Storage packaging")} hint={L("يدخل في التكلفة فقط", "Costed only")} lines={packaging} onChange={setPackaging} by={meals} items={packagingItems(prod)} itemById={prod.itemById} unitCost={prod.unitCost} />
              <RecipeSwitch value={keep} onChange={setKeep} empty={!p.lines.length} />
            </div>
          </Block>
        </>
      ) : null}
    </Layout>
  );
}

/* ───────── 3 · chicken ───────── */

interface ChickenRow {
  productId: string;
  weightKg: number;
  count: number;
  lines: MfgRecipeLine[];
  packaging: MfgRecipeLine[];
}

function ChickenForm({ prod, onDone, initial, chosen }: { prod: Prod; onDone: () => void; initial?: MfgProduct; chosen?: boolean }) {
  const { L, lang, loc } = useT();
  const db = useDb();
  const ctx = useCtx(prod);
  const list = useMemo(() => prod.products.filter((p) => p.active && p.method === "chicken"), [prod.products]);
  const [chickenKg, setChickenKg] = useState(0);
  const [rows, setRows] = useState<ChickenRow[]>(() => (initial ? [{ productId: initial.id, weightKg: 0, count: 0, lines: initial.lines, packaging: initial.packaging }] : []));
  const [keep, setKeep] = useState(!!initial && !initial.lines.length);
  // the raw material this batch is cut from: any raw item, starting on the one named in the constants
  const raws = useMemo(() => prod.items.filter((i) => i.active && i.kind === "raw"), [prod.items]);
  const [rawId, setRawId] = useState<string>(() => prod.settings?.chickenItemId ?? "");
  const chicken = rawId ? prod.itemById.get(rawId) : undefined;
  const toggle = (id: string) =>
    setRows((r) => {
      if (r.some((x) => x.productId === id)) return r.filter((x) => x.productId !== id);
      const p = prod.productById.get(id);
      if (p && !p.lines.length) setKeep(true);
      return [...r, { productId: id, weightKg: 0, count: 0, lines: p?.lines ?? [], packaging: p?.packaging ?? [] }];
    });
  const set = (id: string, patch: Partial<ChickenRow>) => setRows((r) => r.map((x) => (x.productId === id ? { ...x, ...patch } : x)));
  const draft: BatchDraft = { method: "chicken", itemId: rawId || null, chickenKg, outputs: rows.map((r) => ({ productId: r.productId, weightKg: r.weightKg, count: Math.round(r.count), lines: scaleLines(r.lines, r.weightKg), packaging: scaleLines(r.packaging, r.weightKg) })) };
  const built = useMemo(() => buildBatch(draft, ctx), [JSON.stringify(draft), ctx]); // eslint-disable-line react-hooks/exhaustive-deps
  const MODE = { weight: L("بالوزن", "By weight"), pre_count: L("متبل قبل العد", "Marinated before counting"), post_count: L("متبل بعد العد", "Marinated after counting") };
  return (
    <Layout
      side={
        <ResultPanel
          built={built}
          footer={<SaveBar prod={prod} draft={draft} ready={!built.errors.length} onDone={onDone} afterSave={keep ? () => Promise.all(rows.map((r) => db.update("mfgProducts", r.productId, { lines: clean(r.lines), packaging: clean(r.packaging) }))) : undefined} />}
        />
      }
    >
      <Block step={1} title={L("المادة الخام ووزنها", "Raw material & weight")} hint={chicken ? `${formatMoney(prod.unitCost(chicken.id) * 1000, { lang })} / ${L("كجم", "kg")}` : L("اختر المادة الخام التي ستُقطّع", "Pick the raw material being cut")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label={L("المادة الخام", "Raw material")} value={rawId} onChange={(e) => setRawId(e.target.value)} options={[{ value: "", label: L("اختر", "Choose") }, ...raws.map((i) => ({ value: i.id, label: loc(i.name) }))]} />
          <Num big label={L("الوزن قبل التجهيز", "Weight before prep")} suffix={L("كجم", "kg")} value={chickenKg} onChange={setChickenKg} />
        </div>
      </Block>
      <Block step={2} title={chosen ? "أصناف تانية من نفس الكمية (اختياري)" : L("المنتجات الناتجة", "Products made")} hint={chosen ? "لو نفس المادة الخام طلع منها أكتر من صنف، اختارهم هنا" : L("اختر كل منتج خرج من نفس الكمية", "Pick every product made from this quantity")}>
        <ProductChips products={list} cats={prod.categories} value={rows.map((r) => r.productId)} onPick={toggle} multi />
      </Block>
      {rows.map((r, i) => {
        const p = prod.productById.get(r.productId);
        if (!p) return null;
        const mode = p.chickenMode ?? "weight";
        return (
          <Block key={r.productId} step={i + 3} title={loc(p.name)} hint={`${MODE[mode]}${p.portionGrams ? ` · ${L("حصة", "portion")} ${p.portionGrams} ${L("جم", "g")}` : ""}`}>
            <div className="grid gap-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Num big label={L("الوزن الناتج", "Output weight")} suffix={L("كجم", "kg")} value={r.weightKg} onChange={(v) => set(r.productId, { weightKg: v })} />
                {mode !== "weight" ? <Num big label={L("العدد الناتج", "Count")} suffix={L("قطعة", "pcs")} value={r.count} onChange={(v) => set(r.productId, { count: v })} /> : null}
              </div>
              <LinesEditor title={L("التتبيلة والمكونات", "Marinade & ingredients")} hint={L("لكامل وزن هذا المنتج", "For this product's whole weight")} lines={r.lines} onChange={(l) => set(r.productId, { lines: l })} by={r.weightKg} items={recipeItems(prod, p.recipeType, p.stockItemId)} itemById={prod.itemById} unitCost={prod.unitCost} />
              <LinesEditor title={L("باكيج التخزين", "Storage packaging")} lines={r.packaging} onChange={(l) => set(r.productId, { packaging: l })} by={r.weightKg} items={packagingItems(prod)} itemById={prod.itemById} unitCost={prod.unitCost} />
            </div>
          </Block>
        );
      })}
      {rows.length ? <RecipeSwitch value={keep} onChange={setKeep} empty={rows.every((r) => !prod.productById.get(r.productId)?.lines.length)} /> : null}
    </Layout>
  );
}

/* ───────── 4 · burger ───────── */

/** نوع البرجر: the categories marked as burger in the constants. */
function BurgerTab({ prod, onDone, initial }: { prod: Prod; onDone: () => void; initial?: MfgProduct }) {
  const { L, loc } = useT();
  const types = prod.categories.filter((c) => c.burger);
  const [catId, setCatId] = useState(() => (initial && types.some((c) => c.id === initial.category) ? initial.category : (types[0]?.id ?? "")));
  const cat = types.find((c) => c.id === catId) ?? types[0];
  if (!cat) return <EmptyState title={L("لا يوجد نوع برجر معرّف. حدده على فئة من الثوابت.", "No burger type is defined. Mark a category as burger in Constants.")} />;
  return (
    <div className="grid gap-4">
      {types.length > 1 ? <Segmented label={L("نوع البرجر", "Burger type")} value={cat.id} onChange={setCatId} options={types.map((c) => ({ value: c.id, label: loc(c.name) }))} /> : null}
      <BurgerForm key={cat.id} kind={cat.burger ?? "beef"} categoryId={cat.id} prod={prod} onDone={onDone} />
    </div>
  );
}

function BurgerForm({ kind, categoryId, prod, onDone }: { kind: "beef" | "chicken"; categoryId: string; prod: Prod; onDone: () => void }) {
  const { L, lang, loc } = useT();
  const db = useDb();
  const ctx = useCtx(prod);
  const levels = useLive("stockLevels").data;
  const beef = kind === "beef";
  const list = useMemo(() => prod.products.filter((p) => p.active && p.method === "burger" && p.category === categoryId), [prod.products, categoryId]);
  const first = list[0];
  const meats = prod.settings?.meatTypes ?? [];
  const [meatTypeId, setMeatTypeId] = useState<string | null>(null);
  const [meatKg, setMeatKg] = useState(0);
  const [netKg, setNetKg] = useState(0);
  const [fatKg, setFatKg] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  // وزن القطعة: typed here for a product that has none yet, and kept on the product when the batch is saved
  const [portions, setPortions] = useState<Record<string, number>>({});
  const missing = list.filter((p) => !p.portionGrams);
  const burgerCtx = useMemo<BuildCtx>(() => {
    if (!Object.values(portions).some((g) => g > 0)) return ctx;
    const products = new Map(ctx.products);
    for (const p of list) if (!p.portionGrams && portions[p.id] > 0) products.set(p.id, { ...p, portionGrams: portions[p.id] });
    return { ...ctx, products };
  }, [ctx, list, portions]);
  const [editedLines, setLines] = useState<MfgRecipeLine[]>(() => first?.lines ?? []);
  const [editedPackaging, setPackaging] = useState<MfgRecipeLine[]>(() => first?.packaging ?? []);
  const [keepEdited, setKeep] = useState(() => !first?.lines.length);
  // Cost Control: the mix is shown as numbers only, always straight from the recipe (edited in الوصفات),
  // and is worked out on the whole mix: net meat after trimming plus the added fat.
  const fixed = COST_CONTROL_ONLY;
  const lines = fixed ? first?.lines ?? [] : editedLines;
  const packaging = fixed ? first?.packaging ?? [] : editedPackaging;
  const keep = fixed ? false : keepEdited;
  const mixKg = fixed && beef ? netKg + fatKg : netKg;
  const meat = meats.find((m) => m.id === meatTypeId);
  const draft: BatchDraft = {
    method: "burger", kind, meatTypeId, meatKg, netKg, fatKg, lines: scaleLines(lines, mixKg), packaging: scaleLines(packaging, mixKg),
    products: list.map((p) => ({ productId: p.id, count: Math.round(counts[p.id] ?? 0) })),
  };
  const built = useMemo(() => buildBatch(draft, burgerCtx), [JSON.stringify(draft), burgerCtx]); // eslint-disable-line react-hooks/exhaustive-deps
  const savePortions = async () => {
    for (const p of missing) if (portions[p.id] > 0 && (counts[p.id] ?? 0) > 0) await db.update("mfgProducts", p.id, { portionGrams: portions[p.id] });
  };
  const mince = prod.settings?.mincedChickenItemId ? prod.itemById.get(prod.settings.mincedChickenItemId) : undefined;
  const suggested = built.suggestedFatKg ?? 0;
  // the fat of a meat burger is a stock item of its own (the ready fat product): its price and what the stores hold
  const fatItem = beef && prod.settings?.rawFatItemId ? prod.itemById.get(prod.settings.rawFatItemId) : undefined;
  const fatOnHandKg = fatItem ? Math.round(levels.reduce((a, l) => (l.itemId === fatItem.id ? a + l.qty : a), 0)) / 1000 : 0;
  if (!list.length) return <EmptyState title={L("لا توجد منتجات في هذه الفئة بطريقة البرجر. أضفها من صفحة المنتجات.", "No burger products in this category yet. Add them in Products.")} />;
  return (
    <Layout
      side={
        <ResultPanel
          built={built}
          footer={<SaveBar prod={prod} draft={draft} ready={!built.errors.length} onDone={onDone} beforeSave={savePortions} afterSave={keep ? () => Promise.all(list.map((p) => db.update("mfgProducts", p.id, { lines: clean(lines), packaging: clean(packaging) }))) : undefined} />}
        />
      }
    >
      {beef ? (
        <Block step={1} title={L("اللحم", "Meat")} hint={L("نوع اللحم يحدد وزن الدهن المقترح", "The cut sets the suggested fat weight")}>
          <div className="grid gap-4">
            <div className="flex flex-wrap gap-1.5">
              {meats.map((m) => (
                <button key={m.id} type="button" aria-pressed={m.id === meatTypeId} onClick={() => setMeatTypeId(m.id)} className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3.5 text-[14.5px] font-semibold transition-colors", m.id === meatTypeId ? "border-primary bg-primary text-primary-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong hover:bg-surface-2")}>
                  {loc(m.name)}
                  <span className="num text-[12px] opacity-70">{m.fatGramsPerKg}{L("جم دهن", "g fat")}</span>
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Num big label={L("وزن اللحم قبل التنظيف", "Meat before trimming")} suffix={L("كجم", "kg")} value={meatKg} onChange={setMeatKg} hint={meat?.stockItemId ? `${formatMoney(prod.unitCost(meat.stockItemId) * 1000, { lang })} / ${L("كجم", "kg")}` : undefined} />
              <Num big label={L("الوزن الصافي بعد التنظيف", "Net after trimming")} suffix={L("كجم", "kg")} value={netKg} onChange={setNetKg} />
              <div className="grid gap-1.5">
                <Num big label={L("وزن الدهن المضاف", "Fat added")} suffix={L("كجم", "kg")} value={fatKg} onChange={setFatKg} hint={fatItem ? `${loc(fatItem.name)} · ${formatMoney(prod.unitCost(fatItem.id) * 1000, { lang })} / ${L("كجم", "kg")}` : L("حدد الدهن من ثوابت النظام", "Set the fat in the constants")} />
                {fatItem ? (
                  <span className={cn("num text-[12.5px]", fatKg > fatOnHandKg + 1e-9 ? "font-semibold text-danger" : "text-muted")}>
                    {L(`المتاح في المخزن ${fatOnHandKg} كجم`, `In stock ${fatOnHandKg} kg`)}
                    {fatKg > fatOnHandKg + 1e-9 ? L(" · الكمية أكبر من المتاح", " · more than in stock") : ""}
                  </span>
                ) : null}
                {suggested > 0 ? (
                  <button type="button" className="num text-start text-[12.5px] font-semibold text-primary hover:underline" onClick={() => setFatKg(suggested)}>
                    {L(`المقترح ${suggested} كجم، اضغط للاستخدام`, `Suggested ${suggested} kg — tap to use`)}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </Block>
      ) : (
        <Block step={1} title={L("دجاج الفرم", "Minced chicken")} hint={mince ? `${loc(mince.name)} · ${formatMoney(prod.unitCost(mince.id) * 1000, { lang })} / ${L("كجم", "kg")}` : L("حدد خامة دجاج الفرم من الثوابت", "Set the minced chicken item in Constants")}>
          <Num big className="max-w-56" label={L("وزن دجاج الفرم", "Minced chicken weight")} suffix={L("كجم", "kg")} value={netKg} onChange={setNetKg} />
        </Block>
      )}
      <Block step={2} title={L("الخلطة", "Mix")} hint={fixed ? (beef ? `الكميات المطلوبة لإجمالي ${r3(mixKg)} كجم (الصافي + الدهن)` : `الكميات المطلوبة لإجمالي ${r3(mixKg)} كجم`) : L("كميات هذه التشغيلة", "Quantities of this batch")}>
        <div className="grid gap-5">
          <LinesEditor readOnly={fixed} title={L("مكونات الوصفة", "Recipe")} lines={lines} onChange={setLines} by={mixKg} items={recipeItems(prod, first?.recipeType ?? "main", first?.stockItemId)} itemById={prod.itemById} unitCost={prod.unitCost} />
          <LinesEditor readOnly={fixed} title={L("باكيج التخزين", "Storage packaging")} hint={L("يدخل في التكلفة فقط", "Costed only")} lines={packaging} onChange={setPackaging} by={mixKg} items={packagingItems(prod)} itemById={prod.itemById} unitCost={prod.unitCost} />
          {fixed ? <p className="text-[12.5px] text-muted">الأرقام للعرض فقط. تعديل المكونات والباكيج يكون من الوصفات.</p> : <RecipeSwitch value={keep} onChange={setKeep} empty={!first?.lines.length} />}
        </div>
      </Block>
      <Block step={3} title={L("العدد الناتج", "Patties made")} hint={L("نفس الكمية بتطلع كل الأصناف دي. اكتب عدد كل صنف، وسيب اللي ما اتصنعش صفر", "The same quantity makes all of these. Type each count; leave zero for what was not made")}>
        <div className="grid gap-3 sm:grid-cols-3">
          {list.map((p) => (
            <div key={p.id} className="grid content-start gap-2">
              <Num big label={loc(p.name)} suffix={L("قطعة", "pcs")} value={counts[p.id] ?? 0} onChange={(v) => setCounts((c) => ({ ...c, [p.id]: v }))} hint={p.portionGrams ? L(`وزن القطعة ${p.portionGrams} جم`, `Piece ${p.portionGrams} g`) : undefined} />
              {p.portionGrams ? null : <Num label={L("وزن القطعة", "Piece weight")} suffix={L("جم", "g")} value={portions[p.id] ?? 0} onChange={(v) => setPortions((c) => ({ ...c, [p.id]: v }))} hint={L("يتسجل على الصنف مع أول تشغيلة", "Saved on the product with the first batch")} />}
            </div>
          ))}
        </div>
      </Block>
    </Layout>
  );
}
