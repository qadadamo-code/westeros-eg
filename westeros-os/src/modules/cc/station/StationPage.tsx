/**
 * /print-station (Saqr 2026-11-25): opened in Chrome on the restaurant's Windows PC that runs the station program.
 * Prints every job other devices ask for (receipts, stickers, tests) and, while the kitchen printer is on, the kitchen
 * tickets of every printer by its menu categories. Keep this screen open.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Printer, RefreshCw, TriangleAlert, XCircle } from "lucide-react";
import { useSession } from "@/auth/session";
import { useDb, useLive } from "@/data/hooks";
import type { OrderItem, PrintJob, PrinterDef } from "@/data/types";
import type { ReceiptModel } from "@/lib/receipt";
import { Badge, Button, Card, EmptyState } from "@/ui";
import { useChannelName } from "@/modules/pos/channelName";
import { useMay } from "../useAccess";
import { listsOf } from "../lib";
import { printersFor, printOf } from "../print/setup";
import type { KitchenTicketData } from "../print/KitchenTicket";
import { kitchenBytes, pingHelper, receiptBytes, sendBytes, stickerBytes, type StickerPayload } from "../print/station";
import { StationSetup } from "../print/StationSetup";
import { SAMPLE_TICKET } from "../print/KitchenTicket";

interface LogRow { at: number; text: string; ok: boolean }
const DONE_KEY = "westeros.station.done";

export default function StationPage() {
  const may = useMay();
  if (!may("print.station", "view"))
    return <div className="grid min-h-dvh place-items-center p-6"><Card><EmptyState icon={<Printer />} title="مالكش صلاحية محطة الطباعة" body="الصلاحية بتتحدد من المستخدمين ← الأدوار ← محطة الطباعة." /></Card></div>;
  return <Station />;
}

function Station() {
  const db = useDb();
  const settings = useLive("mfgSettings").data[0];
  // the station prints for the branch this PC works in (its اعدادات التشغيل)
  const { branchId, branches } = useSession();
  const setup = printOf(listsOf(settings), branchId);
  const [helper, setHelper] = useState<boolean | null>(null);
  const [log, setLog] = useState<LogRow[]>([]);
  const add = (text: string, ok: boolean) => setLog((l) => [{ at: Date.now(), text, ok }, ...l].slice(0, 40));
  const check = () => void pingHelper().then(setHelper);
  useEffect(() => {
    check();
    const t = setInterval(check, 10_000);
    return () => clearInterval(t);
  }, []);
  // keep the PC awake while the station is open
  useEffect(() => {
    let lock: { release(): Promise<void> } | null = null;
    void (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock?.request("screen").then((l) => (lock = l)).catch(() => undefined);
    return () => void lock?.release();
  }, []);

  const printer = (id: string) => setup.printers.find((p) => p.id === id) ?? null;
  const queue = useRef(Promise.resolve());
  const run = (label: string, fn: () => Promise<void>) => {
    queue.current = queue.current.then(fn).then(() => add(label, true)).catch((e) => add(`${label}: ${(e as Error).message}`, false));
    return queue.current;
  };

  /* ── jobs from other devices ── */
  const jobs = useLive("printJobs", { where: { status: "queued" }, orderBy: [{ field: "createdAt" }] }).data;
  const taken = useRef(new Set<string>());
  const take = (list: PrintJob[]) => {
    for (const j of list) {
      if (taken.current.has(j.id) || !printer(j.printerId)) continue;
      taken.current.add(j.id);
      void db.update("printJobs", j.id, { status: "printing" }).then(() => run(jobLabel(j, printer(j.printerId)), () => doJob(j)));
    }
  };
  const takeRef = useRef(take);
  takeRef.current = take;
  useEffect(() => {
    if (helper) take(jobs);
  }, [jobs, helper]); // eslint-disable-line react-hooks/exhaustive-deps
  // a safety net if a live update is missed: look for waiting jobs every few seconds (Saqr 2026-11-25: a receipt waited until refresh)
  useEffect(() => {
    if (!helper) return;
    const t = setInterval(() => void db.list("printJobs", { where: { status: "queued" } }).then((l) => takeRef.current(l)).catch(() => undefined), 4_000);
    return () => clearInterval(t);
  }, [helper]); // eslint-disable-line react-hooks/exhaustive-deps

  const doJob = async (j: PrintJob) => {
    const p = printer(j.printerId);
    try {
      if (!p) throw new Error("الطابعة مش متعرفة");
      if (j.kind === "receipt") for (let i = 0; i < j.copies; i++) await sendBytes(p, await receiptBytes(j.payload.model as ReceiptModel, p));
      else if (j.kind === "kitchen") await sendBytes(p, await kitchenBytes(j.payload as unknown as KitchenTicketData, setup, p));
      else if (j.kind === "sticker") for (const b of await stickerBytes(j.payload as unknown as StickerPayload)) await sendBytes(p, b);
      else await sendBytes(p, await kitchenBytes({ ...SAMPLE_TICKET, printer: p.name, number: "تجربة" }, setup, p));
      await db.remove("printJobs", j.id);
    } catch (e) {
      await db.update("printJobs", j.id, { status: "failed", error: (e as Error).message.slice(0, 300) });
      throw e;
    }
  };

  /* ── kitchen tickets ── */
  const startedAt = useRef(Date.now());
  const since = useMemo(() => new Date(Date.now() - 60_000).toISOString(), []);
  const items = useLive("orderItems", { gte: { firedAt: since } }).data;
  const orders = useLive("orders", { gte: { createdAt: new Date(Date.now() - 24 * 3600_000).toISOString() } }).data;
  const menu = useLive("menuItems").data;
  const tables = useLive("tables").data;
  const customers = useLive("customers").data;
  const members = useLive("memberships").data;
  const chName = useChannelName();
  useEffect(() => {
    if (!helper || !setup.kitchenPrint) return;
    let done: Record<string, number> = {};
    try {
      done = JSON.parse(localStorage.getItem(DONE_KEY) ?? "{}");
    } catch {
      /* fresh */
    }
    const catOf = new Map(menu.map((m) => [m.id, m.categoryId]));
    const fresh = items.filter((i) => i.firedAt && i.status !== "void" && !done[`${i.id}@${i.firedAt}`] && Date.parse(i.firedAt) >= startedAt.current - 5_000 && orders.find((o) => o.id === i.orderId)?.branchId === branchId);
    if (!fresh.length) return;
    const now = Date.now();
    for (const i of fresh) done[`${i.id}@${i.firedAt}`] = now;
    for (const [k, t] of Object.entries(done)) if (now - t > 24 * 3600_000) delete done[k];
    try {
      localStorage.setItem(DONE_KEY, JSON.stringify(done));
    } catch {
      /* private mode */
    }
    // order → printer → lines
    const plan = new Map<string, Map<string, OrderItem[]>>();
    for (const i of fresh)
      for (const pid of printersFor(setup, catOf.get(i.itemId))) {
        const byP = plan.get(i.orderId) ?? new Map<string, OrderItem[]>();
        byP.set(pid, [...(byP.get(pid) ?? []), i]);
        plan.set(i.orderId, byP);
      }
    for (const [orderId, byP] of plan) {
      const o = orders.find((x) => x.id === orderId);
      for (const [pid, lines] of byP) {
        const p = printer(pid);
        if (!p) continue;
        const data: KitchenTicketData = {
          number: o?.number ?? "—",
          channel: chName(o),
          table: o?.tableIds.length ? o.tableIds.map((t) => tables.find((x) => x.id === t)?.label ?? "?").join("+") : null,
          customer: o?.customerId ? customers.find((c) => c.id === o.customerId)?.name ?? null : null,
          cashier: o?.waiterId ? members.find((m) => m.id === o.waiterId)?.name ?? null : null,
          at: lines[0].firedAt ?? new Date().toISOString(),
          printer: p.name,
          note: o?.note || null,
          appCode: o?.externalRef ?? null,
          lines: lines.map((l) => ({ qty: l.qty, name: l.name.ar || l.name.en, modifiers: l.modifiers.map((m) => m.name.ar || m.name.en), notes: l.notes, toGo: l.toGo })),
        };
        void run(`طلبية مطبخ #${data.number} ← ${p.name}`, async () => sendBytes(p, await kitchenBytes(data, setup, p)));
      }
    }
  }, [items, helper, setup.kitchenPrint]); // eslint-disable-line react-hooks/exhaustive-deps

  const { staff } = useSession();
  const branchName = branches.find((b) => b.id === branchId)?.name.ar;
  const test = (p: PrinterDef) => run(`تجربة ← ${p.name}`, async () => sendBytes(p, await kitchenBytes({ ...SAMPLE_TICKET, printer: p.name, number: "تجربة", cashier: staff?.name ?? null }, setup, p)));

  return (
    <div dir="rtl" className="mx-auto grid min-h-dvh max-w-3xl content-start gap-4 p-4 md:p-8">
      <div className="flex items-center gap-3">
        <span className="grid size-12 place-items-center rounded-2xl bg-brass text-white"><Printer className="size-6" /></span>
        <div className="flex-1">
          <h1 className="text-[22px] font-bold">محطة الطباعة</h1>
          <p className="text-[13.5px] text-muted">سيب الشاشة دي مفتوحة على الجهاز ده. بتطبع طلبات كل الأجهزة على طابعات {branchName ? `فرع ${branchName}` : "الفرع"} بالـ IP.</p>
        </div>
      </div>

      <Card className="grid gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {helper ? <Badge tone="ok" icon={<CheckCircle2 className="size-3.5" />}>برنامج المحطة شغال</Badge> : helper === false ? <Badge tone="danger" icon={<XCircle className="size-3.5" />}>برنامج المحطة مش شغال</Badge> : <Badge>بيدور على البرنامج…</Badge>}
          {setup.stationOn ? <Badge tone="ok">المحطة مفعلة في ثوابت النظام</Badge> : <Badge tone="warn">المحطة مقفولة في ثوابت النظام</Badge>}
          {setup.kitchenPrint ? <Badge tone="ok">طابعة المطبخ مفعلة</Badge> : <Badge>طابعة المطبخ مقفولة</Badge>}
          <Button size="sm" variant="ghost" icon={<RefreshCw className="size-4" />} onClick={check}>تحديث</Button>
        </div>
        {helper === false ? (
          <div className="grid gap-2 rounded-xl bg-warn-soft p-3 text-[13.5px]">
            <p className="font-semibold text-warn"><TriangleAlert className="me-1 inline size-4" />شغّل برنامج المحطة على الجهاز ده:</p>
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
            <Button size="sm" variant="outline" disabled={!helper || !p.ip || p.kind === "label"} onClick={() => void test(p)}>طباعة تجربة</Button>
          </div>
        ))}
      </Card>

      <Card className="grid gap-1.5 p-4">
        <p className="text-[15px] font-bold">آخر الطباعات</p>
        {!log.length ? <p className="text-[13.5px] text-muted">لسه مفيش.</p> : null}
        {log.map((r, i) => (
          <p key={i} className={r.ok ? "text-[13.5px]" : "text-[13.5px] text-danger"}>
            <span className="num text-muted" dir="ltr">{new Date(r.at).toLocaleTimeString("en-GB")}</span> · {r.ok ? "✓" : "✗"} {r.text}
          </p>
        ))}
      </Card>
    </div>
  );
}

function jobLabel(j: PrintJob, p: PrinterDef | null) {
  const kind = j.kind === "receipt" ? "فاتورة" : j.kind === "sticker" ? "ستيكرات" : j.kind === "kitchen" ? "طلبية مطبخ" : "تجربة";
  return `${kind} ← ${p?.name ?? "؟"}`;
}
