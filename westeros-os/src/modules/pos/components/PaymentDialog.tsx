/** Tenders: cash (quick notes, change), card, wallet, InstaPay, pay link; split tender and shares; tips on non-cash. */
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Banknote, Check as CheckIcon, CreditCard, Gift, Link2, QrCode, Smartphone, X } from "lucide-react";
import type { Check, Payment, PaymentMethod } from "@/data/types";
import { useT } from "@/i18n/i18n";
import { cn } from "@/lib/cn";
import { formatMoney, major, type Units } from "@/lib/money";
import { METHOD_LABEL } from "@/lib/receipt/model";
import { AnimatedMoney, Badge, Button, Dialog, IconButton, spring, useHotkeys, useReduced } from "@/ui";
import { changeDue, quickTenders, remaining, toPiastre, TENDERS } from "../math";
import { MoneyKeypad } from "./bits";
import { PayLinkPanel } from "@/modules/payments/PayLinkPanel";
import { useLive } from "@/data/hooks";
import { normalizeGiftCode, usable } from "@/lib/promo/giftcards";

const ICON: Record<PaymentMethod, typeof Banknote> = { cash: Banknote, card: CreditCard, wallet: Smartphone, instapay: QrCode, online: Link2, gift_card: Gift };

export interface TenderInput {
  method: PaymentMethod;
  amount: Units;
  tip: Units;
  tendered: Units | null;
  reference: string | null;
  splitLabel: string | null;
}

export function PaymentDialog({ open, onClose, check, payments, shares, tipsEnabled, busy, onTender, onVoid, onComplete, onLinkPaid }: {
  open: boolean;
  onClose: () => void;
  check: Check | null;
  payments: Payment[];
  shares: { amounts: Units[]; labels: string[] } | null;
  tipsEnabled: boolean;
  busy: boolean;
  onTender: (t: TenderInput) => Promise<void>;
  onVoid: (p: Payment) => void;
  onComplete: () => void;
  /** pay-by-link confirmed by the gateway (payment already recorded server-side / by the demo webhook) */
  onLinkPaid?: () => void;
}) {
  const { L, lang } = useT();
  const reduced = useReduced();
  const total = check?.total ?? 0;
  const captured = payments.filter((p) => p.status === "captured");
  const due = remaining(total, captured);
  const shareIdx = shares ? Math.min(captured.filter((p) => p.splitLabel).length, shares.amounts.length - 1) : -1;
  const shareDue = shares && shareIdx >= 0 ? Math.min(due, shares.amounts[shareIdx]) : due;
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [amount, setAmount] = useState<Units>(0);
  const [tip, setTip] = useState<Units>(0);
  const [ref, setRef] = useState("");

  useEffect(() => {
    if (!open) return;
    setAmount(shareDue);
    setTip(0);
    setRef("");
  }, [open, shareDue]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setTip(0), [method]);

  const isCash = method === "cash";
  // gift card tender: the code goes in `ref`; the amount is capped at the card's balance (marketing/ops redeemGiftCard)
  const gc = useLive("giftCards", { where: { code: normalizeGiftCode(ref) } }, { enabled: method === "gift_card" && ref.trim().length >= 6 }).data[0] ?? null;
  const gcUsable = method === "gift_card" && gc ? usable(gc, due) : 0;
  const isLink = method === "online";
  const apply = Math.min(toPiastre(amount), due);
  const change = isCash ? changeDue(apply, amount) : 0;
  const quick = useMemo(() => quickTenders(shareDue), [shareDue]);
  const canTake = !busy && due > 0 && amount > 0 && (isCash || amount <= due) && method !== "online" && (method !== "gift_card" || (gcUsable > 0 && amount <= gcUsable));

  const take = async () => {
    if (!canTake) return;
    await onTender({ method, amount: apply, tip: isCash ? 0 : tip, tendered: isCash ? toPiastre(amount) : null, reference: ref.trim() || null, splitLabel: shares ? shares.labels[shareIdx] : null });
  };
  useHotkeys({ "mod+enter": take }, { enabled: open, inInputs: true });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="xl"
      title={L("الدفع", "Payment")}
      description={shares ? L(`مقسوم على ${shares.amounts.length} — الجزء ${shareIdx + 1}`, `Split ${shares.amounts.length} ways — share ${shareIdx + 1}`) : undefined}
    >
      <div className="grid gap-5 md:grid-cols-[1fr_1.15fr]">
        <div className="grid content-start gap-4">
          <div className="rounded-[22px] bg-ink p-5 text-bg shadow-sf-lg">
            <div className="flex items-center justify-between text-[13.5px] opacity-75">
              <span>{L("الإجمالي", "Total")}</span>
              <span className="num">{formatMoney(total, { lang })}</span>
            </div>
            {captured.length ? (
              <div className="mt-1 flex items-center justify-between text-[13.5px] opacity-75">
                <span>{L("اتدفع", "Paid")}</span>
                <span className="num">{formatMoney(total - due, { lang })}</span>
              </div>
            ) : null}
            <div className="mt-3 text-[13px] font-semibold opacity-80">{due ? L("الباقي", "Remaining") : L("اتدفع بالكامل", "Fully paid")}</div>
            <AnimatedMoney value={due} className="text-[40px] font-semibold leading-tight tracking-tight" />
          </div>

          {due > 0 && !shares ? <SplitTender due={due} busy={busy} onTender={onTender} /> : null}

          {shares ? (
            <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {shares.amounts.map((s, i) => {
                const paid = i < captured.filter((p) => p.splitLabel).length;
                return (
                  <li key={i} className={cn("rounded-2xl border px-3 py-2", paid ? "border-ok/40 bg-ok-soft" : i === shareIdx ? "border-primary bg-primary-soft" : "border-line bg-surface-2")}>
                    <div className="flex items-center justify-between text-[12px] font-semibold text-muted">
                      {shares.labels[i]}
                      {paid ? <CheckIcon className="size-4 text-ok" /> : null}
                    </div>
                    <div className="num text-[15px] font-semibold">{formatMoney(s, { lang })}</div>
                  </li>
                );
              })}
            </ol>
          ) : null}

          {payments.length ? (
            <ul className="grid gap-1.5" aria-label={L("المدفوعات", "Payments")}>
              <AnimatePresence initial={false}>
                {payments.map((p) => {
                  const Icon = ICON[p.method];
                  return (
                    <motion.li key={p.id} layout={!reduced} initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring.snappy} className={cn("flex items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-2", p.status !== "captured" && "opacity-50 line-through")}>
                      <span className="grid size-9 place-items-center rounded-xl bg-surface-3">
                        <Icon className="size-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">
                          {METHOD_LABEL[p.method][lang]} {p.splitLabel ? <span className="num text-[12px] text-muted">· {p.splitLabel}</span> : null}
                        </span>
                        <span className="block text-[12.5px] text-muted">
                          {p.tip ? `${L("إكرامية", "tip")} ${formatMoney(p.tip, { lang })}` : p.change ? `${L("باقي", "change")} ${formatMoney(p.change, { lang })}` : p.reference ?? ""}
                        </span>
                      </span>
                      <span className="num font-semibold">{formatMoney(p.amount, { lang })}</span>
                      {p.status === "captured" ? (
                        <IconButton label={L("إلغاء الدفعة", "Void payment")} size="sm" onClick={() => onVoid(p)}>
                          <X />
                        </IconButton>
                      ) : null}
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          ) : null}
        </div>

        <div className="grid content-start gap-4">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" role="radiogroup" aria-label={L("طريقة الدفع", "Tender")}>
            {TENDERS.map((m) => {
              const Icon = ICON[m];
              const on = m === method;
              return (
                <button key={m} type="button" role="radio" aria-checked={on} onClick={() => setMethod(m)} className={cn("flex min-h-[68px] flex-col items-center justify-center gap-1 rounded-2xl border-2 px-1 text-[12.5px] font-semibold transition-colors", on ? "border-primary bg-primary-soft text-primary" : "border-line bg-surface text-ink-2 hover:border-line-strong")}>
                  <Icon className="size-6" />
                  {METHOD_LABEL[m][lang]}
                </button>
              );
            })}
          </div>

          <div className="flex items-end justify-between gap-3 rounded-2xl border border-line bg-surface-2 px-4 py-3">
            <div>
              <div className="text-[12.5px] font-semibold text-muted">{isCash ? L("العميل دفع", "Tendered") : L("المبلغ", "Amount")}</div>
              <div className="num text-[30px] font-semibold leading-tight" dir="ltr">
                {formatMoney(amount, { lang, bare: true })}
              </div>
            </div>
            {isCash ? (
              <div className="text-end">
                <div className="text-[12.5px] font-semibold text-muted">{L("الباقي للعميل", "Change")}</div>
                <AnimatedMoney value={change} className={cn("text-[24px] font-semibold", change ? "text-ok" : "text-faint")} />
              </div>
            ) : amount > due ? (
              <Badge tone="danger">{L("أكتر من المطلوب", "More than due")}</Badge>
            ) : null}
          </div>

          {isCash ? (
            <div className="flex flex-wrap gap-2">
              {quick.map((q, i) => (
                <button key={q} type="button" onClick={() => setAmount(q)} className={cn("num h-11 rounded-xl border px-3.5 text-[15px] font-semibold", amount === q ? "border-primary bg-primary text-primary-ink" : "border-line bg-surface hover:bg-surface-2")}>
                  {i === 0 ? L("مظبوط", "Exact") : formatMoney(q, { lang, compact: true, bare: true })}
                </button>
              ))}
            </div>
          ) : (
            <>
              {tipsEnabled && !isLink && method !== "gift_card" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold text-muted">{L("إكرامية", "Tip")}</span>
                  {[0, 500, 1000, 1500].map((bp) => {
                    const v = toPiastre(Math.round((apply * bp) / 10_000));
                    return (
                      <button key={bp} type="button" onClick={() => setTip(v)} className={cn("num h-10 rounded-full border px-3 text-[13.5px] font-semibold", tip === v ? "border-brass bg-brass-soft text-brass-text" : "border-line hover:bg-surface-2")}>
                        {bp ? `${bp / 100}%` : L("لا", "None")}
                      </button>
                    );
                  })}
                  {[major(20), major(50)].map((v) => (
                    <button key={v} type="button" onClick={() => setTip(v)} className={cn("num h-10 rounded-full border px-3 text-[13.5px] font-semibold", tip === v ? "border-brass bg-brass-soft text-brass-text" : "border-line hover:bg-surface-2")}>
                      +{formatMoney(v, { lang, compact: true, bare: true })}
                    </button>
                  ))}
                </div>
              ) : null}
              {isLink && check ? (
                <PayLinkPanel check={check} amount={apply} onPaid={() => onLinkPaid?.()} />
              ) : (
                <>
                {method === "gift_card" ? (
                  <p className={cn("rounded-xl px-3 py-2 text-[13px] font-semibold", gc ? (gcUsable ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger") : "bg-surface-2 text-muted")}>
                    {gc ? (gcUsable ? `${L("رصيد الكارت", "Card balance")} ${formatMoney(gc.balance, { lang })}` : L("الكارت منتهي أو رصيده صفر", "Card expired or empty")) : L("اكتب أو امسح كود الكارت (GC-XXXX-XXXX-X)", "Type or scan the card code (GC-XXXX-XXXX-X)")}
                    {gc && gcUsable && amount > gcUsable ? <button type="button" className="ms-2 underline" onClick={() => setAmount(gcUsable)}>{L("خد الرصيد", "Use balance")}</button> : null}
                  </p>
                ) : null}
                <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder={method === "gift_card" ? L("كود كارت الهدية", "Gift card code") : method === "card" ? L("رقم الموافقة / آخر ٤ أرقام (اختياري)", "Auth code / last 4 (optional)") : L("رقم المرجع (اختياري)", "Reference (optional)")} aria-label={L("رقم المرجع", "Reference")} className="h-11 rounded-xl border border-line bg-surface px-3.5 outline-none focus:border-primary focus:shadow-[var(--sf-glow)]" />
                </>
              )}
            </>
          )}

          <MoneyKeypad value={amount} onChange={setAmount} />
          <Button size="xl" variant="brass" block disabled={!canTake || isLink} loading={busy} onClick={take} className={isLink ? "hidden" : undefined}>
            {due ? (
              <>
                {L("خد", "Take")} {formatMoney(apply + (isCash ? 0 : tip), { lang })}
              </>
            ) : (
              L("اتدفع", "Paid")
            )}
          </Button>
          {!due && check && check.status !== "paid" ? (
            <Button size="lg" variant="primary" block onClick={onComplete} loading={busy}>
              {L("اقفل الشيك واطبع", "Close & print")}
            </Button>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}

/**
 * توزيع الدفع (Mohammed 2026-11-23): the guest pays the bill with more than one method at once, e.g. 790 = 500 cash + 290 card.
 * Each part is taken as its own payment, so the receipt lists every method and its amount.
 */
const SPLIT_METHODS: PaymentMethod[] = ["cash", "card", "wallet", "instapay"];
function SplitTender({ due, busy, onTender }: { due: Units; busy: boolean; onTender: (t: TenderInput) => Promise<void> }) {
  const { L, lang } = useT();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<Record<string, string>>({});
  const parts = SPLIT_METHODS.map((m) => ({ m, amount: toPiastre(major(Number(v[m] || 0))) })).filter((p) => p.amount > 0);
  const sum = parts.reduce((a, p) => a + p.amount, 0);
  const left = due - sum;
  const exact = Math.abs(left) < major(0.01);
  const fill = (m: PaymentMethod) => setV((x) => ({ ...x, [m]: String(Math.max(0, (due - SPLIT_METHODS.filter((k) => k !== m).reduce((a, k) => a + toPiastre(major(Number(x[k] || 0))), 0))) / major(1)) }));
  const go = async () => {
    // a fraction of a piastre left over goes on the last part
    if (parts.length) parts[parts.length - 1].amount += left;
    for (const p of parts) await onTender({ method: p.m, amount: p.amount, tip: 0, tendered: p.m === "cash" ? p.amount : null, reference: null, splitLabel: null });
    setV({});
    setOpen(false);
  };
  if (!open)
    return (
      <Button variant="soft" block onClick={() => setOpen(true)}>
        {L("توزيع الدفع (كاش + فيزا + محفظة…)", "Split the payment across methods")}
      </Button>
    );
  return (
    <div className="grid gap-2 rounded-2xl border border-primary/40 bg-surface p-3">
      <p className="text-[13.5px] font-semibold">{L("توزيع الدفع", "Split payment")}</p>
      {SPLIT_METHODS.map((m) => {
        const Icon = ICON[m];
        return (
          <div key={m} className="flex items-center gap-2">
            <Icon className="size-5 shrink-0 text-muted" />
            <span className="w-24 shrink-0 text-[14px] font-semibold">{METHOD_LABEL[m][lang]}</span>
            <input value={v[m] ?? ""} onChange={(e) => setV((x) => ({ ...x, [m]: e.target.value.replace(/[^\d.]/g, "") }))} inputMode="decimal" dir="ltr" aria-label={METHOD_LABEL[m][lang]} placeholder="0" className="num h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 outline-none focus:border-primary" />
            <button type="button" onClick={() => fill(m)} className="h-10 shrink-0 rounded-xl border border-line px-2.5 text-[12.5px] font-semibold text-muted hover:bg-surface-2">{L("الباقي", "Rest")}</button>
          </div>
        );
      })}
      <p className={cn("text-[13px] font-semibold", exact ? "text-ok" : left < 0 ? "text-danger" : "text-muted")}>
        {exact ? L("المبلغ متوزع بالظبط", "Fully split") : left > 0 ? `${L("فاضل", "Left")} ${formatMoney(left, { lang })}` : `${L("زيادة", "Over by")} ${formatMoney(-left, { lang })}`}
      </p>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={() => setOpen(false)}>{L("إلغاء", "Cancel")}</Button>
        <Button variant="brass" className="flex-1" disabled={busy || !exact || parts.length < 1} loading={busy} onClick={() => void go()}>
          {L("خد الدفع الموزع", "Take split payment")} {formatMoney(sum, { lang })}
        </Button>
      </div>
    </div>
  );
}
