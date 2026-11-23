/**
 * استيراد المنيو من Bonbell: بيعرض الأول اللي هيحصل (فئات جديدة، أصناف جديدة، أصناف هتتحدث وإيه اللي هيتغير فيها،
 * وأصناف هتفضل زي ما هي)، وما بيكتبش حاجة غير بعد ما توافق. الطلبات القديمة ما بتتلمسش.
 */
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download } from "lucide-react";
import { useDb, useLive } from "@/data/hooks";
import type { MenuCategory } from "@/data/types";
import { uuid } from "@/lib/id";
import { UNITS_PER_MAJOR } from "@/lib/money";
import { Badge, Button, Dialog, Spinner, useToast } from "@/ui";
import { listsOf } from "../lib";
import { groupRow, itemFields, planImport, type BbMenu } from "./bonbell";

export function BonbellImport({ onClose }: { onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const cats = useLive("menuCategories", { orderBy: [{ field: "sort" }] }).data;
  const items = useLive("menuItems", { orderBy: [{ field: "sort" }] }).data;
  const groups = useLive("modifierGroups").data;
  const settings = useLive("mfgSettings").data[0];
  const [menu, setMenu] = useState<BbMenu | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [step, setStep] = useState("");
  useEffect(() => {
    import("@/data/westeros/bonbell.json").then((m) => setMenu(m.default as unknown as BbMenu));
  }, []);
  const plan = useMemo(() => (menu ? planImport(menu, cats, items) : null), [menu, cats, items]);
  const run = async () => {
    if (!menu || !plan) return;
    setBusy(true);
    try {
      // الخيارات الجانبية: added to the list by name, nothing removed
      if (settings) {
        const lists = listsOf(settings);
        const have = new Set((lists.sideOptions ?? []).map((o) => o.name.toLowerCase()));
        const add = menu.sideOptions.filter((o) => !have.has(o.name.toLowerCase())).map((o) => ({ id: uuid(), name: o.name, price: o.price }));
        if (add.length) await db.update("mfgSettings", settings.id, { lists: { ...lists, sideOptions: [...(lists.sideOptions ?? []), ...add] } });
      }
      // الفئات
      const catOf = new Map<string, MenuCategory>();
      let sort = cats.length;
      for (const [ci, c] of menu.categories.entries()) {
        setStep(`الفئة ${ci + 1} من ${menu.categories.length}: ${c.name.ar || c.name.en}`);
        const cur = cats.find((x) => x.id === plan.catIds[c.ref]);
        // an existing category keeps its Arabic name when Bonbell has none
        const row = { name: { ar: c.name.ar || cur?.name.ar || c.name.en, en: c.name.en }, imageUrl: c.image, active: c.visible, externalRef: c.ref, sort: ci + 1 };
        catOf.set(c.ref, cur ? await db.update("menuCategories", cur.id, row) : await db.insert("menuCategories", { ...row, sort: ++sort, color: "#F8BB18", icon: "utensils", stationId: null }));
      }
      // الأصناف ومجموعاتها
      let n = 0;
      for (const p of plan.items) {
        n++;
        setStep(`الصنف ${n} من ${plan.items.length}: ${p.bb.name.ar || p.bb.name.en}`);
        // groups an earlier import made for this item (and no other item uses) are replaced, so a second import does not double them
        if (p.current)
          for (const gid of p.current.modifierGroupIds) {
            const g = groups.find((x) => x.id === gid);
            if (g?.externalRef && !items.some((i) => i.id !== p.current!.id && i.modifierGroupIds.includes(gid))) await db.remove("modifierGroups", gid);
          }
        const ids: string[] = [];
        for (const [gi, g] of p.bb.groups.entries()) {
          const row = await db.insert("modifierGroups", { ...groupRow(g), sort: gi + 1, externalRef: `${p.bb.ref}:${gi + 1}` });
          for (const [oi, o] of g.options.entries())
            await db.insert("modifiers", { groupId: row.id, name: { ar: o.name, en: o.name }, price: Math.round(o.price * UNITS_PER_MAJOR), isDefault: false, available: true, sort: oi + 1, minQty: o.minQty, maxQty: o.maxQty });
          ids.push(row.id);
        }
        const cat = catOf.get(p.category.ref);
        if (!cat) continue;
        const keepOld = p.current ? p.current.modifierGroupIds.filter((gid) => !groups.find((x) => x.id === gid)?.externalRef) : [];
        const fields = itemFields(p.bb, cat.id, [...ids, ...keepOld], p.current);
        if (p.current) await db.update("menuItems", p.current.id, fields);
        else
          await db.insert("menuItems", {
            cost: null, sku: null, stationId: null, tags: [], available: true, vatExempt: false, sort: n,
            channelPrices: {}, branchPrices: {}, schedule: [], allergens: [], comboOf: [],
            ...fields,
          });
      }
      setDone(plan.items.length);
      toast({ tone: "success", title: "اتنقل المنيو من Bonbell" });
    } catch (e) {
      toast({ tone: "error", title: "وقف الاستيراد", description: `${step}: ${String((e as Error)?.message ?? e)}. اللي اتعمل قبل كده اتحفظ، وتقدر تعيد الاستيراد وهيكمل من غير تكرار.` });
    } finally {
      setBusy(false);
    }
  };
  const fresh = plan?.items.filter((p) => !p.current) ?? [];
  const updated = plan?.items.filter((p) => p.current) ?? [];
  return (
    <Dialog open onClose={busy ? () => {} : onClose} size="xl" title="استيراد المنيو من Bonbell" description={menu ? `البيانات زي ما كانت على Bonbell يوم ${menu.readAt}` : undefined}
      footer={<div className="flex w-full flex-wrap items-center justify-between gap-2">
        <span className="text-[12.5px] text-muted">{busy ? step : done ? "" : "مافيش حاجة بتتحفظ غير لما تدوس موافق."}</span>
        <div className="flex gap-2">
          <Button variant="ghost" disabled={busy} onClick={onClose}>{done ? "إغلاق" : "إلغاء"}</Button>
          {!done ? <Button icon={<Download />} loading={busy} disabled={!plan} onClick={run}>موافق، استورد</Button> : null}
        </div>
      </div>}>
      {!plan ? <div className="grid place-items-center py-10"><Spinner /></div> : done ? (
        <div className="grid place-items-center gap-2 py-8 text-center">
          <CheckCircle2 className="size-10 text-success" />
          <p className="text-[16px] font-semibold">اتنقل {done} صنف بكل مجموعاتهم وخياراتهم وأسعارهم</p>
          <p className="text-muted">تقدر تعدل أو تحذف أو تضيف أي حاجة من شاشة المنيو.</p>
        </div>
      ) : (
        <div className="grid gap-4 text-[14px]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Stat label="فئات جديدة" v={plan.newCategories.length} />
            <Stat label="أصناف جديدة" v={fresh.length} />
            <Stat label="أصناف هتتحدث" v={updated.length} />
            <Stat label="مجموعات" v={plan.groups} />
            <Stat label="خيارات بأسعارها" v={plan.options} />
          </div>
          {plan.newCategories.length ? <Section title="فئات جديدة">{plan.newCategories.map((c) => <Badge key={c.ref}>{c.name.ar || c.name.en}</Badge>)}</Section> : null}
          {plan.catChanges.length ? (
            <Section title="فئات موجودة هتتغير زي Bonbell">{plan.catChanges.map((x) => <Badge key={x.c.ref} tone={x.changes.includes("هتتخفي") ? "warn" : undefined}>{x.current.name.ar}: {x.changes.join("، ")}</Badge>)}</Section>
          ) : null}
          {plan.newCategories.some((c) => !c.visible) ? <p className="text-[12.5px] text-muted">الفئات المخفية على Bonbell هتيجي مخفية برضه: {plan.newCategories.filter((c) => !c.visible).map((c) => c.name.ar || c.name.en).join("، ")}. تقدر تظهرها بزرار العين.</p> : null}
          {fresh.length ? <Section title="أصناف جديدة">{fresh.map((p) => <Badge key={p.bb.ref}>{p.bb.name.ar || p.bb.name.en} · {p.bb.price}</Badge>)}</Section> : null}
          {updated.length ? (
            <div>
              <p className="mb-2 font-semibold">أصناف موجودة هتتحدث من Bonbell</p>
              <div className="max-h-64 overflow-y-auto rounded-xl border border-line">
                {updated.map((p) => (
                  <div key={p.bb.ref} className="flex flex-wrap items-center gap-2 border-b border-line/60 px-3 py-1.5 last:border-0">
                    <span className="font-semibold">{p.current!.name.ar}</span>
                    <span className="text-[12.5px] text-muted">{p.changes.length ? p.changes.join("، ") : "بس الخيارات"} + {p.bb.groups.length} مجموعة</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {plan.untouched.length ? <p className="rounded-xl border border-line px-3 py-2 text-muted">{plan.untouched.length} صنف موجود عندك ومش موجود على Bonbell هيفضل زي ما هو: {plan.untouched.slice(0, 12).map((i) => i.name.ar).join("، ")}{plan.untouched.length > 12 ? "…" : ""}</p> : null}
          <p className="text-[12.5px] text-muted">الطلبات والفواتير القديمة ما بتتغيرش. ولو حبيت ترجع، السجل والاسترجاع بيرجع أي تعديل.</p>
        </div>
      )}
    </Dialog>
  );
}

function Stat({ label, v }: { label: string; v: number }) {
  return <div className="rounded-xl border border-line px-3 py-2"><p className="text-[12px] text-muted">{label}</p><p className="num text-[20px] font-bold">{v}</p></div>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><p className="mb-2 font-semibold">{title}</p><div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">{children}</div></div>;
}
