/**
 * طلبيات المطبخ اللي ما اتطبعتش (Saqr 2026-11-26): the cashier sees each kitchen ticket that failed to print with the
 * reason, can print it again or dismiss it, and the lines show "ما اتطبعش في المطبخ".
 */
import { useEffect, useMemo, useState } from "react";
import { Printer, RotateCcw, X } from "lucide-react";
import { useSession } from "@/auth/session";
import { useDb, useLive } from "@/data/hooks";
import type { PrintJob } from "@/data/types";
import { Button } from "@/ui";
import { listsOf } from "../lib";
import { printOf } from "./setup";
import { drawJob } from "./station";

export interface PrintIssue {
  job: PrintJob;
  number: string;
  printer: string;
  reason: string;
  itemIds: string[];
}

/** waiting this long for the station means it is not printing */
const STALE_MS = 45_000;

const why = (j: PrintJob, now: number): string | null => {
  if (j.status === "failed") {
    const e = j.error ?? "";
    if (/not reachable|timed out|refused|unreachable|No route|Errno 11[0-3]/i.test(e)) return "الطابعة مش متوصلة أو مقفولة";
    return e ? `خطأ في الطباعة: ${e}` : "خطأ في الطباعة";
  }
  const age = now - Date.parse(j.updatedAt ?? j.createdAt);
  if (j.status === "queued" && age > STALE_MS) return j.data ? "المحطة مش شغالة أو مش متوصلة بالإنترنت" : "مفيش جهاز يجهز الطلبية (افتح النظام على جهاز في الفرع)";
  if (j.status === "rendering" && age > STALE_MS) return "الطلبية ما اتجهزتش للطباعة";
  if (j.status === "printing" && age > 2 * STALE_MS) return "المحطة استلمت الطلبية وما ردتش";
  return null;
};

export function useKitchenPrintIssues() {
  const db = useDb();
  const { branchId } = useSession();
  const setup = printOf(listsOf(useLive("mfgSettings").data[0]), branchId);
  const on = !!setup.stationOn && !!setup.kitchenPrint;
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!on) return setJobs([]);
    const since = () => new Date(Date.now() - 3 * 3600_000).toISOString();
    const look = () =>
      void db
        .list("printJobs", { where: { branchId, kind: "kitchen", status: ["failed", "queued", "rendering", "printing"] }, gte: { createdAt: since() } })
        .then((l) => (setJobs(l), setNow(Date.now())))
        .catch(() => undefined);
    look();
    const t = setInterval(look, 6_000);
    return () => clearInterval(t);
  }, [db, branchId, on]);
  const issues = useMemo<PrintIssue[]>(
    () =>
      jobs.flatMap((j) => {
        const reason = why(j, now);
        if (!reason) return [];
        const p = j.payload as { number?: string; itemIds?: string[] };
        return [{ job: j, reason, number: String(p.number ?? "—"), printer: setup.printers.find((x) => x.id === j.printerId)?.name ?? "؟", itemIds: p.itemIds ?? [] }];
      }),
    [jobs, now, setup.printers],
  );
  const failedItems = useMemo(() => new Set(issues.flatMap((i) => i.itemIds)), [issues]);
  const drop = (id: string) => setJobs((l) => l.filter((x) => x.id !== id));
  const dismiss = async (i: PrintIssue) => {
    drop(i.job.id);
    await db.update("printJobs", i.job.id, { status: "done", error: i.job.error ?? "اتجاهلت" });
  };
  const retry = async (i: PrintIssue) => {
    const p = setup.printers.find((x) => x.id === i.job.printerId);
    if (!p || !Array.isArray((i.job.payload as { lines?: unknown }).lines)) return dismiss(i); // a ticket from before 26-11 has no copy to print again
    drop(i.job.id);
    const chunks = await drawJob("kitchen", i.job.payload, p, setup);
    await db.update("printJobs", i.job.id, { status: "queued", error: null, ...(chunks ? { data: chunks } : {}) });
  };
  return { issues, failedItems, retry, dismiss };
}

/** the cashier's alert: one row per kitchen ticket that did not print */
export function KitchenPrintAlerts({ issues, retry, dismiss }: Pick<ReturnType<typeof useKitchenPrintIssues>, "issues" | "retry" | "dismiss">) {
  if (!issues.length) return null;
  return (
    <div dir="rtl" className="fixed bottom-4 start-4 z-50 grid w-[min(380px,calc(100vw-2rem))] gap-2" data-print-alerts>
      {issues.slice(0, 4).map((i) => (
        <div key={i.job.id} className="grid gap-2 rounded-2xl border border-danger/40 bg-surface p-3 shadow-sf-lg">
          <div className="flex items-start gap-2">
            <Printer className="mt-0.5 size-4 shrink-0 text-danger" />
            <div className="min-w-0 flex-1 text-[13.5px]">
              <p className="font-bold">طلبية المطبخ #{i.number} ما اتطبعتش ({i.printer})</p>
              <p className="text-muted">{i.reason}</p>
            </div>
            <button type="button" aria-label="تجاهل" onClick={() => void dismiss(i)} className="rounded-lg p-1 text-muted hover:bg-surface-2"><X className="size-4" /></button>
          </div>
          <Button size="sm" variant="brass" icon={<RotateCcw />} onClick={() => void retry(i)}>اطبعها تاني</Button>
        </div>
      ))}
      {issues.length > 4 ? <p className="text-center text-[12.5px] text-muted">و {issues.length - 4} كمان</p> : null}
    </div>
  );
}
