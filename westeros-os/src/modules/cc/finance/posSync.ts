/**
 * ترحيل ورديات الكاشير: every shift closed at the till (from the accounts' start date on) becomes one ملخص مبيعات
 * with its entry: sales per channel, discounts, returns, delivery fees, tax, service and tips, and what was collected
 * per payment method. The drawer's over or short at the count closes it on فروق خزينة.
 * The cashier cannot write the journal, so a manager's or accountant's open app posts the waiting shifts (like the
 * warehouses' sync). Safe to run again: a shift is posted once.
 */
import type { Db } from "@/data/hooks";
import type { FinAccount } from "@/data/financeTypes";
import type { PaymentMethod, Receipt, Shift } from "@/data/types";
import type { Units } from "@/lib/money";
import { cairoDay, JournalError } from "./journal";
import { journalContext, type Actor } from "./journalOps";
import { linkedAccount, postSalesDay, SALES_DAY, salesOf, type SalesInput } from "./sales";

/** shifts closed before the till joined الحسابات stay out (the backup system booked those in its own ledger) */
export const POS_FROM = "2026-11-23";

export const METHOD_LABEL: Record<PaymentMethod, string> = { cash: "كاش", card: "فيزا", wallet: "محفظة", instapay: "انستاباي", online: "دفع أونلاين", gift_card: "كارت هدية" };
/** the account each payment method lands on (ربط الحسابات); cash goes to the branch's till */
const METHOD_KEY: Record<PaymentMethod, string | null> = { cash: null, card: "wallet.card", wallet: "wallet.vodafone", instapay: "wallet.instapay", online: "wallet.card", gift_card: null };
const CHANNEL_OF: Record<string, string> = { "dine-in": "sales.dinein", takeaway: "sales.takeaway", delivery: "sales.delivery" };

type Ctx = Awaited<ReturnType<typeof journalContext>>;

/** the branch's till: a cash account of the branch under خزائن الفروع, else the linked one */
export function tillAccount(j: Ctx, branchId: string | null): FinAccount {
  const parent = j.accounts.find((a) => a.code === j.settings.links["cash.branches"]);
  const own = j.accounts.filter((a) => a.postable && a.active && a.kind === "cash" && a.branchId && a.branchId === branchId && (!parent || a.code.startsWith(parent.code))).sort((a, b) => a.code.localeCompare(b.code))[0];
  if (own) return own;
  const id = linkedAccount(j, "cash.branches");
  return j.accounts.find((a) => a.id === id)!;
}

/** The summary of one shift, from its receipts (sales and returns) and its drawer count. */
export function shiftSales(shift: Pick<Shift, "id" | "device" | "zNumber" | "difference">, receipts: Receipt[], accountOf: (m: PaymentMethod) => string): SalesInput {
  const channels: Record<string, Units> = {};
  const pay = new Map<string, Units>();
  let fees = 0, discounts = 0, returns = 0, tips = 0, vat = 0, orders = 0;
  const add = (m: PaymentMethod, v: Units) => { const id = accountOf(m); pay.set(id, (pay.get(id) ?? 0) + v); };
  for (const r of receipts) {
    const b = r.bill;
    const tip = r.payments.reduce((s, p) => s + (p.tip || 0), 0);
    if (r.kind === "SC") {
      orders++;
      const key = CHANNEL_OF[b.mode] ?? "sales.takeaway";
      channels[key] = (channels[key] ?? 0) + b.net + b.discount;
      discounts += b.discount;
      fees += b.deliveryFee;
      vat += b.vat + b.deliveryVat;
      tips += b.service + tip;
      for (const p of r.payments) add(p.method, p.amount + (p.tip || 0));
    } else {
      // a return: its value net of tax, its tax and service come off; the money went back by its method
      returns += b.net + b.deliveryFee;
      vat -= b.vat + b.deliveryVat;
      tips -= b.service + tip;
      for (const p of r.payments) add(p.method, -(p.amount + (p.tip || 0)));
    }
  }
  // the drawer count: over (+) or short (−) against what the till expected sits with the cash
  if (shift.difference) add("cash", shift.difference);
  return {
    shift: `الكاشير ${shift.device} · وردية Z${shift.zNumber ?? ""}`.trim(), channels, fees, discounts, returns, tips: Math.max(0, tips), vatBp: 0, inclusive: false,
    payments: [...pay].map(([accountId, amount]) => ({ accountId, amount })), orders, note: "ترحيل تلقائي من الكاشير", vatAmount: Math.max(0, vat), shiftId: shift.id,
  };
}

export interface PosSyncResult { posted: number; problems: string[] }
let running: Promise<PosSyncResult> | null = null;

/** Posts every closed shift that has no summary yet. One run at a time per app. */
export function syncShifts(db: Db, actor: Actor): Promise<PosSyncResult> {
  running ??= run(db, actor).finally(() => { running = null; });
  return running;
}

async function run(db: Db, actor: Actor): Promise<PosSyncResult> {
  const out: PosSyncResult = { posted: 0, problems: [] };
  const j = await journalContext(db);
  const start = j.settings.startDate;
  if (!j.accounts.length) return { posted: 0, problems: ["شجرة الحسابات لسه ما اتعملتش"] };
  if (!start) return { posted: 0, problems: ["اختار تاريخ بداية القيود التلقائية من إعدادات الحسابات الأول"] };
  const from = start > POS_FROM ? start : POS_FROM;
  const done = new Set((await db.list("finDocs", { where: { kind: SALES_DAY } })).filter((d) => d.status === "posted").map((d) => salesOf(d).shiftId).filter(Boolean));
  const shifts = (await db.list("shifts", { where: { status: "closed" } })).filter((s) => s.closedAt && cairoDay(s.openedAt) >= from && !done.has(s.id)).sort((a, b) => (a.closedAt ?? "").localeCompare(b.closedAt ?? ""));
  for (const s of shifts) {
    try {
      const receipts = await db.list("receipts", { where: { shiftId: s.id } });
      if (!receipts.some((r) => r.kind === "SC")) continue;
      const till = tillAccount(j, s.branchId).id;
      const accountOf = (m: PaymentMethod) => (METHOD_KEY[m] ? linkedAccount(j, METHOD_KEY[m]!) : till);
      const input = shiftSales(s, receipts, accountOf);
      await postSalesDay(db, { ...input, date: cairoDay(s.openedAt), branchId: s.branchId }, actor);
      out.posted++;
    } catch (e) {
      out.problems.push(`وردية ${s.device} Z${s.zNumber ?? ""}: ${e instanceof JournalError || e instanceof Error ? e.message : String(e)}`);
    }
  }
  return out;
}
