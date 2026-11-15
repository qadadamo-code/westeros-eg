import { useState } from "react";
import { Printer } from "lucide-react";
import { useDb } from "@/data/hooks";
import type { MfgBatch } from "@/data/types";
import { useT } from "@/i18n/i18n";
import { cn } from "@/lib/cn";
import { Button, Dialog, Select } from "@/ui";
import { BatchLabel, LABEL_SIZES, printLabels, saveLabelSize, savedLabelSize } from "./Label";
import { countLabels } from "./ops";
import { Num } from "./ui";

/** Preview and print the stickers of a batch: one per bag / container, for each product of the batch. */
export function LabelDialog({ batch, onClose, justSaved }: { batch: MfgBatch | null; onClose: () => void; justSaved?: boolean }) {
  const { L, loc } = useT();
  const db = useDb();
  const [size, setSize] = useState(savedLabelSize);
  const [copies, setCopies] = useState(1);
  const [pick, setPick] = useState(0);
  const [busy, setBusy] = useState(false);
  if (!batch) return null;
  const output = batch.outputs[Math.min(pick, batch.outputs.length - 1)];
  const print = async (all: boolean) => {
    setBusy(true);
    const outs = all ? batch.outputs : [output];
    const n = Math.max(1, copies);
    try {
      await printLabels(batch, outs, size, n);
      await countLabels(db, batch.id, n * outs.length);
    } finally {
      setBusy(false);
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
            <Num label={L("عدد النسخ", "Copies")} value={copies} onChange={(n) => setCopies(Math.round(n))} />
            <Select
              label={L("مقاس الستيكر", "Sticker size")}
              value={size.id}
              onChange={(e) => {
                const s = LABEL_SIZES.find((x) => x.id === e.target.value) ?? LABEL_SIZES[0];
                setSize(s);
                saveLabelSize(s.id);
              }}
              options={LABEL_SIZES.map((s) => ({ value: s.id, label: `${s.w} × ${s.h} ${L("مم", "mm")}` }))}
            />
          </div>
          <p className="text-[12.5px] text-muted">
            {L("اختر طابعة الستيكر من نافذة الطباعة، ومقاس الورق يتحدد تلقائياً بمقاس الستيكر.", "Choose the label printer in the print dialog; the page size follows the sticker size.")}
            {batch.labelsPrinted ? ` ${L(`طُبع ${batch.labelsPrinted} ستيكر لهذا الباتش.`, `${batch.labelsPrinted} stickers printed so far.`)}` : ""}
          </p>
        </div>
        <div className="grid place-items-center rounded-2xl bg-surface-3 p-4">
          <div className="shadow-sf ring-1 ring-black/10">
            <BatchLabel batch={batch} output={output} size={size} index={1} of={Math.max(1, copies)} />
          </div>
        </div>
      </div>
    </Dialog>
  );
}
