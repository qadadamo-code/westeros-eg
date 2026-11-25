/**
 * /print-station (Saqr 2026-11-25): opened once on the station device (Windows PC or Android tablet) to link its
 * program to the branch. After that the program prints in the background with no screen open. While open, this screen
 * also draws kitchen tickets like a cashier screen does, and shows the printers and the latest jobs.
 */
import { useEffect, useState } from "react";
import { Printer, TriangleAlert } from "lucide-react";
import { useSession } from "@/auth/session";
import { useDb, useLive } from "@/data/hooks";
import type { PrintJob, PrinterDef } from "@/data/types";
import { Badge, Button, Card, EmptyState, useToast } from "@/ui";
import { useMay } from "../useAccess";
import { listsOf } from "../lib";
import { printOf } from "../print/setup";
import { helperInfo, queuePrint, type HelperInfo } from "../print/station";
import { StationLink, StationSetup } from "../print/StationSetup";
import { usePrintRenderer } from "../print/renderer";

export default function StationPage() {
  const may = useMay();
  if (!may("print.station", "view"))
    return <div className="grid min-h-dvh place-items-center p-6"><Card><EmptyState icon={<Printer />} title="مالكش صلاحية محطة الطباعة" body="الصلاحية بتتحدد من المستخدمين ← الأدوار ← محطة الطباعة." /></Card></div>;
  return <Station />;
}

function Station() {
  const db = useDb();
  const { toast } = useToast();
  const settings = useLive("mfgSettings").data[0];
  const { branchId, branches, staff } = useSession();
  const setup = printOf(listsOf(settings), branchId);
  usePrintRenderer();
  const [info, setInfo] = useState<HelperInfo | null | undefined>(undefined);
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  useEffect(() => {
    const look = () => {
      void helperInfo().then(setInfo);
      void db.list("printJobs", { where: { branchId }, orderBy: [{ field: "createdAt", dir: "desc" }], limit: 12 }).then(setJobs).catch(() => undefined);
    };
    look();
    const t = setInterval(look, 5_000);
    return () => clearInterval(t);
  }, [db, branchId]);
  const branchName = branches.find((b) => b.id === branchId)?.name.ar;
  const printer = (id: string) => setup.printers.find((p) => p.id === id) ?? null;
  const test = (p: PrinterDef) => void queuePrint(db, { printer: p, kind: "test", payload: {} }, staff?.id ?? null, setup).then(() => toast({ title: `اتبعتت تجربة لـ ${p.name}`, tone: "success", duration: 1500 }));

  return (
    <div dir="rtl" className="mx-auto grid min-h-dvh max-w-3xl content-start gap-4 p-4 md:p-8">
      <div className="flex items-center gap-3">
        <span className="grid size-12 place-items-center rounded-2xl bg-brass text-white"><Printer className="size-6" /></span>
        <div className="flex-1">
          <h1 className="text-[22px] font-bold">محطة الطباعة</h1>
          <p className="text-[13.5px] text-muted">برنامج المحطة بيطبع طلبات كل الأجهزة على طابعات {branchName ? `فرع ${branchName}` : "الفرع"} في الخلفية، من غير ما الشاشة دي تكون مفتوحة.</p>
        </div>
      </div>

      <Card className="grid gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {setup.stationOn ? <Badge tone="ok">المحطة مفعلة في اعدادات التشغيل</Badge> : <Badge tone="warn">المحطة مقفولة في اعدادات التشغيل</Badge>}
          {setup.kitchenPrint ? <Badge tone="ok">طابعة المطبخ مفعلة</Badge> : <Badge>طابعة المطبخ مقفولة</Badge>}
        </div>
        <StationLink />
        {info === null || (info && (info.v ?? 1) < 2) ? (
          <div className="grid gap-2 rounded-xl bg-warn-soft p-3 text-[13.5px]">
            <p className="font-semibold text-warn"><TriangleAlert className="me-1 inline size-4" />{info ? "نزّل النسخة الجديدة من برنامج المحطة وشغلها:" : "لو الجهاز ده هو المحطة، شغّل عليه برنامج المحطة:"}</p>
            <StationSetup showOpen={false} />
            <p className="text-muted">لو كروم سأل "السماح بالوصول للأجهزة على الشبكة المحلية"، اختار سماح.</p>
          </div>
        ) : null}
      </Card>

      <Card className="grid gap-2 p-4">
        <p className="text-[15px] font-bold">الطابعات</p>
        {!setup.printers.length ? <p className="text-[13.5px] text-muted">مفيش طابعات متعرفة. عرّفها من التشغيل ← اعدادات التشغيل.</p> : null}
        {setup.printers.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-3 py-2">
            <Printer className="size-4 text-muted" />
            <span className="flex-1 font-semibold">{p.name}</span>
            <span className="num text-[13px] text-muted" dir="ltr">{p.ip || "مالهاش IP"}</span>
            <Badge>{p.kind === "label" ? "ستيكرات" : `${p.paper} مم`}</Badge>
            <Button size="sm" variant="outline" disabled={!setup.stationOn || !p.ip || p.kind === "label"} onClick={() => test(p)}>طباعة تجربة</Button>
          </div>
        ))}
      </Card>

      <Card className="grid gap-1.5 p-4">
        <p className="text-[15px] font-bold">آخر الطباعات</p>
        {!jobs.length ? <p className="text-[13.5px] text-muted">لسه مفيش.</p> : null}
        {jobs.map((j) => (
          <p key={j.id} className={j.status === "failed" ? "text-[13.5px] text-danger" : "text-[13.5px]"}>
            <span className="num text-muted" dir="ltr">{new Date(j.createdAt).toLocaleTimeString("en-GB")}</span> · {STATUS[j.status]} · {KIND[j.kind]} ← {printer(j.printerId)?.name ?? "؟"}
            {j.error ? <span className="text-danger"> ({j.error})</span> : null}
          </p>
        ))}
      </Card>
    </div>
  );
}

const STATUS: Record<PrintJob["status"], string> = { queued: "مستنية المحطة", rendering: "بتتجهز", printing: "بتتطبع", done: "✓ اتطبعت", failed: "✗ فشلت" };
const KIND: Record<PrintJob["kind"], string> = { receipt: "فاتورة", kitchen: "طلبية مطبخ", sticker: "ستيكرات", test: "تجربة" };
