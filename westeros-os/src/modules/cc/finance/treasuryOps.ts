/** What the treasury screens write: vouchers, tills and bank accounts, prepaid expenses, cash counts and bank reconciliations. */
import type { Db } from "@/data/hooks";
import type { FinAccount, FinDoc, FinEntry } from "@/data/financeTypes";
import type { Units } from "@/lib/money";
import { fiscalYear, JournalError, openDate } from "./journal";
import { journalContext, postSystem, submitEntry, type Actor } from "./journalOps";
import { saveAccount, saveSettings } from "./ops";
import { nextCode } from "./tree";
import { BANK_RECON, CASH_COUNT, monthEnd, nextVoucherNo, PREPAID, prepaidDue, VOUCHER_LABEL, voucherLines, voucherProblem, type BankReconData, type PrepaidData, type VoucherInput } from "./treasury";

/** Posts a receipt, a payment, a transfer or an expense as one entry carrying its voucher number. */
export async function saveVoucher(db: Db, v: VoucherInput, actor: Actor): Promise<FinEntry> {
  const problem = voucherProblem(v);
  if (problem) throw new JournalError(problem);
  const j = await journalContext(db);
  const year = fiscalYear(v.date, j.settings.yearStartMonth);
  const voucherNo = nextVoucherNo(j.entries, v.type, year);
  const vat = j.accounts.find((a) => a.code === j.settings.links["vat.input"]);
  if (v.type === "expense" && v.vat && !vat) throw new JournalError("حساب ضريبة المدخلات غير موجود في ربط الحسابات");
  const what = v.type === "expense" ? j.byId.get(v.otherId)?.name.ar ?? VOUCHER_LABEL.expense : v.type === "transfer" ? `تحويل من ${j.byId.get(v.moneyId)?.name.ar ?? ""} إلى ${j.byId.get(v.otherId)?.name.ar ?? ""}` : VOUCHER_LABEL[v.type];
  const memo = v.memo.trim() || `${what}${v.party.trim() ? `: ${v.party.trim()}` : ""}`;
  const lines = voucherLines(v, vat?.id);
  if (!lines.length) throw new JournalError("راجع المبلغ وسعر الصرف");
  // آخر سعر صرف: the next voucher in this currency starts from it
  const rates = new Map((j.settings.currencies ?? []).map((c) => [c.code, c.rate]));
  for (const l of lines) if (l.fx && l.fx.currency !== (j.settings.currency || "EGP") && l.fx.rate > 0) rates.set(l.fx.currency, l.fx.rate);
  const fxMeta = v.fx && lines.some((l) => l.fx) ? { fx: { from: v.fx.money, to: v.fx.other ?? null, rate: v.fx.rate, amount: v.amount, received: lines.find((l) => l.account === v.otherId)?.fx?.amount ?? null } } : {};
  const saved = await submitEntry(db, null, {
    date: v.date, memo, lines, branchId: v.branchId, kind: v.type, attachments: v.attachments ?? [], sourceType: "voucher", sourceId: `${v.type}:${year}:${voucherNo}`,
    meta: { voucherNo, party: v.party.trim(), method: v.method ?? "", ref: v.ref?.trim() ?? "", ...fxMeta },
  }, actor);
  const known = j.settings.currencies ?? [];
  if ([...rates].some(([code, rate]) => known.find((c) => c.code === code)?.rate !== rate)) await saveSettings(db, { currencies: [...rates].map(([code, rate]) => ({ code, rate })) });
  return saved;
}

const PARENT_KEY: Record<string, string> = { cash: "cash.branches", bank: "banks", wallet: "wallets" };
/** Opens a till, a bank account or a wallet under its place in the tree. */
export async function addMoneyAccount(db: Db, f: { kind: "cash" | "bank" | "wallet"; name: string; branchId: string | null; note?: string; link?: { type: string; id: string } }): Promise<FinAccount> {
  const j = await journalContext(db);
  const parent = j.accounts.find((a) => a.code === j.settings.links[PARENT_KEY[f.kind]]);
  if (!parent) throw new JournalError("الحساب الرئيسي غير موجود في ربط الحسابات. راجع الإعدادات.");
  const made = await saveAccount(db, null, {
    code: nextCode(parent.code, j.accounts), name: { ar: f.name.trim(), en: "" }, parentCode: parent.code, postable: true, kind: f.kind, cashflow: parent.cashflow, branchId: f.branchId,
    requireCentre: false, allowManual: true, alertMin: f.kind === "cash" ? 0 : null, alertMax: null, active: true, note: f.note ?? "",
  });
  return f.link ? db.update("finAccounts", made.id, { linkType: f.link.type, linkId: f.link.id }) : made;
}
/** خزينة لكل فرع: every branch that has no till yet gets one. Returns how many were opened. */
export async function ensureBranchTills(db: Db): Promise<number> {
  const branches = await db.list("branches");
  let made = 0;
  for (const b of branches) {
    const accounts = await db.list("finAccounts");
    if (accounts.some((a) => a.linkType === "branch-till" && a.linkId === b.id)) continue;
    await addMoneyAccount(db, { kind: "cash", name: `خزينة ${b.name.ar}`, branchId: b.id, link: { type: "branch-till", id: b.id } });
    made++;
  }
  return made;
}

/* ───────── المصروفات المقدمة ───────── */

export async function savePrepaid(db: Db, row: FinDoc | null, f: { name: string; branchId: string | null; data: Omit<PrepaidData, "posted"> }): Promise<FinDoc> {
  if (!f.name.trim()) throw new JournalError("اكتب اسم المصروف المقدم");
  if (!(f.data.total > 0) || !(f.data.months >= 1)) throw new JournalError("اكتب المبلغ وعدد الشهور");
  if (!f.data.prepaidAccount || !f.data.expenseAccount) throw new JournalError("اختر حساب المصروف المقدم وحساب المصروف");
  const posted = (row?.data as unknown as PrepaidData | undefined)?.posted ?? [];
  if (row && posted.length) throw new JournalError("بدأ توزيع هذا المصروف، لا يتعدل. أوقفه واعمل واحد جديد بالباقي.");
  const fields = { kind: PREPAID, code: "", name: f.name.trim(), branchId: f.branchId, status: "active", date: `${f.data.start}-01`, data: { ...f.data, posted } as unknown as Record<string, unknown> };
  return row ? db.update("finDocs", row.id, fields) : db.insert("finDocs", fields);
}
/** Charges every month that is due of every active prepaid expense: مدين المصروف، دائن المصروف المقدم. */
export async function runPrepaid(db: Db, today: string): Promise<number> {
  const docs = (await db.list("finDocs", { where: { kind: PREPAID } })).filter((d) => d.status === "active");
  if (!docs.length) return 0;
  const j = await journalContext(db);
  let made = 0;
  for (const d of docs) {
    const data = d.data as unknown as PrepaidData;
    const posted = [...data.posted];
    for (const s of prepaidDue(data, today)) {
      const end = monthEnd(s.month);
      const row = await postSystem(db, {
        sourceType: PREPAID, sourceId: `${d.id}:${s.month}`, date: openDate(j.settings, end > today ? today : end), memo: `${d.name}: قسط شهر ${s.month.split("-").reverse().join("/")}`, branchId: d.branchId,
        lines: [{ account: data.expenseAccount, debit: s.amount, credit: 0, ...(data.centreId ? { centreId: data.centreId } : {}) }, { account: data.prepaidAccount, debit: 0, credit: s.amount }],
      }, j);
      if (row) { posted.push(s.month); made++; }
    }
    if (posted.length !== data.posted.length) await db.update("finDocs", d.id, { data: { ...d.data, posted }, status: posted.length >= data.months ? "done" : "active" });
  }
  return made;
}

/* ───────── جرد الخزينة ───────── */

/** Records what was counted in a till; a shortage or a surplus is posted against فروق خزينة. */
export async function postCashCount(db: Db, f: { accountId: string; date: string; counted: Units; pieces: Record<string, number>; note: string }, actor: Actor): Promise<{ diff: Units; entry: FinEntry | null }> {
  const j = await journalContext(db);
  const acc = j.byId.get(f.accountId);
  if (!acc) throw new JournalError("اختر الخزينة");
  const book = j.entries.filter((e) => e.status === "posted" && e.date <= f.date).reduce((s, e) => s + e.lines.filter((l) => l.account === acc.id).reduce((a, l) => a + l.debit - l.credit, 0), 0);
  const diff = f.counted - book;
  const other = j.accounts.find((a) => a.code === j.settings.links["cash.diff"]);
  if (diff && !other) throw new JournalError("حساب فروق الخزينة غير موجود في ربط الحسابات");
  const doc = await db.insert("finDocs", { kind: CASH_COUNT, code: "", name: acc.name.ar, branchId: acc.branchId, status: "done", date: f.date, data: { accountId: acc.id, book, counted: f.counted, diff, pieces: f.pieces, note: f.note.trim(), by: actor.name } });
  if (!diff) return { diff, entry: null };
  const entry = await postSystem(db, {
    sourceType: CASH_COUNT, sourceId: doc.id, date: f.date, kind: "adjust", memo: `جرد ${acc.name.ar}: ${diff > 0 ? "زيادة" : "عجز"}${f.note.trim() ? ` (${f.note.trim()})` : ""}`, branchId: acc.branchId,
    lines: diff > 0 ? [{ account: acc.id, debit: diff, credit: 0 }, { account: other!.id, debit: 0, credit: diff }] : [{ account: other!.id, debit: -diff, credit: 0 }, { account: acc.id, debit: 0, credit: -diff }],
  }, j);
  if (entry) await db.update("finEntries", entry.id, { createdBy: actor.id, createdByName: actor.name });
  return { diff, entry };
}

/* ───────── تسوية البنك ───────── */

export async function saveBankRecon(db: Db, row: FinDoc | null, f: { name: string; date: string; branchId: string | null; data: BankReconData; close?: boolean }): Promise<FinDoc> {
  if (row?.status === "closed") throw new JournalError("التسوية مقفولة");
  const fields = { kind: BANK_RECON, code: "", name: f.name, branchId: f.branchId, status: f.close ? "closed" : "open", date: f.date, data: f.data as unknown as Record<string, unknown> };
  return row ? db.update("finDocs", row.id, fields) : db.insert("finDocs", fields);
}
