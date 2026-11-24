/**
 * المنيو (زي Bonbell، Mohammed 2026-11-23): الفئات على الجنب، أصناف الفئة في جدول (الصورة، الاسم، السعر، الخصم، الوصف،
 * ظاهر، مميز، القنوات)، وتفاصيل الصنف بمجموعات الخيارات بتاعته (الاسم، مطلوب أو اختياري، خيار واحد أو أكتر، أقل وأكتر عدد،
 * وكل خيار بسعره). الكاشير بيعرض المجموعات دي ويزود سعر كل خيار على الصنف.
 */
import { inChunks } from "@/lib/batch";
import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Eye, EyeOff, Flame, Pencil, Plus, Search, Star, Trash2, TrendingUp } from "lucide-react";
import { useSession } from "@/auth/session";
import { useDb, useLive } from "@/data/hooks";
import type { MenuCategory, MenuItem, Modifier, ModifierGroup } from "@/data/types";
import { cn } from "@/lib/cn";
import { UNITS_PER_MAJOR } from "@/lib/money";
import { PageHeader } from "@/shell/PageHeader";
import { ViewBranchPicker } from "@/shell/ViewBranchPicker";
import { useViewBranch } from "@/auth/viewBranch";
import { Badge, Button, Card, Dialog, EmptyState, IconButton, Input, Segmented, Switch, useToast } from "@/ui";
import { ImageField } from "../ui";
import { AreaGate, useArea } from "../useAccess";
import { Confirm } from "../finance/ui";
import { GroupDialog } from "./GroupDialog";
import { ItemDialog } from "./ItemDialog";
import { channelsOf, soldOn } from "@/data/channels";
import { SideOptions } from "./SideOptions";
import { groupsOf } from "./bonbell";
import { linkPlan } from "./sideOptions";
import { blockRange } from "./codes";
import { useAutoCodes } from "./useAutoCodes";
import { PriceTable } from "./PriceTable";
import { listsOf } from "../lib";
import { useFame, FAME_LABEL } from "@/modules/menu/useFame";
import type { Fame } from "@/modules/menu/sold";

const egp = (u: number) => `${(u / UNITS_PER_MAJOR).toLocaleString("en", { maximumFractionDigits: 2 })}`;
export const pctOf = (i: Pick<MenuItem, "price" | "discount">) => (i.price && i.discount ? Math.round((i.discount / i.price) * 1000) / 10 : 0);
const err = (e: unknown) => String((e as Error)?.message ?? e);

export default function MenuPage() {
  return <AreaGate id="menu"><Body /></AreaGate>;
}

type View = "menu" | "prices" | "recommended" | "discount" | "off" | "side";

function Body() {
  const area = useArea();
  const { can } = useSession();
  const manage = can("menu.edit") && area.edit;
  const db = useDb();
  const channels = channelsOf(useLive("settings").data[0]);
  const { toast } = useToast();
  const cats = useLive("menuCategories", { orderBy: [{ field: "sort" }] }).data;
  const items = useLive("menuItems", { orderBy: [{ field: "sort" }] }).data;
  // كل فرع له منيو خاص بيه: with one branch picked at the top, the list shows that branch's menu
  const vb = useViewBranch();
  const branchItems = useMemo(() => (vb.value ? items.filter((i) => !(i.offBranches ?? []).includes(vb.value!)) : items), [items, vb.value]);
  const groups = useLive("modifierGroups", { orderBy: [{ field: "sort" }] }).data;
  const mods = useLive("modifiers", { orderBy: [{ field: "sort" }] }).data;
  const [view, setView] = useState<View>("menu");
  const [catId, setCatId] = useState<string>("");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<MenuCategory | "new" | null>(null);
  const [item, setItem] = useState<MenuItem | "new" | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const settings = useLive("mfgSettings").data[0];
  const { fame, sold } = useFame();
  // every option on the menu is tied to the side options list (the one place its name and price change), once per visit
  const linked = useRef(false);
  useEffect(() => {
    if (!manage || linked.current || !settings || !mods.length || !items.length) return;
    linked.current = true;
    const lists = listsOf(settings);
    const plan = linkPlan(lists.sideOptions ?? [], mods, items);
    void (async () => {
      try {
        if (plan.libraryChanged) await db.update("mfgSettings", settings.id, { lists: { ...lists, sideOptions: plan.library } });
        await inChunks(plan.links, (l) => db.update("modifiers", l.id, { sideOptionId: l.sideOptionId, menuItemId: l.menuItemId }));
      } catch (e) {
        toast({ tone: "error", title: "تعذر ربط الخيارات بالخيارات الجانبية", description: err(e) });
      }
    })();
  }, [manage, settings, mods, items, db, toast]);
  // أكواد تلقائية: each category a block of 1000, each item the next number in it. Empty codes fill by themselves;
  // a code that is already there but outside its block changes only after the manager confirms.
  const codes = useAutoCodes(manage, cats, items);
  const [fixing, setFixing] = useState(false);
  const applyFix = async () => {
    setFixing(true);
    try {
      await inChunks(codes.fix, (f) => db.update("menuItems", f.id, { sku: f.sku }));
      toast({ tone: "success", title: `اتغيرت أكواد ${codes.fix.length} صنف` });
    } catch (e) {
      toast({ tone: "error", title: "تعذر حفظ الأكواد", description: err(e) });
    } finally {
      setFixing(false);
    }
  };
  const [showFix, setShowFix] = useState(false);
  const current = cats.find((c) => c.id === catId) ?? cats[0] ?? null;
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    const hit = (i: MenuItem) => !n || i.name.ar.toLowerCase().includes(n) || i.name.en.toLowerCase().includes(n) || (i.sku ?? "") === n;
    if (view === "recommended") return branchItems.filter((i) => i.recommended && hit(i));
    if (view === "discount") return branchItems.filter((i) => (i.discount ?? 0) > 0 && hit(i));
    if (view === "off") return branchItems.filter((i) => (!i.active || !i.available) && hit(i));
    if (n) return branchItems.filter(hit);
    return current ? branchItems.filter((i) => i.categoryId === current.id) : [];
  }, [items, view, current, q]);
  const flip = async (i: MenuItem, p: Partial<MenuItem>) => {
    try {
      await db.update("menuItems", i.id, p);
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحفظ", description: err(e) });
    }
  };
  const flipCat = async (c: MenuCategory) => {
    try {
      await db.update("menuCategories", c.id, { active: !c.active });
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحفظ", description: err(e) });
    }
  };
  const open = detail ? items.find((i) => i.id === detail) ?? null : null;
  return (
    <div className="grid gap-5">
      <PageHeader icon={<BookOpen />} title="المنيو" subtitle="الأصناف والإضافات والملاحظات وأسعارها زي ما الكاشير بيشوفها"
        actions={<ViewBranchPicker noCentral />} />
      {!manage ? <p className="rounded-xl border border-line px-3 py-2 text-[13.5px] text-muted">للمشاهدة بس: الدور بتاعك مالوش صلاحية تعديل المنيو.</p> : null}
      {manage && codes.fix.length ? (
        <Card className="grid gap-2 border-brass/50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 text-[13.5px]"><b className="num">{codes.fix.length}</b> صنف كودهم مش في نطاق فئتهم (كل فئة ليها 1000 كود). راجع الأكواد الجديدة قبل ما تتغير.</span>
            <Button size="sm" variant="ghost" onClick={() => setShowFix((v) => !v)}>{showFix ? "إخفاء" : "عرض التغييرات"}</Button>
            <Button size="sm" variant="brass" loading={fixing} onClick={applyFix}>غيّر الأكواد</Button>
          </div>
          {showFix ? (
            <div className="max-h-60 overflow-y-auto text-[13px]">
              <table className="w-full"><thead><tr className="text-muted"><th className="p-1 text-start">الصنف</th><th className="p-1 text-start">الكود الحالي</th><th className="p-1 text-start">الكود الجديد</th></tr></thead>
                <tbody>{codes.fix.map((f) => <tr key={f.id} className="border-t border-line/60"><td className="p-1">{items.find((i) => i.id === f.id)?.name.ar}</td><td className="num p-1 text-muted">{f.from}</td><td className="num p-1 font-semibold">{f.sku}</td></tr>)}</tbody>
              </table>
            </div>
          ) : null}
        </Card>
      ) : null}
      <Segmented label="عرض" value={view} onChange={setView} options={[
        { value: "menu", label: "المنيو" },
        { value: "prices", label: "جدول الأسعار" },
        { value: "recommended", label: "المميزة" },
        { value: "discount", label: "عليها خصم" },
        { value: "off", label: "مش متاحة" },
        { value: "side", label: "الخيارات الجانبية" },
      ]} />
      {view === "prices" ? <PriceTable items={items} cats={cats} readOnly={!manage} /> : view === "side" ? <SideOptions readOnly={!manage} mods={mods} items={items} /> : (
        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          {view === "menu" ? (
            <Card className="grid content-start gap-2 p-3">
              <div className="flex items-center justify-between gap-2 px-1">
                <span className="text-[14px] font-semibold">الفئات <span className="num text-muted">({cats.length})</span></span>
                {manage && area.add ? <Button size="sm" variant="brass" icon={<Plus />} onClick={() => setCat("new")}>فئة</Button> : null}
              </div>
              <div className="grid max-h-[70vh] gap-1.5 overflow-y-auto">
                {cats.map((c) => (
                  <div key={c.id} className={cn("flex items-center gap-2 rounded-xl border p-2 transition-colors", current?.id === c.id ? "border-primary bg-primary-soft" : "border-line hover:bg-surface-2")}>
                    <button type="button" onClick={() => (setCatId(c.id), setQ(""))} className="flex min-w-0 flex-1 items-center gap-2 text-start">
                      {c.imageUrl ? <img src={c.imageUrl} alt="" className="size-10 shrink-0 rounded-lg object-cover" /> : <span className="size-10 shrink-0 rounded-lg bg-surface-3" />}
                      <span className={cn("min-w-0 flex-1 text-[13.5px] font-semibold leading-tight", !c.active && "text-faint line-through")}>
                        {c.name.ar}
                        {c.name.en && c.name.en !== c.name.ar ? <span className="block text-[11.5px] font-medium text-muted" dir="ltr">{c.name.en}</span> : null}
                        <span className="num block text-[11.5px] font-medium text-muted">{branchItems.filter((i) => i.categoryId === c.id).length} صنف{c.code != null ? ` · أكواد ${blockRange(c.code).from}–${blockRange(c.code).to}` : ""}</span>
                      </span>
                    </button>
                    {manage ? (
                      <>
                        <IconButton size="sm" label={c.active ? "إخفاء الفئة" : "إظهار الفئة"} onClick={() => flipCat(c)}>{c.active ? <Eye /> : <EyeOff />}</IconButton>
                        <IconButton size="sm" label="تعديل الفئة" onClick={() => setCat(c)}><Pencil /></IconButton>
                      </>
                    ) : null}
                  </div>
                ))}
                {!cats.length ? <EmptyState compact icon={<BookOpen />} title="مافيش فئات" body="ضيف فئة، أو استورد المنيو من Bonbell." /> : null}
              </div>
            </Card>
          ) : null}
          <Card className={cn("grid content-start gap-3 overflow-hidden p-3", view !== "menu" && "lg:col-span-2")}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 text-[15px] font-semibold">{view === "menu" ? (q.trim() ? "نتيجة البحث" : current ? `أصناف ${current.name.ar}` : "الأصناف") : view === "recommended" ? "الأصناف المميزة" : view === "discount" ? "الأصناف اللي عليها خصم" : "الأصناف المخفية أو الخلصانة"}</span>
              <Input icon={<Search />} wrapClassName="w-56" placeholder="ابحث باسم الصنف" value={q} onChange={(e) => setQ(e.target.value)} />
              {manage && area.add && view === "menu" ? <Button size="sm" icon={<Plus />} disabled={!cats.length} onClick={() => setItem("new")}>إضافة صنف</Button> : null}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-[13.5px]">
                <thead>
                  <tr className="border-b border-line text-start text-[12.5px] text-muted">
                    <th className="p-2 text-start font-semibold">الكود</th>
                    <th className="p-2 text-start font-semibold">الصورة</th>
                    <th className="p-2 text-start font-semibold">الاسم</th>
                    <th className="p-2 text-start font-semibold">السعر</th>
                    <th className="p-2 text-start font-semibold">الخصم</th>
                    <th className="p-2 text-start font-semibold">الوصف</th>
                    <th className="p-2 text-start font-semibold">ظاهر</th>
                    <th className="p-2 text-start font-semibold">مميز</th>
                    <th className="p-2 text-start font-semibold">القنوات</th>
                    <th className="p-2 text-start font-semibold">الخيارات</th>
                    <th className="p-2 text-start font-semibold" title="آخر 30 يوم: لوحده + جوه أصناف تانية">المبيعات</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((i) => {
                    const gs = groupsOf(i, groups);
                    return (
                      <tr key={i.id} className="cursor-pointer border-b border-line/60 hover:bg-surface-2" onClick={() => setDetail(i.id)}>
                        <td className="num p-2 font-semibold text-muted">{i.sku || "—"}</td>
                        <td className="p-2">{i.imageUrl ? <img src={i.imageUrl} alt="" loading="lazy" className="size-12 rounded-lg object-cover" /> : <span className="block size-12 rounded-lg bg-surface-3" />}</td>
                        <td className="p-2 font-semibold">{i.name.ar}<DiscountBadge item={i} /><FameBadge fame={fame.get(i.id)} />{i.name.en && i.name.en !== i.name.ar ? <span className="block text-[12px] font-medium text-muted" dir="ltr">{i.name.en}</span> : null}</td>
                        <td className="num p-2 font-semibold">{egp(i.price)}{i.discount ? <span className="block text-[12px] text-success">{egp(i.price - i.discount)}</span> : null}</td>
                        <td className="num p-2">{pctOf(i) ? `${pctOf(i)}%` : "0"}</td>
                        <td className="max-w-[220px] p-2 text-muted"><span className="line-clamp-2">{i.description.ar || i.description.en || "—"}</span></td>
                        <td className="p-2" onClick={(e) => e.stopPropagation()}><Toggle on={i.active} disabled={!manage} label="ظاهر" onChange={(v) => flip(i, { active: v })} /></td>
                        <td className="p-2" onClick={(e) => e.stopPropagation()}><Toggle on={!!i.recommended} disabled={!manage} label="مميز" onChange={(v) => flip(i, { recommended: v })} /></td>
                        <td className="p-2"><div className="flex flex-wrap gap-1">{channels.filter((c) => soldOn(i, c)).map((c) => <Badge key={c.id} size="sm">{c.name}</Badge>)}</div></td>
                        <td className="num p-2 text-muted">{gs.length ? `${gs.length} مجموعة` : "—"}</td>
                        <td className="num p-2">{(() => { const s = sold.get(i.id); if (!s) return <span className="text-muted">0</span>; return <span>{s.direct + s.inside}{s.inside ? <span className="block text-[11.5px] text-muted">منها {s.inside} جوه أصناف تانية</span> : null}</span>; })()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!rows.length ? <EmptyState compact icon={<BookOpen />} title="مافيش أصناف هنا" /> : null}
            </div>
          </Card>
        </div>
      )}
      {cat ? <CategoryDialog key={cat === "new" ? "new" : cat.id} cat={cat === "new" ? null : cat} sort={cats.length + 1} count={cat === "new" ? 0 : items.filter((i) => i.categoryId === cat.id).length} onClose={() => setCat(null)} /> : null}
      {item ? <ItemDialog key={item === "new" ? "new" : item.id} item={item === "new" ? null : item} cats={cats} items={items} defaultCat={current?.id ?? ""} sort={items.length + 1} onClose={() => setItem(null)} onSaved={(id) => setDetail(id)} /> : null}
      {open ? <ItemDetail item={open} cats={cats} groups={groups} mods={mods} manage={manage} canDelete={area.delete} onEdit={() => setItem(open)} onClose={() => setDetail(null)} /> : null}
    </div>
  );
}

/** علامة % بلون بارز على الصنف اللي عليه خصم (Mohammed 2026-11-24) */
export function DiscountBadge({ item }: { item: Pick<MenuItem, "price" | "discount"> }) {
  const p = pctOf(item);
  return p ? <span className="num ms-1.5 inline-flex items-center rounded-full bg-danger px-1.5 py-0.5 align-middle text-[11px] font-bold leading-none text-white" dir="ltr">{p}%</span> : null;
}

export function FameBadge({ fame }: { fame?: Fame }) {
  if (!fame) return null;
  return <Badge size="sm" tone={fame === "top" ? "brass" : "info"} className="ms-1.5 align-middle" icon={fame === "top" ? <Flame /> : <TrendingUp />}>{FAME_LABEL[fame]}</Badge>;
}

function Toggle({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={cn("relative h-6 w-11 rounded-full transition-colors disabled:opacity-60", on ? "bg-success" : "bg-surface-3 ring-1 ring-line")}>
      <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", on ? "start-[22px]" : "start-0.5")} />
    </button>
  );
}

/** تفاصيل الصنف: بياناته ومجموعات الخيارات بأسعارها، مع إضافة وتعديل وحذف المجموعات */
function ItemDetail({ item, cats, groups, mods, manage, canDelete, onEdit, onClose }: { item: MenuItem; cats: MenuCategory[]; groups: ModifierGroup[]; mods: Modifier[]; manage: boolean; canDelete: boolean; onEdit: () => void; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const channels = channelsOf(useLive("settings").data[0]);
  const gs = groupsOf(item, groups);
  const [group, setGroup] = useState<ModifierGroup | "new" | null>(null);
  const [drop, setDrop] = useState<ModifierGroup | null>(null);
  const [dropItem, setDropItem] = useState(false);
  const [busy, setBusy] = useState(false);
  const removeGroup = async (g: ModifierGroup) => {
    setBusy(true);
    try {
      await db.update("menuItems", item.id, { modifierGroupIds: item.modifierGroupIds.filter((x) => x !== g.id) });
      // the group goes with it only when no other item uses it
      if (!(await db.list("menuItems")).some((i) => i.id !== item.id && i.modifierGroupIds.includes(g.id))) await db.remove("modifierGroups", g.id);
      toast({ tone: "success", title: "اتحذفت المجموعة" });
      setDrop(null);
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحذف", description: err(e) });
    } finally {
      setBusy(false);
    }
  };
  const move = async (g: ModifierGroup, d: -1 | 1) => {
    const ids = [...item.modifierGroupIds];
    const i = ids.indexOf(g.id);
    const j = i + d;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await db.update("menuItems", item.id, { modifierGroupIds: ids });
  };
  const removeItem = async () => {
    setBusy(true);
    try {
      if ((await db.list("orderItems", { where: { itemId: item.id }, limit: 1 })).length) {
        // sold before: its orders point at it, so it is hidden instead
        await db.update("menuItems", item.id, { active: false });
        toast({ tone: "success", title: "الصنف اتباع قبل كده، فاتخفى بدل ما يتحذف" });
      } else {
        await db.remove("menuItems", item.id);
        toast({ tone: "success", title: "اتحذف الصنف" });
      }
      onClose();
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحذف", description: err(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} size="xl" title={item.name.ar} description={item.name.en !== item.name.ar ? item.name.en : undefined}
      footer={<div className="flex w-full flex-wrap justify-between gap-2">
        <div>{manage && canDelete ? <Button variant="danger-soft" icon={<Trash2 />} onClick={() => setDropItem(true)}>حذف الصنف</Button> : null}</div>
        <div className="flex gap-2"><Button variant="ghost" onClick={onClose}>إغلاق</Button>{manage ? <Button icon={<Pencil />} onClick={onEdit}>تعديل الصنف</Button> : null}</div>
      </div>}>
      <div className="grid gap-5">
        <div className="grid gap-4 sm:grid-cols-[160px_minmax(0,1fr)]">
          {item.imageUrl ? <img src={item.imageUrl} alt="" className="aspect-square w-full rounded-2xl object-cover" /> : <div className="aspect-square w-full rounded-2xl bg-surface-3" />}
          <div className="grid content-start gap-2 text-[14px]">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Info label="السعر">{egp(item.price)} ج</Info>
              <Info label="الخصم">{pctOf(item) ? `${pctOf(item)}% (${egp(item.price - (item.discount ?? 0))} ج)` : "—"}</Info>
              <Info label="وقت التحضير">{item.prepMinutes} دقيقة{item.calories ? ` · ${item.calories} سعر` : ""}</Info>
              <Info label="الفئة">{cats.find((c) => c.id === item.categoryId)?.name.ar ?? "—"}</Info>
            </div>
            {item.description.ar ? <p className="text-ink-2">{item.description.ar}</p> : null}
            {item.description.en ? <p className="text-muted" dir="ltr">{item.description.en}</p> : null}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12.5px] text-muted">القنوات:</span>
              {channels.filter((c) => soldOn(item, c)).map((c) => <Badge key={c.id} size="sm">{c.name}</Badge>)}
              {!item.active ? <Badge tone="danger" size="sm">مخفي</Badge> : null}
              {item.recommended ? <Badge tone="brass" size="sm"><Star className="size-3" /> مميز</Badge> : null}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[15px] font-semibold">مجموعات الخيارات <span className="num text-muted">({gs.length})</span></span>
          {manage ? <Button size="sm" variant="brass" icon={<Plus />} onClick={() => setGroup("new")}>إضافة مجموعة</Button> : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {gs.map((g, gi) => {
            const opts = mods.filter((m) => m.groupId === g.id);
            return (
              <Card key={g.id} className="grid content-start gap-2 p-3">
                <div className="flex items-start gap-1">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] text-muted">اسم المجموعة</p>
                    <p className="font-semibold">{g.name.ar}{g.name.en && g.name.en !== g.name.ar ? <span className="mx-1.5 text-[12px] text-muted" dir="ltr">{g.name.en}</span> : null}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge size="sm" tone={g.required ?? g.min > 0 ? "brass" : undefined}>{g.required ?? g.min > 0 ? "مطلوب" : "اختياري"}</Badge>
                      <Badge size="sm">{g.multi ?? g.max > 1 ? `أكتر من خيار (لحد ${g.max})` : "خيار واحد"}</Badge>
                    </div>
                  </div>
                  {manage ? (
                    <div className="flex">
                      <IconButton size="sm" label="لفوق" disabled={gi === 0} onClick={() => move(g, -1)}>↑</IconButton>
                      <IconButton size="sm" label="لتحت" disabled={gi === gs.length - 1} onClick={() => move(g, 1)}>↓</IconButton>
                      <IconButton size="sm" label="تعديل المجموعة" onClick={() => setGroup(g)}><Pencil /></IconButton>
                      <IconButton size="sm" label="حذف المجموعة" onClick={() => setDrop(g)}><Trash2 /></IconButton>
                    </div>
                  ) : null}
                </div>
                <table className="w-full text-[13px]">
                  <tbody>
                    {opts.map((m) => (
                      <tr key={m.id} className={cn("border-t border-line/60", !m.available && "text-faint line-through")}>
                        <td className="py-1.5">{m.name.ar}{m.name.en && m.name.en !== m.name.ar ? <span className="block text-[11.5px] text-muted" dir="ltr">{m.name.en}</span> : null}</td>
                        <td className="num py-1.5 text-end font-semibold">{m.price ? `+${egp(m.price)}` : "0"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            );
          })}
        </div>
        {!gs.length ? <EmptyState compact icon={<BookOpen />} title="الصنف مالوش خيارات" body={manage ? "ضيف مجموعة زي الحجم أو الإضافات أو الملاحظات، وكل خيار بسعره." : undefined} /> : null}
      </div>
      {group ? <GroupDialog key={group === "new" ? "new" : group.id} item={item} group={group === "new" ? null : group} mods={mods} onClose={() => setGroup(null)} /> : null}
      <Confirm open={!!drop} onClose={() => setDrop(null)} onConfirm={() => drop && removeGroup(drop)} loading={busy} danger title="حذف المجموعة؟" confirmLabel="حذف"
        description={drop ? `هتتشال "${drop.name.ar}" وخياراتها من الصنف ده. الطلبات القديمة بتفضل زي ما هي.` : undefined} />
      <Confirm open={dropItem} onClose={() => setDropItem(false)} onConfirm={removeItem} loading={busy} danger title="حذف الصنف؟" confirmLabel="حذف"
        description="لو الصنف اتباع قبل كده هيتخفى بس، علشان الطلبات القديمة." />
    </Dialog>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line px-3 py-2">
      <p className="text-[11.5px] text-muted">{label}</p>
      <p className="num font-semibold">{children}</p>
    </div>
  );
}

function CategoryDialog({ cat, sort, count, onClose }: { cat: MenuCategory | null; sort: number; count: number; onClose: () => void }) {
  const db = useDb();
  const { toast } = useToast();
  const area = useArea();
  const [d, setD] = useState({ ar: cat?.name.ar ?? "", en: cat?.name.en ?? "", imageUrl: cat?.imageUrl ?? null, active: cat?.active ?? true });
  const [busy, setBusy] = useState(false);
  const [drop, setDrop] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const row = { name: { ar: d.ar.trim(), en: d.en.trim() || d.ar.trim() }, imageUrl: d.imageUrl, active: d.active };
      if (cat) await db.update("menuCategories", cat.id, row);
      else await db.insert("menuCategories", { ...row, sort, color: "#F8BB18", icon: "utensils", stationId: null });
      toast({ tone: "success", title: "اتحفظت الفئة" });
      onClose();
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحفظ", description: err(e) });
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!cat) return;
    setBusy(true);
    try {
      await db.remove("menuCategories", cat.id);
      toast({ tone: "success", title: "اتحذفت الفئة" });
      onClose();
    } catch (e) {
      toast({ tone: "error", title: "تعذر الحذف", description: err(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} size="md" title={cat ? "تعديل الفئة" : "إضافة فئة"}
      footer={<div className="flex w-full justify-between gap-2">
        <div>{cat && area.delete ? <Button variant="danger-soft" icon={<Trash2 />} disabled={count > 0} title={count ? "انقل أصنافها أو احذفها الأول" : undefined} onClick={() => setDrop(true)}>حذف</Button> : null}</div>
        <div className="flex gap-2"><Button variant="ghost" onClick={onClose}>إلغاء</Button><Button loading={busy} disabled={!d.ar.trim()} onClick={save}>حفظ</Button></div>
      </div>}>
      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="الاسم بالعربي" value={d.ar} onChange={(e) => setD({ ...d, ar: e.target.value })} />
          <Input label="الاسم بالإنجليزي" dir="ltr" value={d.en} onChange={(e) => setD({ ...d, en: e.target.value })} />
        </div>
        <ImageField value={d.imageUrl} onChange={(imageUrl) => setD({ ...d, imageUrl })} />
        <Switch checked={d.active} onChange={(active) => setD({ ...d, active })} label="ظاهرة" description="الفئة المخفية ما بتظهرش للكاشير" />
        {cat && count ? <p className="text-[12.5px] text-muted">فيها {count} صنف، فما ينفعش تتحذف قبل ما أصنافها تتنقل أو تتحذف.</p> : null}
      </div>
      <Confirm open={drop} onClose={() => setDrop(false)} onConfirm={remove} loading={busy} danger title="حذف الفئة؟" confirmLabel="حذف" />
    </Dialog>
  );
}
