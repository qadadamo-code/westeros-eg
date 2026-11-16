import { useState } from "react";
import { Plus, Printer } from "lucide-react";
import { COST_CONTROL_ONLY } from "@/costControl";
import { useDb, useLive } from "@/data/hooks";
import type { MfgBatch, MfgBatchOutput } from "@/data/types";
import { useT } from "@/i18n/i18n";
import { cn } from "@/lib/cn";
import { Button, Dialog, Select, useToast } from "@/ui";
import { BatchLabel, labelCopies, labelSizes, printLabels, saveLabelSize, savedLabelSize } from "./Label";
import { countLabels } from "./ops";
import { Num } from "./ui";

/** Preview and print the stickers of a batch: one per bag / container, for each product of the batch. */
export function LabelDialog({ batch, onClose, justSaved }: { batch: MfgBatch | null; onClose: () => void; justSaved?: boolean }) {
  const { L, loc } = useT();
  const db = useDb();
  const { toast } = useToast();
  const products = useLive("mfgProducts").data;
  const settings = useLive("mfgSettings").data[0];
  const sizes = labelSizes(settings?.lists?.labelSizes);
  const [sizeId, setSizeId] = useState(() => savedLabelSize(sizes).id);
  const size = sizes.find((s) => s.id === sizeId) ?? savedLabelSize(sizes);
  const [typed, setTyped] = useState(1);
  const [pick, setPick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [w, setW] = useState(0);
  const [h, setH] = useState(0);
  if (!batch) return null;
  const output = batch.outputs[Math.min(pick, batch.outputs.length - 1)];
  // Cost Control: the number of stickers is not typed; it is the produced quantity over what one storage unit holds
  const auto = COST_CONTROL_ONLY;
  const holds = (o: MfgBatchOutput) => products.find((p) => p.id === o.productId)?.storageQty ?? null;
  const copiesOf = (o: MfgBatchOutput) => (auto ? labelCopies(o, holds(o)) : Math.max(1, typed));
  const copies = copiesOf(output);
  const made = output.unit === "pc" ? output.count ?? 0 : output.weightKg ?? 0;
  const print = async (all: boolean) => {
    setBusy(true);
    const outs = all ? batch.outputs : [output];
    const ns = outs.map(copiesOf);
    try {
      await printLabels(batch, outs, size, ns);
      await countLabels(db, batch.id, ns.reduce((a, n) => a + n, 0));
    } finally {
      setBusy(false);
    }
  };
  const choose = (id: string) => {
    setSizeId(id);
    saveLabelSize(id);
  };
  const addSize = async () => {
    const nw = Math.round(w * 10) / 10;
    const nh = Math.round(h * 10) / 10;
    if (!(nw >= 15 && nw <= 150 && nh >= 10 && nh <= 150)) return toast({ tone: "error", title: L("اكتب العرض والارتفاع بالمليمتر (مثلاً 50 × 25)", "Type the width and height in mm (for example 50 × 25)") });
    const id = `${nw}x${nh}`;
    try {
      if (!sizes.some((s) => s.id === id)) {
        const lists = settings?.lists;
        if (!settings || !lists) return toast({ tone: "error", title: L("افتح ثوابت النظام مرة واحدة أولاً ثم أضف المقاس", "Open the system constants once first, then add the size") });
        await db.update("mfgSettings", settings.id, { lists: { ...lists, labelSizes: [...(lists.labelSizes ?? []), { w: nw, h: nh }] } });
      }
      choose(id);
      setAdding(false);
      setW(0);
      setH(0);
    } catch (e) {
      toast({ tone: "error", title: L("لم يُحفظ المقاس", "The size was not saved"), description: String((e as Error).message ?? e) });
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={justSaved ? <span>{L("تم حفظ التشغيلة", "Batch saved")} <bdi dir="ltr" className="num">{batch.number}</bdi></span> : L("ستيكر الباتش", "Batch sticker")}
      description={L("ستيكر لكل كيس أو علبة: المنتج، رقم الباتش، تاريخ الإنتاج والانتهاء واسم الشيف", "One sticker per bag or container: product, batch number, production and expiry dates and the chef")}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{justSaved ? L("بدون طباعة", "Skip printing") : L("إغلاق", "Close")}</Button>
          {batch.outputs.length > 1 ? (
            <Button variant="outline" icon={<Printer />} loading={busy} onClick={() => print(true)}>{L("اطبع لكل المنتجات", "Print for all products")}</Button>
          ) : null}
          <Button icon={<Printer />} loading={busy} onClick={() => print(false)}>{L("اطبع الستيكر", "Print sticker")}</Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div className="grid content-start gap-3">
          {batch.outputs.length > 1 ? (
            <div className="flex flex-wrap gap-1.5">
              {batch.outputs.map((o, i) => (
                <button key={i} type="button" onClick={() => setPick(i)} className={cn("rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors", i === pick ? "border-primary bg-primary text-primary-ink" : "border-line bg-surface hover:border-line-strong")}>
                  {loc(o.name)}
                </button>
              ))}
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            {auto ? (
              <div className="grid content-start gap-1">
                <span className="text-[13px] font-semibold text-ink-2">{L("عدد النسخ", "Copies")}</span>
                <div className="num flex min-h-12 items-center rounded-xl bg-surface-2 px-3 text-[18px] font-bold">{copies}</div>
                <span className="text-[12px] text-muted">
                  {holds(output) ? <bdi dir="rtl">{`${made} ÷ ${holds(output)} ${L("في وحدة التخزين", "per storage unit")}`}</bdi> : L("كمية وحدة التخزين غير محددة للمنتج، فالنسخة واحدة", "No storage quantity on the product, so one copy")}
                </span>
              </div>
            ) : (
              <Num label={L("عدد النسخ", "Copies")} value={typed} onChange={(n) => setTyped(Math.round(n))} />
            )}
            <Select label={L("مقاس الستيكر", "Sticker size")} value={size.id} onChange={(e) => choose(e.target.value)} options={sizes.map((s) => ({ value: s.id, label: `${s.w} × ${s.h} ${L("مم", "mm")}` }))} />
          </div>
          {adding ? (
            <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 rounded-xl border border-line p-3">
              <Num label={L("العرض (مم)", "Width (mm)")} value={w} onChange={setW} />
              <Num label={L("الارتفاع (مم)", "Height (mm)")} value={h} onChange={setH} />
              <Button onClick={addSize}>{L("إضافة", "Add")}</Button>
            </div>
          ) : (
            <Button variant="ghost" size="sm" icon={<Plus className="size-4" />} className="justify-self-start" onClick={() => setAdding(true)}>
              {L("إضافة مقاس جديد", "Add a new size")}
            </Button>
          )}
          <p className="text-[12.5px] text-muted">
            {L("اختر طابعة الستيكر من نافذة الطباعة، ومقاس الورق يتحدد تلقائياً بمقاس الستيكر.", "Choose the label printer in the print dialog; the page size follows the sticker size.")}
            {batch.labelsPrinted ? ` ${L(`طُبع ${batch.labelsPrinted} ستيكر لهذا الباتش.`, `${batch.labelsPrinted} stickers printed so far.`)}` : ""}
          </p>
        </div>
        <div className="grid place-items-center rounded-2xl bg-surface-3 p-4">
          <div className="shadow-sf ring-1 ring-black/10">
            <BatchLabel batch={batch} output={output} size={size} index={1} of={copies} />
          </div>
        </div>
      </div>
    </Dialog>
  );
}
