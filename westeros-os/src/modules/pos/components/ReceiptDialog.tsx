/** Receipt preview with paper switch (58/80 mm, A4) and print. */
import { useEffect, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { Printer, ShieldAlert, ShieldCheck } from "lucide-react";
import type { InvoiceDesign } from "@/data/types";
import { useT } from "@/i18n/i18n";
import { printNode, ReceiptView, type ReceiptModel } from "@/lib/receipt";
import { Button, Dialog, Segmented, useHotkeys, useReduced } from "@/ui";
import { useDb, useLive } from "@/data/hooks";
import { useSession } from "@/auth/session";
import { useToast } from "@/ui";
import { queuePrint, viaStation } from "@/modules/cc/print/station";
import { listsOf } from "@/modules/cc/lib";
import { printOf } from "@/modules/cc/print/setup";

export function ReceiptDialog({ open, onClose, model, title, etaError, actions }: { open: boolean; onClose: () => void; model: ReceiptModel | null; title?: string; etaError?: string | null; actions?: ReactNode }) {
  const { L } = useT();
  const reduced = useReduced();
  const [paper, setPaper] = useState<InvoiceDesign["paper"]>("80");
  // طابعة فواتير الكاشير (التشغيل > اعدادات التشغيل): its paper wins over the design's
  const setup = printOf(listsOf(useLive("mfgSettings").data[0]), useSession().branchId);
  const printer = setup.printers.find((p) => p.id === setup.receiptPrinterId) ?? null;
  useEffect(() => {
    if (open && model) setPaper(printer?.paper ?? model.design.paper);
  }, [open, model?.design.paper, printer?.paper]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = model ? { ...model, design: { ...model.design, paper } } : null;
  const db = useDb();
  const { staff } = useSession();
  const { toast } = useToast();
  // محطة الطباعة: from any device the receipt goes to the station, which prints it on the receipt printer by IP
  const station = viaStation(setup, setup.receiptPrinterId);
  const print = () => {
    if (!m) return;
    if (station) return void queuePrint(db, { printerId: station.id, kind: "receipt", payload: { model: m } }, staff?.id ?? null).then(() => toast({ title: L(`اتبعتت للطباعة على ${station.name}`, `Sent to ${station.name}`), tone: "success", duration: 1800 }), () => printNode(<ReceiptView model={m} />, paper));
    return printNode(<ReceiptView model={m} />, paper);
  };
  useHotkeys({ "mod+p": (e) => (e.preventDefault(), print()) }, { enabled: open });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size={paper === "a4" ? "xl" : "md"}
      title={title ?? L("الإيصال", "Receipt")}
      footer={
        <>
          {actions}
          <Button size="lg" icon={<Printer className="size-5" />} onClick={print} data-autofocus>
            {L("اطبع", "Print")}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        {printer ? <p className="text-[13px] text-muted">{L(`الطابعة: ${printer.name}${printer.ip ? ` (${printer.ip})` : ""}`, `Printer: ${printer.name}`)}</p> : null}
        <Segmented label={L("مقاس الورق", "Paper")} value={paper} onChange={setPaper} options={[{ value: "58", label: "58mm" }, { value: "80", label: "80mm" }, { value: "a4", label: "A4" }]} />
        {m?.eta ? (
          <p className="flex items-center gap-2 rounded-xl bg-ok-soft px-3 py-2 text-[13px] font-medium text-ok">
            <ShieldCheck className="size-4 shrink-0" /> {L("إيصال إلكتروني متسلسل — في طابور الإرسال لمصلحة الضرائب", "Chained e-receipt — queued for the Tax Authority")}
          </p>
        ) : null}
        {m?.zatca ? (
          <p className={`flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium ${m.zatca.signed && !m.zatca.demo ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"}`}>
            <ShieldCheck className="size-4 shrink-0" />{" "}
            {m.zatca.demo
              ? L("وضع تجريبي: الفاتورة مختومة بمفتاح على الجهاز ومش هتتبعت لهيئة الزكاة", "Demo: stamped with an on-device key, never sent to ZATCA")
              : m.zatca.signed
              ? L("فاتورة مختومة ومربوطة بالسلسلة — في طابور هيئة الزكاة", "Stamped, chained invoice — queued for ZATCA")
              : L("فاتورة مربوطة بالسلسلة — QR مؤقت لحد ما السيرفر يختمها", "Chained invoice — provisional QR until the server stamps it")}
          </p>
        ) : null}
        {etaError ? (
          <p className="flex items-start gap-2 rounded-xl bg-warn-soft px-3 py-2 text-[13px] font-medium text-warn">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" /> {L("الإيصال الإلكتروني ماتعملش:", "E-receipt not issued:")} {etaError}
          </p>
        ) : null}
        <div className="overflow-x-auto rounded-2xl bg-surface-3 p-4 thin-scrollbar">
          {m ? (
            <motion.div key={paper} initial={reduced ? false : { opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="mx-auto w-fit shadow-sf-lg">
              <ReceiptView model={m} />
            </motion.div>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}
