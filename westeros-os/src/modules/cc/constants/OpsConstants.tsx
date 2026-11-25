/**
 * التشغيل > اعدادات التشغيل (Saqr 2026-11-25; moved out of ثوابت النظام the same day, one setup per branch):
 *   الكاشير       طابعات النظام (الاسم، الـ IP، الورق)، الجهاز ده متوصل بأنهي طابعة، طابعة فواتير الكاشير،
 *                 طابعات كل فئة في المنيو (أكتر من طابعة للفئة)، وشكل فاتورة الكاشير
 *   شاشة المطبخ  تفعيل طابعة المطبخ (أو الشغل على شاشة المطبخ الداخلية بس)، وشكل طلبية المطبخ
 */
import { lazy, Suspense, useState } from "react";
import { ArrowDown, ArrowUp, Check, ChefHat, Plus, Printer, Receipt, Trash2 } from "lucide-react";
import { useDb, useLive } from "@/data/hooks";
import type { KitchenTicketDesign, MfgSettings, PrintSetup, PrinterDef } from "@/data/types";
import { uuid } from "@/lib/id";
import { cn } from "@/lib/cn";
import { printNode } from "@/lib/receipt";
import { Button, Card, CardHeader, EmptyState, IconButton, Input, Segmented, Select, Skeleton, Switch } from "@/ui";
import { listsOf } from "../lib";
import { Confirm } from "../finance/ui";
import { KitchenTicketView, SAMPLE_TICKET, TICKET_KEYS, ticketLayout } from "../print/KitchenTicket";
import { devicePrinter, isReceipt, printOf, setDevicePrinter, withPrintFor } from "../print/setup";
import { queuePrint } from "../print/station";
import { StationSetup } from "../print/StationSetup";
import { useMay } from "../useAccess";
import { useSession } from "@/auth/session";
import { mainBranchOf, onMenuOf } from "../menu/menuBranch";

const InvoiceDesigner = lazy(() => import("@/modules/settings/invoice/InvoiceDesigner"));

export default function OpsConstants({ settings, branchId, readOnly }: { settings: MfgSettings; branchId: string; readOnly: boolean }) {
  const [part, setPart] = useState<"cashier" | "kitchen">("cashier");
  const db = useDb();
  const lists = listsOf(settings);
  const setup = printOf(lists, branchId);
  const save = (p: Partial<PrintSetup>) => db.update("mfgSettings", settings.id, { lists: withPrintFor(lists, branchId, p) });
  return (
    <div className="grid gap-5">
      <Segmented label="التشغيل" value={part} onChange={setPart} options={[{ value: "cashier", label: "الكاشير", icon: <Receipt /> }, { value: "kitchen", label: "شاشة المطبخ", icon: <ChefHat /> }]} />
      {part === "cashier" ? <Cashier setup={setup} save={save} readOnly={readOnly} /> : <Kitchen setup={setup} save={save} readOnly={readOnly} branchId={branchId} />}
    </div>
  );
}

type Props = { setup: PrintSetup; save: (p: Partial<PrintSetup>) => Promise<unknown>; readOnly: boolean };

function Cashier({ setup, save, readOnly }: Props) {
  const [del, setDel] = useState<PrinterDef | null>(null);
  const [mine, setMine] = useState(devicePrinter());
  const setPrinter = (id: string, p: Partial<PrinterDef>) => void save({ printers: setup.printers.map((x) => (x.id === id ? { ...x, ...p } : x)) });
  const add = () => void save({ printers: [...setup.printers, { id: uuid(), name: `طابعة ${setup.printers.length + 1}`, paper: "80", ip: "" }] });
  const remove = (id: string) => {
    const categoryPrinters = Object.fromEntries(Object.entries(setup.categoryPrinters).map(([c, ids]) => [c, ids.filter((x) => x !== id)]));
    void save({ printers: setup.printers.filter((x) => x.id !== id), categoryPrinters, receiptPrinterId: setup.receiptPrinterId === id ? null : setup.receiptPrinterId, kitchenDefaultPrinterId: setup.kitchenDefaultPrinterId === id ? null : setup.kitchenDefaultPrinterId });
  };
  const opts = [{ value: "", label: "بدون" }, ...setup.printers.filter((p) => isReceipt(p) || p.id === setup.receiptPrinterId).map((p) => ({ value: p.id, label: p.name }))];
  return (
    <div className="grid gap-5">
      <Card className="grid gap-3 p-4">
        <CardHeader title="طابعات النظام" subtitle="كل طابعة باسمها وعنوانها على الشبكة (IP) ومقاس ورقها" action={readOnly ? null : <Button size="sm" variant="outline" icon={<Plus />} onClick={add}>طابعة جديدة</Button>} />
        {!setup.printers.length ? <EmptyState compact icon={<Printer />} title="مفيش طابعات لسه" body="ضيف الطابعات الأول، وبعدين حدد طابعة الفواتير وطابعات فئات المنيو." /> : null}
        {setup.printers.map((p) => (
          <div key={p.id} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_9rem_8rem_auto]" data-printer={p.id}>
            <Input label="الاسم" defaultValue={p.name} disabled={readOnly} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== p.name) setPrinter(p.id, { name: v }); }} />
            <Input label="IP" dir="ltr" placeholder="192.168.1.50" defaultValue={p.ip ?? ""} disabled={readOnly} onBlur={(e) => { const v = e.target.value.trim(); if (v !== (p.ip ?? "")) setPrinter(p.id, { ip: v }); }} />
            <Select label="النوع" value={p.kind ?? "receipt"} disabled={readOnly} onChange={(e) => setPrinter(p.id, { kind: e.target.value as PrinterDef["kind"] })} options={[{ value: "receipt", label: "فواتير (الكاشير)" }, { value: "kitchen", label: "طلبيات (المطبخ)" }, { value: "label", label: "ستيكرات" }]} />
            {p.kind === "label" ? <Input label="الورق" value="مقاس الستيكر" disabled hint="بيتحدد وقت طباعة الستيكر" /> : <Select label="الورق" value={p.paper} disabled={readOnly} onChange={(e) => setPrinter(p.id, { paper: e.target.value as PrinterDef["paper"] })} options={[{ value: "80", label: "80 مم" }, { value: "58", label: "58 مم" }]} />}
            {readOnly ? <span /> : <IconButton label="حذف الطابعة" onClick={() => setDel(p)}><Trash2 /></IconButton>}
          </div>
        ))}
      </Card>

      <StationCard setup={setup} save={save} readOnly={readOnly} />

      {setup.printers.length && !setup.stationOn ? (
        <Card className="grid gap-3 p-4">
          <CardHeader title="الجهاز ده" subtitle="المتصفح بيطبع على الطابعة المتعرفة على الجهاز (ويندوز). اختار الطابعة اللي الجهاز ده بيطبع عليها، وهو هيطبع لوحده طلبيات المطبخ بتاعتها." />
          <Select aria-label="الجهاز ده متوصل بـ" value={mine ?? ""} onChange={(e) => { const v = e.target.value || null; setDevicePrinter(v); setMine(v); window.dispatchEvent(new Event("westeros-printer")); }}
            options={[{ value: "", label: "الجهاز ده مش متوصل بطابعة" }, ...setup.printers.map((p) => ({ value: p.id, label: `${p.name}${p.ip ? ` (${p.ip})` : ""}` }))]} />
          <p className="text-[12.5px] text-muted">علشان يطبع من غير ما يسأل كل مرة: شغّل كروم على الجهاز ده بخيار الطباعة الصامتة (--kiosk-printing) وخلي الطابعة دي هي الافتراضية في ويندوز.</p>
        </Card>
      ) : null}

      <Card className="grid gap-3 p-4">
        <CardHeader title="طابعة فواتير الكاشير" subtitle="الفاتورة بتطلع على مقاس ورق الطابعة دي" />
        <Select aria-label="طابعة فواتير الكاشير" value={setup.receiptPrinterId ?? ""} disabled={readOnly} onChange={(e) => void save({ receiptPrinterId: e.target.value || null })} options={opts} />
      </Card>

      <Card className="grid gap-3 p-4">
        <CardHeader title="طابعة ستيكرات الصلاحية (التصنيع)" subtitle="ستيكرات التشغيلات بتطلع عليها لما محطة الطباعة تكون مفعلة" />
        <Select aria-label="طابعة ستيكرات الصلاحية" value={setup.stickerPrinterId ?? ""} disabled={readOnly} onChange={(e) => void save({ stickerPrinterId: e.target.value || null })} options={[{ value: "", label: "بدون" }, ...setup.printers.filter((p) => p.kind === "label").map((p) => ({ value: p.id, label: p.name }))]} />
        {!setup.printers.some((p) => p.kind === "label") ? <p className="text-[12.5px] text-muted">عرّف طابعة نوعها (ستيكرات) في طابعات النظام الأول.</p> : null}
      </Card>

      <Suspense fallback={<Skeleton className="h-64" />}><InvoiceDesigner embedded /></Suspense>

      <Confirm open={!!del} onClose={() => setDel(null)} danger confirmLabel="حذف" title={`حذف ${del?.name ?? ""}؟`} description="هتتشال من الفئات ومن طابعة الفواتير لو كانت متحددة."
        onConfirm={() => { if (del) remove(del.id); setDel(null); }} />
    </div>
  );
}

const FIELDS: [keyof KitchenTicketDesign, string][] = [
  ["appCode", "كود الطلب (تطبيق توصيل)"], ["channel", "قناة البيع"], ["table", "رقم الترابيزة"], ["customer", "اسم العميل"], ["modifiers", "الإضافات"], ["notes", "الملاحظات"], ["time", "الوقت"], ["cashier", "الموظف"],
];

function Kitchen({ setup, save, readOnly, branchId }: Props & { branchId: string }) {
  const k = setup.kitchen;
  // the branch's own menu categories (منيو منفصل لكل فرع)
  const { branches } = useSession();
  const main = mainBranchOf(branches);
  const cats = useLive("menuCategories", { orderBy: [{ field: "sort" }] }).data.filter(onMenuOf(branchId, main));
  // طابعات الطلبيات (Saqr 2026-11-25): only order printers; one already picked stays shown
  const picked = new Set([setup.kitchenDefaultPrinterId, ...Object.values(setup.categoryPrinters).flat()]);
  const kitchenPrinters = setup.printers.filter((p) => p.kind === "kitchen" || picked.has(p.id));
  const toggleCat = (catId: string, pid: string) => {
    const cur = setup.categoryPrinters[catId] ?? [];
    void save({ categoryPrinters: { ...setup.categoryPrinters, [catId]: cur.includes(pid) ? cur.filter((x) => x !== pid) : [...cur, pid] } });
  };

  const setK = (p: Partial<KitchenTicketDesign>) => void save({ kitchen: { ...k, ...p } });
  const paper = setup.printers.find((p) => p.id === setup.kitchenDefaultPrinterId)?.paper ?? "80";
  return (
    <div className="grid gap-5">
      <Card className="grid gap-3 p-4">
        <Switch checked={setup.kitchenPrint} disabled={readOnly} onChange={(v) => void save({ kitchenPrint: v })} label="تفعيل طابعة المطبخ"
          description={setup.kitchenPrint ? "طلبيات المطبخ بتتطبع على طابعات الفئات، وبتظهر كمان في شاشة المطبخ." : "مقفولة: المطبخ شغال على شاشة المطبخ الداخلية بس، والطلبيات بتظهر فيها."} />
        {setup.kitchenPrint ? (
          <>
            <Select label="طابعة المطبخ الافتراضية" value={setup.kitchenDefaultPrinterId ?? ""} disabled={readOnly} onChange={(e) => void save({ kitchenDefaultPrinterId: e.target.value || null })}
              options={[{ value: "", label: "بدون" }, ...kitchenPrinters.map((p) => ({ value: p.id, label: p.name }))]} />
            {!kitchenPrinters.length ? <p className="text-[13px] font-semibold text-warn">مفيش طابعات طلبيات: عرّفها بنوع (طلبيات) من تبويب الكاشير.</p> : null}
          </>
        ) : null}
      </Card>

      <Card className="grid gap-3 p-4">
        <CardHeader title="طابعات فئات المنيو" subtitle="طلبيات المطبخ بتتطبع حسب فئة الصنف. كل فئة تقدر تطبع على أكتر من طابعة، والفئة اللي من غير طابعة بتطبع على طابعة المطبخ الافتراضية." />
        {!kitchenPrinters.length ? <p className="text-[13.5px] text-muted">عرّف طابعة نوعها (طلبيات) في طابعات النظام من تبويب الكاشير الأول.</p> : !cats.length ? <p className="text-[13.5px] text-muted">مفيش فئات في المنيو.</p> : (
          <div className="divide-y divide-line">
            {cats.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-2 py-2.5" data-cat-printers={c.id}>
                <p className="min-w-36 flex-1 text-[14.5px] font-semibold">{c.name.ar || c.name.en}</p>
                {kitchenPrinters.map((p) => {
                  const on = (setup.categoryPrinters[c.id] ?? []).includes(p.id);
                  return (
                    <button key={p.id} type="button" disabled={readOnly} onClick={() => toggleCat(c.id, p.id)}
                      className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13.5px] font-semibold", on ? "border-brass bg-brass/15 text-brass-text" : "border-line text-muted hover:text-ink")}>
                      {on ? <Check className="size-3.5" /> : null}{p.name}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card className="grid gap-3 p-4">
          <CardHeader title="شكل طلبية المطبخ" />
          <Input label="العنوان فوق الطلبية" defaultValue={k.header} disabled={readOnly} onBlur={(e) => e.target.value !== k.header && setK({ header: e.target.value })} />
          <Select label="حجم الخط" value={String(k.fontSize)} disabled={readOnly} onChange={(e) => setK({ fontSize: Number(e.target.value) })} options={[12, 13, 14, 15, 16, 18, 20, 22].map((n) => ({ value: String(n), label: `${n}` }))} />
          <div className="grid gap-2 sm:grid-cols-2">
            {FIELDS.map(([key, label]) => <Switch key={key} checked={key === "appCode" ? k.appCode !== false : !!k[key]} disabled={readOnly} onChange={(v) => setK({ [key]: v })} label={label} />)}
          </div>
          <Button variant="outline" icon={<Printer />} onClick={() => void printNode(<KitchenTicketView data={SAMPLE_TICKET} design={k} paper={paper} />, paper)}>اطبع طلبية تجربة</Button>
          <TicketOrder design={k} set={setK} readOnly={readOnly} />
        </Card>
        <div className="grid place-items-center rounded-2xl bg-surface-3 p-4">
          <div className="shadow-sf-lg"><KitchenTicketView data={SAMPLE_TICKET} design={k} paper={paper} /></div>
        </div>
      </div>
    </div>
  );
}

/** محطة الطباعة: the switch, the program download (permission "محطة الطباعة") and the station screen */
function StationCard({ setup, save, readOnly }: Props) {
  const may = useMay();
  const db = useDb();
  const { staff } = useSession();
  const allowed = may("print.station", "view");
  return (
    <Card className="grid gap-3 p-4" data-station-card>
      <CardHeader title="محطة الطباعة" subtitle="جهاز واحد في المطعم (كمبيوتر ويندوز أو تابلت أندرويد) بيطبع طلبات كل الأجهزة (أندرويد، آيفون، ويندوز) على الطابعات بالـ IP" />
      <Switch checked={!!setup.stationOn} disabled={readOnly} onChange={(v) => void save({ stationOn: v })} label="تفعيل محطة الطباعة"
        description={setup.stationOn ? "الفواتير والستيكرات من أي جهاز بتروح للمحطة، وطلبيات المطبخ بتطلع منها على طابعات الفئات." : "مقفولة: كل جهاز بيطبع من المتصفح على الطابعة المتعرفة عليه."} />
      {allowed ? (
        <div className="grid gap-2 rounded-xl bg-surface-2 p-3 text-[13.5px]">
          <p className="font-semibold">تشغيل المحطة على جهاز الطباعة:</p>
          <StationSetup />
          {setup.stationOn ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {setup.printers.filter((p) => p.ip && p.kind !== "label").map((p) => (
                <Button key={p.id} size="sm" variant="outline" icon={<Printer />} onClick={() => void queuePrint(db, { printerId: p.id, kind: "test", payload: {} }, staff?.id ?? null)}>تجربة {p.name}</Button>
              ))}
            </div>
          ) : null}
        </div>
      ) : <p className="text-[12.5px] text-muted">تنزيل البرنامج محتاج صلاحية (محطة الطباعة) من الأدوار.</p>}
    </Card>
  );
}

/** ترتيب بيانات طلبية المطبخ ومكانها (Saqr 2026-11-25) */
function TicketOrder({ design, set, readOnly }: { design: KitchenTicketDesign; set: (p: Partial<KitchenTicketDesign>) => void; readOnly: boolean }) {
  const { order, bottom } = ticketLayout(design);
  const label = (k: string) => TICKET_KEYS.find((m) => m.key === k)?.label ?? k;
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    set({ layout: { order: next, bottom } });
  };
  const place = (k: string, under: boolean) => set({ layout: { order, bottom: under ? [...bottom.filter((x) => x !== k), k] : bottom.filter((x) => x !== k) } });
  return (
    <div className="grid gap-1 border-t border-line pt-3">
      <p className="text-[13.5px] font-semibold">ترتيب البيانات ومكانها في الطلبية</p>
      <p className="text-[12.5px] text-muted">رتّب بالأسهم، واختار كل سطر يظهر فوق الأصناف ولا تحتها.</p>
      <div className="divide-y divide-line">
        {order.map((k, i) => (
          <div key={k} className="flex items-center gap-2 py-1.5" data-ticket-order={k}>
            <span className="num w-5 text-[12.5px] text-muted">{i + 1}</span>
            <span className="flex-1 text-[14px] font-medium">{label(k)}</span>
            <Segmented size="sm" label={label(k)} value={bottom.includes(k) ? "bottom" : "top"} onChange={(v) => !readOnly && place(k, v === "bottom")} options={[{ value: "top", label: "فوق" }, { value: "bottom", label: "تحت" }]} />
            <Button size="sm" variant="ghost" aria-label="لفوق" disabled={readOnly || i === 0} onClick={() => move(i, -1)} icon={<ArrowUp className="size-4" />} />
            <Button size="sm" variant="ghost" aria-label="لتحت" disabled={readOnly || i === order.length - 1} onClick={() => move(i, 1)} icon={<ArrowDown className="size-4" />} />
          </div>
        ))}
      </div>
    </div>
  );
}
