/**
 * The register: menu on one side, the current check on the other (bottom sheet on phones).
 * Keyboard: S search · N new · K send · H hold · P pay · D discount · X split · T transfer · O open checks.
 */
import { channelFor, channelsOf, levelPrice, modeOf, onInBranch, soldOn, taxFor, type SalesChannelDef } from "@/data/channels";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { onSchedule, scheduleLabel } from "@/modules/menu/rules";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowLeftRight, Bike, Building2, ClipboardList, Hash, LayoutGrid, Plus, ReceiptText, UserRound, Users, Wallet } from "lucide-react";
import { useApproval } from "@/auth/approval";
import { useSession } from "@/auth/session";
import { useDb, useLive, useRow } from "@/data/hooks";
import { priceItems } from "@/data/pricing";
import { activeOrderFor, recomputeCheck } from "@/data/ops";
import type { Check, Discount, MenuItem, OrderItem, Payment } from "@/data/types";
import { useT } from "@/i18n/i18n";
import { cn } from "@/lib/cn";
import { formatMoney, type Units } from "@/lib/money";
import { loadRaw, saveRaw } from "@/lib/storage";
import type { ReceiptModel } from "@/lib/receipt";
import { AnimatedMoney, Button, Dialog, Input, useCommands, useHotkeys, useIsMobile, useToast } from "@/ui";
import { MenuPanel } from "./components/MenuPanel";
import { ModifierSheet, type ModifierChoice } from "./components/ModifierSheet";
import { TicketPanel } from "./components/TicketPanel";
import { LineSheet } from "./components/LineSheet";
import { useFame } from "@/modules/menu/useFame";
import { DiscountDialog } from "./components/DiscountDialog";
import { SplitDialog } from "./components/SplitDialog";
import { TablePicker } from "./components/TablePicker";
import { CustomerDialog, type CustomerResult } from "./components/CustomerDialog";
import { PaymentDialog, type TenderInput } from "./components/PaymentDialog";
import { ReceiptDialog, useReceiptPrint } from "./components/ReceiptDialog";
import { useMay } from "@/modules/cc/useAccess";
import { BuyerDialog } from "@/modules/settings/zatca/BuyerDialog";
import { OpenChecksDialog, TransferDialog, useCheckRows } from "./components/Checks";
import { ShiftBranch } from "./components/ShiftBranch";
import { OpenShiftDialog } from "./components/OpenShiftDialog";
import { Stepper } from "./components/bits";
import { discountPct, lineDiscountUnits } from "./math";
import { addLine, changeChannel, discardTicket, loadTicket, mergeChecks, moveCheckToTable, moveItems, openTicket, sendToKitchen, resendToKitchen, setBillDiscount, setLineDiscount, setLineQty, replaceLine, setTicketMeta, splitIntoChecks, updateLine, voidLine, type TicketDraft } from "./ops";
import { closeCheck, takePayment, voidPayment } from "./sale";
import { PromoDialog } from "@/modules/marketing/pos/PromoDialog";
import { redeemGiftCard, refundGiftCard } from "@/modules/marketing/ops";
import { useMenu, useReceiptSourceBuilder, useSettings, useShift, useStaffNames } from "./usePos";
import { useBranchStock } from "./stockInfo";
import { DRIVER } from "@/modules/cc/finance/delivery";
import { memberCan } from "@/modules/cc/perms";
import { listsOf } from "@/modules/cc/lib";

const ACTIVE_KEY = "sufra-os.pos.active";
type Kind = "dine_in" | "takeaway" | "pickup" | "delivery";
const NEW_DRAFT = (kind: Kind = "dine_in"): TicketDraft => ({ mode: kind === "pickup" ? "takeaway" : kind, pickup: kind === "pickup", tableIds: [], guests: kind === "dine_in" ? 2 : 1, customerId: null, deliveryFee: 0, delivery: null, pickupAt: null });

export default function Register() {
  const { L, loc, lang } = useT();
  const db = useDb();
  const may = useMay();
  const printReceipt = useReceiptPrint();
  const approve = useApproval();
  const { toast } = useToast();
  const session = useSession();
  const [buyerOpen, setBuyerOpen] = useState(false); // KSA B2B buyer (ZATCA standard invoice)
  const isMobile = useIsMobile();
  const menu = useMenu();
  const settings = useSettings();
  const { device, shift } = useShift();
  const receiptSrc = useReceiptSourceBuilder();
  const searchRef = useRef<HTMLInputElement>(null);

  const [activeId, setActiveIdState] = useState<string | null>(() => loadRaw(ACTIVE_KEY));
  const setActiveId = useCallback((id: string | null) => {
    saveRaw(ACTIVE_KEY, id);
    setActiveIdState(id);
  }, []);
  const [draft, setDraft] = useState<TicketDraft>(NEW_DRAFT());
  const [busy, setBusy] = useState(false);

  /* ── live data ── */
  const check = useRow("checks", activeId).data;
  const ordersLive = useLive("orders", { where: { checkId: activeId ?? "-" }, orderBy: [{ field: "openedAt" }] }, { enabled: !!activeId }).data;
  const orders = activeId ? ordersLive.filter((o) => o.checkId === activeId) : [];
  const itemsQ = useLive("orderItems", { where: { orderId: orders.map((o) => o.id) }, orderBy: [{ field: "createdAt" }] }, { enabled: orders.length > 0 });
  const itemsLive = itemsQ.data;
  const items = orders.length ? itemsLive.filter((i) => orders.some((o) => o.id === i.orderId)) : [];
  const paymentsLive = useLive("payments", { where: { checkId: activeId ?? "-" }, orderBy: [{ field: "createdAt" }] }, { enabled: !!activeId }).data;
  const payments = activeId ? paymentsLive.filter((p) => p.checkId === activeId) : [];
  const openChecks = useLive("checks", { where: { status: ["open", "bill_requested"] }, orderBy: [{ field: "openedAt" }] }).data;
  const openOrders = useLive("orders", { where: { checkId: openChecks.map((c) => c.id) } }, { enabled: openChecks.length > 0 }).data;
  const openItems = useLive("orderItems", { where: { orderId: openOrders.map((o) => o.id) } }, { enabled: openOrders.length > 0 }).data;
  const tables = useLive("tables", { where: { active: true }, orderBy: [{ field: "label" }] }).data;
  const zones = useLive("zones", { orderBy: [{ field: "sort" }] }).data;
  const customers = useLive("customers").data;
  const staffNames = useStaffNames();
  const rows = useCheckRows(openChecks, openOrders, openItems, tables, customers, (id) => (id ? staffNames.get(id)?.name ?? "" : ""));
  // a sales-channel button opens only that channel's open invoices (Saqr 2026-11-24)
  const [chFilter, setChFilter] = useState<string | null>(null);

  const order = orders[0] ?? null;
  const live = check && (check.status === "open" || check.status === "bill_requested");
  const kind: Kind = check ? (order?.pickupAt ? "pickup" : (order?.mode ?? "dine_in")) : draft.pickup ? "pickup" : draft.mode;
  const tableIds = check ? check.tableIds : draft.tableIds;
  const tableLabel = tableIds.map((id) => tables.find((t) => t.id === id)?.label ?? "?").join(" + ");
  const customer = customers.find((c) => c.id === (check?.customerId ?? draft.customerId)) ?? null;
  const guests = check?.guests ?? draft.guests;
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) if (i.status !== "void") m.set(i.itemId, (m.get(i.itemId) ?? 0) + i.qty);
    return m;
  }, [items]);

  /* ── dialogs ── */
  const [modItem, setModItem] = useState<MenuItem | null>(null);
  const { fame, notes: quickNotes } = useFame();
  const [lineItem, setLineItem] = useState<OrderItem | null>(null);
  const [lineTab, setLineTab] = useState<"edit" | "discount" | "void">("edit");
  // a line reopened in the options sheet to change its size, extras or notes
  const [editLine, setEditLine] = useState<OrderItem | null>(null);
  const [dlg, setDlg] = useState<null | "table" | "customer" | "discount" | "split" | "pay" | "checks" | "transfer" | "merge" | "moveTable" | "itemsToTable" | "guests" | "shift" | "ticket" | "promo" | "code" | "channel">(null);
  const [chOpen, setChOpen] = useState(false);
  /** تطبيق توصيل: the channel waiting for the app's order code before the order starts */
  const [aggCh, setAggCh] = useState<SalesChannelDef | null>(null);
  const [aggRef, setAggRef] = useState("");
  const [codeVal, setCodeVal] = useState("");
  const drivers = useLive("finDocs").data.filter((x) => x.kind === DRIVER);
  const [shares, setShares] = useState<{ amounts: Units[]; labels: string[] } | null>(null);
  const [receipt, setReceipt] = useState<{ model: ReceiptModel; etaError: string | null; title?: string } | null>(null);
  const pendingItem = useRef<{ item: MenuItem; choice: ModifierChoice | null } | null>(null);
  const pendingMoves = useRef<{ itemId: string; qty: number }[]>([]);
  const afterShift = useRef<(() => void) | null>(null);

  // deep link from the floor / orders: /pos?table=<tableId>&check=<checkId>
  const [params, setParams] = useSearchParams();
  const pTable = params.get("table");
  const pCheck = params.get("check");
  useEffect(() => {
    if (!pTable && !pCheck) return;
    let cancelled = false;
    (async () => {
      let target = pCheck ? await db.get("checks", pCheck) : null;
      if (target && target.status !== "open" && target.status !== "bill_requested") target = null;
      if (!target && pTable) {
        const [c] = await db.list("checks", { where: { status: ["open", "bill_requested"] }, contains: { tableIds: pTable }, orderBy: [{ field: "openedAt", dir: "desc" }] });
        target = c ?? null;
      }
      if (cancelled) return;
      setShares(null);
      setDlg(null);
      if (target) setActiveId(target.id);
      else if (pTable) {
        setActiveId(null);
        setDraft({ ...NEW_DRAFT("dine_in"), tableIds: [pTable] });
      }
      setParams({}, { replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [pTable, pCheck]); // eslint-disable-line react-hooks/exhaustive-deps

  // a check closed or voided elsewhere (another tablet, the waiter app) leaves the register
  useEffect(() => {
    if (activeId && check && !live && !receipt && dlg !== "pay") setActiveId(null);
  }, [activeId, check, live, receipt, dlg, setActiveId]);
  useEffect(() => {
    if (activeId && !check) {
      const t = setTimeout(() => db.get("checks", activeId).then((c) => !c && setActiveId(null)), 800);
      return () => clearTimeout(t);
    }
  }, [activeId, check, db, setActiveId]);

  // a check whose lines are all gone but still shows a total (the old 440 on an empty ticket) works its total out again
  const healed = useRef<string | null>(null);
  useEffect(() => {
    if (!check || !live || itemsQ.loading || items.length || !check.total || healed.current === check.id) return;
    healed.current = check.id;
    void recomputeCheck(db, check.id);
  }, [check, live, itemsQ.loading, items.length, db]);

  const fail = (e: unknown) => toast({ title: L("حصلت مشكلة", "Something went wrong"), description: String((e as Error)?.message ?? e), tone: "error" });
  const run = async <T,>(fn: () => Promise<T>) => {
    setBusy(true);
    try {
      return await fn();
    } catch (e) {
      fail(e);
      return undefined;
    } finally {
      setBusy(false);
    }
  };

  /** Clears the register for the next order; `prompt` asks for the table / customer right away (explicit "New"). */
  const newTicket = (k: Kind = kind, prompt = false) => {
    setActiveId(null);
    setDraft(NEW_DRAFT(k));
    setShares(null);
    if (!prompt) return;
    if (k === "dine_in") setDlg("table");
    else if (k === "delivery") setDlg("customer");
  };

  /** "طلب جديد": the cashier picks the sales channel first; the previous order's table, customer and lines are cleared. */
  const visibleChannels = channelsOf(settings).filter((c) => c.visible && onInBranch(c, session.branchId));
  const startChannel = (c: SalesChannelDef, ref?: string) => {
    setChOpen(false);
    // an aggregator order needs the app's order code first (Mohammed 2026-11-24)
    if (c.kind === "aggregator" && !ref) {
      setAggRef("");
      setAggCh(c);
      return;
    }
    setAggCh(null);
    setActiveId(null);
    setShares(null);
    setDraft({ ...NEW_DRAFT(modeOf(c.kind)), channelId: c.id, ...(c.kind === "aggregator" ? { source: "aggregator" as const, externalRef: ref ?? null } : {}) });
    if (c.kind === "dine_in") setDlg("table");
    else if (c.kind === "delivery") setDlg("customer");
  };
  const openByChannel = useMemo(() => {
    const n = new Map<string, number>();
    for (const c of openChecks) {
      const o = openOrders.find((x) => x.checkId === c.id);
      const ch = o ? channelFor(settings, o) : null;
      if (ch) n.set(ch.id, (n.get(ch.id) ?? 0) + 1);
    }
    // every sales channel of this branch keeps its own button, with its open count (0 = none); a channel that's off here still shows while it has open orders (Saqr 2026-11-24)
    return channelsOf(settings).filter((c) => n.get(c.id) || visibleChannels.some((v) => v.id === c.id)).map((c) => ({ c, n: n.get(c.id) ?? 0 }));
  }, [openChecks, openOrders, settings, visibleChannels]);
  const askChannel = () => (visibleChannels.length === 1 ? startChannel(visibleChannels[0]) : visibleChannels.length ? setChOpen(true) : newTicket(kind, true));
  const channel = check ? channelFor(settings, order) : channelsOf(settings).find((c) => c.id === draft.channelId) ?? channelFor(settings, { mode: draft.mode, channelId: null });
  /** the menu of the channel: items switched off for it are gone, and each shows the channel's price */
  const channelItems = useMemo(() => {
    const lv = channel?.level ?? 1;
    // كل فرع له منيو خاص بيه: items switched off for this branch are gone too
    const br = session.branchId;
    return menu.items.filter((i) => soldOn(i, channel) && !(br && (i.offBranches ?? []).includes(br))).map((i) => (lv === 1 ? i : { ...i, price: levelPrice(i, lv) }));
  }, [menu.items, channel, session.branchId]);
  const orderRef = check ? order?.externalRef : draft.externalRef;

  /** Ensures a check exists (dine-in needs a table first). */
  const ensure = async (): Promise<{ checkId: string; orderId: string } | null> => {
    if (check && live) {
      // the floor seats a table with an empty open order (and the waiter): lines go into that one, never a second order
      const o = await activeOrderFor(db, check, { source: "pos", mode: order?.mode ?? "dine_in", tableId: check.tableIds[0] ?? null });
      return { checkId: check.id, orderId: o.id };
    }
    if (draft.mode === "dine_in" && !draft.tableIds.length) {
      setDlg("table");
      return null;
    }
    const { check: c, order: o } = await openTicket(db, draft);
    setActiveId(c.id);
    return { checkId: c.id, orderId: o.id };
  };

  const add = async (item: MenuItem, choice: ModifierChoice | null) => {
    const t = await run(ensure);
    if (!t) {
      pendingItem.current = { item, choice };
      return;
    }
    const mods = choice?.modifiers ?? menu.mods.filter((m) => item.modifierGroupIds.includes(m.groupId) && m.isDefault && m.available);
    const current = activeId === t.checkId ? items : [];
    await run(() =>
      addLine(db, { orderId: t.orderId, checkId: t.checkId, items: current, tableId: (activeId === t.checkId ? check?.tableIds[0] : undefined) ?? draft.tableIds[0] ?? null }, { item, modifiers: mods, qty: choice?.qty ?? 1, notes: choice?.notes ?? "", seat: choice?.seat ?? null, course: choice?.course ?? 1 }, menu.cats, menu.items),
    );
  };

  const mfgSettings = useLive("mfgSettings").data[0] ?? null;
  const stockOf = useBranchStock(session.branchId, menu.items);
  const pick = (item: MenuItem, { forceSheet }: { forceSheet: boolean }) => {
    if (!item.available) return toast({ title: L("الصنف ده خلصان النهارده", "This item is sold out today"), tone: "warn" });
    // Saqr 2026-11-25: an item short in the branch stock sells only with the permission
    if (stockOf(item)?.short && !memberCan(session.staff, listsOf(mfgSettings), "pos.sellOut"))
      return toast({ title: L("الصنف مش متوفر في الفرع", "Not in stock at this branch"), description: L("مكوناته مش كفاية في مخزون الفرع، والبيع محتاج صلاحية \"البيع لمنتجات غير متوفرة\".", "Needs the sell-out permission."), tone: "warn" });
    if (!onSchedule(item)) return toast({ title: L("الصنف ده مش متاح دلوقتي", "Not served at this hour"), description: scheduleLabel(item.schedule, lang), tone: "warn" });
    // an item with option groups (size, combo, extras, notes) opens them, so the cashier sees each option and its price
    const hasGroups = item.modifierGroupIds.some((g) => menu.groups.some((x) => x.id === g) && menu.mods.some((m) => m.groupId === g && m.available));
    if (forceSheet || hasGroups) setModItem(item);
    else void add(item, null);
  };

  /* ── order type / table / customer ── */
  /** تحويل الطلب لقناة بيع تانية: then asks for what the new channel needs (table, delivery details, app code) */
  const moveToChannel = async (c: SalesChannelDef) => {
    setDlg(null);
    if (!check) {
      setActiveId(null);
      setDraft((d) => ({ ...NEW_DRAFT(modeOf(c.kind)), customerId: d.customerId, channelId: c.id, ...(c.kind === "aggregator" ? { source: "aggregator" as const, externalRef: null } : {}) }));
    } else {
      const t = await loadTicket(db, check.id);
      if (!t) return;
      await run(() => changeChannel(db, t, c, menu.items));
      toast({ title: L(`الطلب اتحول لـ ${c.name}`, `Order moved to ${c.name}`), tone: "success" });
    }
    if (c.kind === "dine_in") setDlg(check ? "moveTable" : "table");
    else if (c.kind === "delivery") setDlg("customer");
    else if (c.kind === "aggregator") (setCodeVal(""), setDlg("code"));
  };
  const saveCode = async () => {
    const v = codeVal.trim();
    setDlg(null);
    if (!check) return setDraft((d) => ({ ...d, externalRef: v || null }));
    const t = await loadTicket(db, check.id);
    if (t) await run(() => setTicketMeta(db, t, { externalRef: v || null }));
  };

  const onTable = async (tableId: string, existing: Check | null) => {
    setDlg(null);
    if (dlg === "moveTable" && check) {
      if (existing && existing.id !== check.id) {
        await run(() => mergeChecks(db, existing, check));
        setActiveId(existing.id);
        return toast({ title: L("الشيكين اندمجوا", "Checks merged"), tone: "success" });
      }
      const t = await loadTicket(db, check.id);
      if (t) await run(() => moveCheckToTable(db, t, tableId));
      return toast({ title: L("الشيك اتنقل", "Check moved"), tone: "success" });
    }
    if (dlg === "itemsToTable" && check) {
      const from = await loadTicket(db, check.id);
      if (!from) return;
      await run(async () => {
        const target = existing ?? (await openTicket(db, { ...NEW_DRAFT("dine_in"), tableIds: [tableId] })).check;
        await moveItems(db, from, target, pendingMoves.current);
      });
      return toast({ title: L("الأصناف اتنقلت", "Lines moved"), tone: "success" });
    }
    if (existing) {
      setActiveId(existing.id);
      toast({ title: L(`ترابيزة ${tables.find((t) => t.id === tableId)?.label}: الشيك المفتوح`, `Table ${tables.find((t) => t.id === tableId)?.label}: open check`) });
      return;
    }
    setActiveId(null);
    const d = { ...NEW_DRAFT("dine_in"), tableIds: [tableId], guests: draft.guests || 2, channelId: draft.mode === "dine_in" ? draft.channelId : null };
    setDraft(d);
    const p = pendingItem.current;
    pendingItem.current = null;
    if (p) {
      const t = await run(() => openTicket(db, d));
      if (!t) return;
      setActiveId(t.check.id);
      const mods = p.choice?.modifiers ?? menu.mods.filter((m) => p.item.modifierGroupIds.includes(m.groupId) && m.isDefault && m.available);
      await run(() => addLine(db, { orderId: t.order.id, checkId: t.check.id, items: [], tableId }, { item: p.item, modifiers: mods, qty: p.choice?.qty ?? 1, notes: p.choice?.notes ?? "", seat: p.choice?.seat ?? null, course: p.choice?.course ?? 1 }, menu.cats, menu.items));
    }
  };

  const onCustomer = async (r: CustomerResult) => {
    setDlg(null);
    if (check) {
      const t = await loadTicket(db, check.id);
      if (t) await run(() => setTicketMeta(db, t, { customerId: r.customer?.id ?? null, ...(order?.mode === "delivery" ? { delivery: r.delivery, deliveryFee: r.deliveryFee, driverId: r.driverId ?? null } : {}) }));
      if (r.pickupAt) for (const o of orders) await db.update("orders", o.id, { pickupAt: r.pickupAt });
    } else setDraft((d) => ({ ...d, customerId: r.customer?.id ?? null, delivery: r.delivery, deliveryFee: r.deliveryFee, pickupAt: r.pickupAt, driverId: r.driverId ?? null }));
  };

  /* ── ticket actions ── */
  const ticket = async () => (check ? loadTicket(db, check.id) : null);
  const send = async () => {
    const t = await ticket();
    if (!t) return;
    const n = await run(() => sendToKitchen(db, t));
    if (n) {
      toast({ title: L(`اتبعت ${n} صنف للمطبخ`, `Sent ${n} line${n > 1 ? "s" : ""} to the kitchen`), tone: "success" });
      if (order?.mode === "dine_in") newTicket("dine_in");
    }
  };
  const resend = async () => {
    const t = await ticket();
    if (!t) return;
    const n = await run(() => resendToKitchen(db, t));
    if (n) toast({ title: L(`اتبعت ${n} صنف للمطبخ تاني`, `Sent ${n} line${n > 1 ? "s" : ""} to the kitchen again`), tone: "success" });
  };
  const fire = async (course: number) => {
    const t = await ticket();
    if (!t) return;
    const n = await run(() => sendToKitchen(db, t, course));
    if (n) toast({ title: L(`الكورس ${course} اتبعت`, `Course ${course} fired`), tone: "success" });
  };
  const hold = async () => {
    if (check && !items.length) {
      const t = await ticket();
      if (t) await run(() => discardTicket(db, t));
    } else if (check) toast({ title: L("الشيك اتعلّق — تلاقيه في الشيكات المفتوحة", "Check held — find it under Open checks") });
    newTicket(kind === "dine_in" ? "dine_in" : kind);
  };
  const discard = async () => {
    const t = await ticket();
    if (!t) return;
    await run(() => discardTicket(db, t));
    newTicket(kind);
  };

  const policy = { discountApprovalPct: settings?.discountApprovalPct ?? 10 };
  const preview = (d: Discount | null) => (settings && order ? priceItems(items, { mode: order.mode, tax: taxFor(settings, order), discount: d, deliveryFee: order.deliveryFee }).totals.total : 0);
  const applyDiscount = async (d: Discount | null, reason: string) => {
    if (!check) return;
    if (d) {
      const pct = discountPct(d, check.subtotal - items.reduce((a, i) => a + i.discount, 0));
      const who = await approve({ kind: "discount", pct }, L(`خصم ${pct.toFixed(0)}% على الشيك`, `${pct.toFixed(0)}% bill discount`), policy);
      if (!who) return;
      await run(() => setBillDiscount(db, check.id, d, reason, who.id));
    } else await run(() => setBillDiscount(db, check.id, null, null, null));
    setDlg(null);
  };

  const onLineSave = async (it: OrderItem, patch: { qty?: number; notes?: string; seat?: number | null; course?: number }) => {
    if (!check) return;
    setLineItem(null);
    await run(async () => {
      if (patch.qty != null && patch.qty !== it.qty) await setLineQty(db, check.id, it, patch.qty);
      const { qty: _q, ...rest } = patch;
      await updateLine(db, check.id, it, rest);
    });
  };
  const onLineVoid = async (it: OrderItem, reason: string) => {
    if (!check) return;
    const afterSend = it.status !== "new";
    const who = await approve({ kind: "void", afterSend }, L(`إلغاء ${loc(it.name)}`, `Void ${loc(it.name)}`));
    if (!who) return;
    setLineItem(null);
    await run(() => voidLine(db, check.id, it, reason, afterSend ? who.id : null));
  };
  const onLineDiscount = async (it: OrderItem, d: Discount | null, reason: string) => {
    if (!check) return;
    if (d) {
      const units = lineDiscountUnits(it, d);
      const base = (it.unitPrice + it.modifiers.reduce((a, m) => a + m.price, 0)) * it.qty;
      const pct = base ? (units / base) * 100 : 0;
      const who = await approve({ kind: "discount", pct }, L(`خصم على ${loc(it.name)}`, `Discount on ${loc(it.name)}`), policy);
      if (!who) return;
      setLineItem(null);
      await run(() => setLineDiscount(db, check.id, it, units, reason, who.id));
    } else {
      setLineItem(null);
      await run(() => setLineDiscount(db, check.id, it, 0, "", null));
    }
  };

  const price = (list: OrderItem[]) => (settings && order ? priceItems(list, { mode: order.mode, tax: taxFor(settings, order), discount: check?.discount ?? null, deliveryFee: order.deliveryFee }).totals.total : 0);

  /* ── payment ── */
  const requireShift = (then: () => void) => {
    if (shift) return then();
    afterShift.current = then;
    setDlg("shift");
  };
  const pay = () => {
    if (!check || !items.some((i) => i.status !== "void")) return;
    requireShift(() => {
      setDlg("pay");
      // paid before it went to the kitchen: the kitchen ticket goes now (Mohammed 2026-11-23)
      if (items.some((i) => i.status === "new"))
        void ticket().then((t) => t && run(() => sendToKitchen(db, t)).then((n) => n && toast({ title: L(`اتبعت ${n} صنف للمطبخ`, `Sent ${n} line${n > 1 ? "s" : ""} to the kitchen`), tone: "success" })));
    });
  };
  const finish = async () => {
    if (!check) return;
    const res = await run(() => closeCheck(db, check.id, { shift, device }));
    if (!res || !receiptSrc) return;
    const fresh = await loadTicket(db, check.id);
    const pays = await db.list("payments", { where: { checkId: check.id } });
    setDlg(null);
    setShares(null);
    // بعد الدفع الفاتورة بتتطبع على طول من غير معاينة (Saqr 2026-11-25); the preview stays for an ETA error
    if (fresh) {
      const model = receiptSrc.fromReceipt(res.receipt, fresh.check, fresh.orders, pays, null, res.zatca);
      if (res.etaError) setReceipt({ model, etaError: res.etaError, title: L(`إيصال ${res.receipt.receiptNo}`, `Receipt ${res.receipt.receiptNo}`) });
      else {
        printReceipt(model);
        newTicket(kind);
      }
    }
    if (res.ledgerError) toast({ title: L("القيد المحاسبي اتسجل كخطأ للمحاسب", "Ledger posting logged for the accountant"), description: res.ledgerError, tone: "warn" });
  };
  const tender = async (t: TenderInput) => {
    if (!check) return;
    // gift card: take what the card covers, debit its balance (marketing/ops)
    if (t.method === "gift_card") {
      const ok = await run(() => redeemGiftCard(db, check, t.reference ?? "", t.amount, (p) => takePayment(db, check, p)));
      if (!ok) return;
    } else await run(() => takePayment(db, check, t));
    const fresh = await db.get("checks", check.id);
    if (fresh && fresh.paid >= fresh.total) await finish();
  };
  const voidTender = async (p: Payment) => {
    const who = await approve({ kind: "refund" }, L("إلغاء دفعة", "Void a payment"));
    if (who) await run(async () => {
      await voidPayment(db, p);
      if (p.method === "gift_card" && p.reference) await refundGiftCard(db, p.id, p.reference, p.amount);
    });
  };
  const prebill = async () => {
    if (!check || !receiptSrc) return;
    const m = receiptSrc.fromCheck(check, orders, items, payments, session.staff?.id ?? null);
    if (!m) return;
    if (check.status === "open") {
      await run(() => db.update("checks", check.id, { status: "bill_requested" }));
      for (const tid of check.tableIds) await db.update("tables", tid, { status: "bill" });
    }
    setReceipt({ model: m, etaError: null, title: L("شيك مبدئي", "Pre-bill") });
  };

  /* ── keyboard + palette ── */
  const k = (fn: () => void) => (e: KeyboardEvent) => {
    e.preventDefault();
    fn();
  };
  useHotkeys(
    {
      s: k(() => searchRef.current?.focus()),
      n: k(() => askChannel()),
      k: k(() => void send()),
      h: k(() => void hold()),
      p: k(pay),
      d: k(() => check && setDlg("discount")),
      c: k(() => check && setDlg("promo")),
      x: k(() => check && setDlg("split")),
      t: k(() => check && setDlg("transfer")),
      o: k(() => setDlg("checks")),
    },
    {
      descriptions: {
        s: { ar: "دوّر في المنيو", en: "Search menu" },
        n: { ar: "طلب جديد", en: "New order" },
        k: { ar: "ابعت للمطبخ", en: "Send to kitchen" },
        h: { ar: "علّق الشيك", en: "Hold check" },
        p: { ar: "ادفع", en: "Pay" },
        d: { ar: "خصم", en: "Discount" },
        c: { ar: "عروض وكوبونات ونقاط", en: "Offers, coupons & points" },
        x: { ar: "قسّم الشيك", en: "Split check" },
        t: { ar: "نقل", en: "Transfer" },
        o: { ar: "الشيكات المفتوحة", en: "Open checks" },
      },
    },
  );
  useCommands(
    [
      { id: "pos.new", group: "actions", title: { ar: "طلب جديد", en: "New order" }, icon: <Plus />, shortcut: "n", perform: () => askChannel() },
      { id: "pos.checks", group: "actions", title: { ar: "الشيكات المفتوحة", en: "Open checks" }, icon: <ClipboardList />, shortcut: "o", perform: () => setDlg("checks") },
    ],
    [kind],
  );

  /* ── header (Saqr 2026-11-25): who the order is for, its number, and the one or two small buttons its channel needs.
     The type comes from "طلب جديد"; "تحويل الطلب" in (...) moves it to another channel. ── */
  const chKind = (check ? order?.source : draft.source) === "aggregator" ? "aggregator" : channel?.kind ?? (kind === "pickup" ? "takeaway" : kind);
  const openerName = (order?.openedBy ? staffNames.get(order.openedBy)?.name : null) ?? session.staff?.name ?? "";
  const delivery = order?.delivery ?? draft.delivery;
  const driverId = check ? order?.driverId ?? null : draft.driverId ?? null;
  const driverName = driverId ? drivers.find((d) => d.id === driverId)?.name ?? "" : "";
  const chip = "flex h-9 min-w-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-[13px] font-semibold hover:bg-surface-2 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-primary";
  const header = (
    <div className="grid gap-2 border-b border-line px-3 pt-3 pb-2.5">
      <div className="flex items-stretch gap-2">
        <button type="button" onClick={() => setDlg("customer")} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2 text-start hover:bg-surface-2">
          <UserRound className="size-5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-bold">{customer?.name || openerName || L("الزبون", "Customer")}</span>
            <span className="num block truncate text-[12.5px] text-muted" dir={customer?.phone ? "ltr" : undefined}>{customer?.phone || L("أضف اسم ورقم الزبون", "Add the customer's name and phone")}</span>
          </span>
        </button>
        <div className="grid shrink-0 place-items-center rounded-xl bg-primary-soft px-3 py-1 text-center">
          <span className="max-w-24 truncate text-[11px] font-semibold text-primary">{channel?.name ?? ""}</span>
          <span className="num text-[22px] font-black leading-none text-ink" title={L("رقم الطلب", "Order number")}>{order ? `#${order.number}` : L("جديد", "New")}</span>
        </div>
      </div>
      {chKind === "dine_in" ? (
        <div className="flex gap-2">
          <button type="button" onClick={() => setDlg(check ? "moveTable" : "table")} className={cn(chip, "flex-1")}>
            <LayoutGrid /> <span className="truncate">{tableLabel ? `${L("ترابيزة", "Table")} ${tableLabel}` : L("اختار الترابيزة", "Pick a table")}</span>
          </button>
          <button type="button" onClick={() => setDlg("guests")} className={chip} aria-label={L("عدد الأفراد", "Guests")}>
            <Users /> <span className="num">{guests}</span>
          </button>
        </div>
      ) : chKind === "aggregator" ? (
        <button type="button" onClick={() => (setCodeVal(orderRef ?? ""), setDlg("code"))} className={chip}>
          <Hash /> <span className="num truncate">{orderRef ? `${L("كود الطلب", "Order code")}: ${orderRef}` : L("اكتب كود الطلب", "Enter the order code")}</span>
        </button>
      ) : chKind === "delivery" ? (
        <button type="button" onClick={() => setDlg("customer")} className={chip}>
          <Bike /> <span className="truncate">{delivery?.address ? [delivery.area || delivery.address, driverName].filter(Boolean).join(" · ") : L("بيانات التوصيل", "Delivery details")}</span>
        </button>
      ) : null}
    </div>
  );

  const ticketPanel = (
    <TicketPanel
      check={live ? check : null}
      orders={orders}
      items={live ? items : []}
      header={header}
      busy={busy}
      className="@container h-full"
      onLine={(it) => (setLineTab("edit"), setLineItem(it))}
      onLineDiscount={(it) => (setLineTab("discount"), setLineItem(it))}
      onSwipe={(it) => {
        if (!check) return;
        if (it.status === "new") void run(() => setLineQty(db, check.id, it, 0));
        else (setLineTab("void"), setLineItem(it));
      }}
      onToGo={(it) => check && void run(() => db.update("orderItems", it.id, { toGo: !it.toGo }))}
      onQty={(it, q) => check && void run(() => setLineQty(db, check.id, it, q))}
      onSend={() => void send()}
      onResend={may("pos.resend", "view") ? () => void resend() : undefined}
      onFire={(c) => void fire(c)}
      onHold={() => void hold()}
      onPay={pay}
      onDiscount={() => setDlg("discount")}
      onPromo={() => setDlg("promo")}
      onSplit={() => setDlg("split")}
      onTransfer={() => setDlg("transfer")}
      onMerge={() => setDlg("merge")}
      onChannel={() => setDlg("channel")}
      onPrebill={() => void prebill()}
      onDiscard={() => void discard()}
      onGuests={() => setDlg("guests")}
    />
  );

  const itemCount = items.filter((i) => i.status !== "void").reduce((a, i) => a + i.qty, 0);

  return (
    <div className="-mx-4 -mt-5 -mb-10 flex h-[calc(100dvh-5rem-env(safe-area-inset-bottom))] min-h-0 flex-col md:-mx-6 md:-mt-6 md:-mb-10 md:h-[calc(100dvh-4rem)] xl:-mx-8">
      {/* toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface/70 px-3 py-2 backdrop-blur md:px-4">
        <Button size="sm" variant="soft" icon={<Plus className="size-4" />} onClick={askChannel}>
          {L("طلب جديد", "New")}
        </Button>
        {channel ? <span className="rounded-full border border-brass/50 bg-brass-soft px-2.5 py-1 text-[12.5px] font-semibold text-brass-text">{channel.name}{orderRef ? <span className="num" dir="ltr"> · #{orderRef}</span> : null}</span> : null}
        {/* open orders per sales channel, each on its own (Mohammed 2026-11-23) */}
        {/* قناة فيها طلبات = زر بيفتح طلباتها؛ قناة فاضية = للعرض بس (Saqr 2026-11-24) */}
        {openByChannel.map(({ c, n }) => n ? (
          <button key={c.id} type="button" onClick={() => (setChFilter(c.id), setDlg("checks"))} className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-line-strong bg-surface px-2.5 py-1 text-[12.5px] font-semibold text-ink-2 shadow-sf-sm hover:bg-surface-2">
            {c.name} <span className="num rounded-full bg-primary-soft px-1.5 text-primary">{n}</span>
          </button>
        ) : (
          <span key={c.id} className="flex shrink-0 items-center gap-1.5 whitespace-nowrap px-1.5 py-1 text-[12.5px] font-semibold text-faint">
            {c.name} <span className="num">0</span>
          </span>
        ))}
        <Button size="sm" variant="secondary" icon={<ClipboardList className="size-4" />} onClick={() => (setChFilter(null), setDlg("checks"))}>
          {L("المفتوح", "Open")} <span className="num rounded-full bg-primary-soft px-1.5 text-[12px] text-primary">{rows.length}</span>
        </Button>
        <div className="flex-1" />
        <ShiftBranch />
        {shift ? (
          <Link to="/pos/shift" className="hidden items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] font-semibold text-ink-2 hover:bg-surface-2 sm:flex">
            <span className="size-2 rounded-full bg-ok" /> {L("وردية", "Shift")} · <span className="num">{device}</span>
          </Link>
        ) : (
          <Button size="sm" variant="brass" icon={<Wallet className="size-4" />} onClick={() => setDlg("shift")}>
            {L("افتح وردية", "Open shift")}
          </Button>
        )}
        {/* KSA: ZATCA queue + B2B buyer instead of the ETA queue (country switch) */}
        {session.restaurant?.country === "SA" ? (
          <>
            {check ? (
              <button type="button" onClick={() => setBuyerOpen(true)} className={cn("hidden items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold sm:flex", check.taxBuyer ? "border-primary bg-primary-soft text-primary" : "border-line bg-surface text-ink-2 hover:bg-surface-2")}>
                <Building2 className="size-4" /> {check.taxBuyer ? check.taxBuyer.name.slice(0, 18) : "B2B"}
              </button>
            ) : null}
            <Link to="/pos/zatca" className="hidden items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] font-semibold text-ink-2 hover:bg-surface-2 sm:flex">
              <ReceiptText className="size-4" /> ZATCA
            </Link>
          </>
        ) : (
          <Link to="/pos/eta" className="hidden items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] font-semibold text-ink-2 hover:bg-surface-2 sm:flex">
            <ReceiptText className="size-4" /> ETA
          </Link>
        )}
        <BuyerDialog open={buyerOpen} onClose={() => setBuyerOpen(false)} check={check ?? null} />
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="@container flex min-h-0 min-w-0 flex-1 flex-col">
          <MenuPanel ref={searchRef} cats={menu.cats} items={channelItems} counts={counts} onPick={pick} fame={fame} stock={stockOf} />
        </div>
        {!isMobile ? <aside aria-label={L("الشيك", "Check")} data-pos-ticket className="w-[340px] shrink-0 border-s border-line lg:w-[380px] 2xl:w-[420px]">{ticketPanel}</aside> : null}
      </div>

      {isMobile ? (
        <motion.button
          type="button"
          onClick={() => setDlg("ticket")}
          initial={false}
          animate={{ y: 0 }}
          className="mx-3 mb-2 flex h-14 shrink-0 items-center gap-3 rounded-2xl bg-ink px-4 text-bg shadow-sf-lg"
        >
          <span className="num grid size-8 place-items-center rounded-xl bg-white/15 text-[15px] font-bold">{itemCount}</span>
          <span className="flex-1 text-start font-semibold">{check ? `${L("الشيك", "Check")}${tableLabel ? ` · ${tableLabel}` : ""}` : L("الشيك فاضي", "Empty check")}</span>
          <AnimatedMoney value={live && check ? check.total : 0} className="text-[18px] font-semibold" />
        </motion.button>
      ) : null}
      {isMobile ? (
        <Dialog open={dlg === "ticket"} onClose={() => setDlg(null)} variant="bottom" hideClose className="h-[88dvh]">
          <div className="-mx-5 -mb-5 h-[calc(88dvh-2.5rem)]">{ticketPanel}</div>
        </Dialog>
      ) : null}

      {/* dialogs */}
      <ModifierSheet
        item={modItem}
        groups={menu.groups}
        mods={menu.mods}
        quickNotes={quickNotes}
        guests={guests}
        seat={null}
        course={1}
        edit={editLine}
        onClose={() => (setModItem(null), setEditLine(null))}
        onAdd={(c) => {
          const it = modItem!;
          const line = editLine;
          setModItem(null);
          setEditLine(null);
          if (line && check) void run(() => replaceLine(db, check.id, line, { ...c, item: it }, menu.items));
          else void add(it, c);
        }}
      />
      <LineSheet item={lineItem} guests={guests} startTab={lineTab}
        onOptions={(it) => {
          const mi = menu.items.find((x) => x.id === it.itemId);
          if (!mi?.modifierGroupIds.length) return toast({ title: L("الصنف ده مالوش اختيارات", "No options on this item"), tone: "warn" });
          setLineItem(null);
          setEditLine(it);
          setModItem(mi);
        }}
        onClose={() => setLineItem(null)} onSave={onLineSave} onVoid={onLineVoid} onDiscount={onLineDiscount} />
      <Dialog open={chOpen} onClose={() => setChOpen(false)} size="sm" title={L("طلب جديد: اختار قناة البيع", "New order: pick the channel")}>
        <div className="grid gap-2 sm:grid-cols-2">
          {visibleChannels.map((c) => (
            <button key={c.id} type="button" onClick={() => startChannel(c)} className="flex h-16 flex-col items-start justify-center rounded-2xl border border-line bg-surface px-4 text-start hover:border-primary hover:bg-primary-soft">
              <span className="text-[16px] font-semibold">{c.name}</span>
              <span className="text-[12px] text-muted">{L(`سعر ${c.level}`, `Price ${c.level}`)}{c.tax ? L(" · ضريبة", " · tax") : ""}{c.service ? L(" · سيرفيس", " · service") : ""}</span>
            </button>
          ))}
        </div>
      </Dialog>
      <Dialog open={!!aggCh} onClose={() => setAggCh(null)} size="sm" title={L(`طلب ${aggCh?.name ?? ""}: اكتب كود الطلب`, `${aggCh?.name ?? ""} order: enter its code`)}
        footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setAggCh(null)}>{L("إلغاء", "Cancel")}</Button><Button disabled={!aggRef.trim()} onClick={() => aggCh && startChannel(aggCh, aggRef.trim())}>{L("ابدأ الطلب", "Start")}</Button></div>}>
        <form onSubmit={(e) => { e.preventDefault(); if (aggCh && aggRef.trim()) startChannel(aggCh, aggRef.trim()); }}>
          <Input label={L("كود الطلب في التطبيق", "The app's order code")} dir="ltr" className="num" autoFocus value={aggRef} onChange={(e) => setAggRef(e.target.value)} />
        </form>
      </Dialog>
      <Dialog open={dlg === "code"} onClose={() => setDlg(null)} size="sm" title={L("كود الطلب في التطبيق", "The app's order code")}
        footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setDlg(null)}>{L("إلغاء", "Cancel")}</Button><Button onClick={() => void saveCode()}>{L("حفظ", "Save")}</Button></div>}>
        <form onSubmit={(e) => { e.preventDefault(); void saveCode(); }}>
          <Input label={L("كود الطلب", "Order code")} dir="ltr" className="num" autoFocus value={codeVal} onChange={(e) => setCodeVal(e.target.value)} />
        </form>
      </Dialog>
      <Dialog open={dlg === "channel"} onClose={() => setDlg(null)} size="sm" title={L("تحويل الطلب لقناة بيع تانية", "Move the order to another channel")}>
        <div className="grid gap-2 sm:grid-cols-2">
          {visibleChannels.map((c) => (
            <button key={c.id} type="button" disabled={c.id === channel?.id} onClick={() => void moveToChannel(c)} className="flex h-16 flex-col items-start justify-center rounded-2xl border border-line bg-surface px-4 text-start hover:border-primary hover:bg-primary-soft disabled:border-primary disabled:bg-primary-soft disabled:opacity-70">
              <span className="flex items-center gap-1.5 text-[16px] font-semibold"><ArrowLeftRight className="size-4 text-primary" />{c.name}</span>
              <span className="text-[12px] text-muted">{c.id === channel?.id ? L("القناة الحالية", "Current") : L(`سعر ${c.level}`, `Price ${c.level}`)}</span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-[12.5px] text-muted">{L("أسعار الأصناف بتتغير لسعر القناة الجديدة.", "Lines take the new channel's prices.")}</p>
      </Dialog>
      <TablePicker
        open={dlg === "table" || dlg === "moveTable" || dlg === "itemsToTable"}
        onClose={() => {
          setDlg(null);
          pendingItem.current = null;
        }}
        tables={session.branchId ? tables.filter((t) => t.branchId === session.branchId) : tables}
        zones={session.branchId ? zones.filter((z) => z.branchId === session.branchId) : zones}
        checks={openChecks}
        current={tableIds[0] ?? null}
        title={dlg === "moveTable" ? L("انقل الشيك لترابيزة", "Move check to table") : dlg === "itemsToTable" ? L("انقل الأصناف لترابيزة", "Move lines to table") : L("اختار الترابيزة", "Pick a table")}
        onPick={(t, c) => void onTable(t.id, c)}
      />
      <CustomerDialog
        open={dlg === "customer"}
        onClose={() => setDlg(null)}
        kind={chKind === "delivery" || kind === "delivery" ? "delivery" : kind === "pickup" ? "pickup" : "takeaway"}
        initial={{ customerId: check?.customerId ?? draft.customerId, delivery: order?.delivery ?? draft.delivery, deliveryFee: order?.deliveryFee ?? draft.deliveryFee, pickupAt: order?.pickupAt ?? draft.pickupAt, driverId: check ? order?.driverId ?? null : draft.driverId ?? null }}
        onDone={(r) => void onCustomer(r)}
      />
      <Dialog open={dlg === "guests"} onClose={() => setDlg(null)} size="sm" title={L("عدد الأفراد", "Guests")}>
        <div className="grid place-items-center gap-4 py-2">
          <Stepper
            value={guests}
            min={1}
            max={40}
            label={L("عدد الأفراد", "Guests")}
            onChange={async (n) => {
              if (check) {
                const t = await loadTicket(db, check.id);
                if (t) await setTicketMeta(db, t, { guests: n });
              } else setDraft((d) => ({ ...d, guests: n }));
            }}
          />
          <Button onClick={() => setDlg(null)}>{L("تمام", "Done")}</Button>
        </div>
      </Dialog>
      <DiscountDialog
        open={dlg === "discount"}
        onClose={() => setDlg(null)}
        base={check ? check.subtotal - items.reduce((a, i) => a + i.discount, 0) : 0}
        current={check?.discount ?? null}
        currentReason={check?.discountReason ?? null}
        limitPct={policy.discountApprovalPct}
        preview={preview}
        onApply={(d, r) => void applyDiscount(d, r)}
      />
      <PromoDialog
        open={dlg === "promo"}
        onClose={() => setDlg(null)}
        check={check}
        onAttachCustomer={async (customerId) => {
          const t = await loadTicket(db, check!.id);
          if (t) await run(() => setTicketMeta(db, t, { customerId }));
        }}
      />
      <SplitDialog
        open={dlg === "split"}
        onClose={() => setDlg(null)}
        items={items}
        total={check?.total ?? 0}
        price={price}
        onSplitChecks={async (groups) => {
          const t = await ticket();
          if (!t) return;
          const made = await run(() => splitIntoChecks(db, t, groups));
          setDlg(null);
          if (made) toast({ title: L(`اتعمل ${made.length} شيك جديد`, `${made.length} new check${made.length > 1 ? "s" : ""}`), description: L("تلاقيهم في الشيكات المفتوحة", "Find them under Open checks"), tone: "success", action: { label: L("افتح", "Open"), onClick: () => setDlg("checks") } });
        }}
        onShares={(amounts, labels) => {
          setShares({ amounts, labels });
          requireShift(() => setDlg("pay"));
        }}
      />
      <PaymentDialog
        open={dlg === "pay"}
        onClose={() => setDlg(null)}
        check={check}
        payments={payments}
        shares={shares}
        tipsEnabled={settings?.tipsEnabled ?? true}
        busy={busy}
        onTender={tender}
        onVoid={(p) => void voidTender(p)}
        onComplete={() => void finish()}
        onLinkPaid={async () => {
          // pay-by-link: the gateway webhook (or the demo) already recorded the payment — close once it covers the check
          if (!check) return;
          const fresh = await db.get("checks", check.id);
          if (fresh && fresh.status !== "paid" && fresh.paid >= fresh.total) await finish();
        }}
      />
      <ReceiptDialog
        open={!!receipt}
        onClose={() => {
          setReceipt(null);
          if (check && check.status === "paid") newTicket(kind);
        }}
        model={receipt?.model ?? null}
        title={receipt?.title}
        etaError={receipt?.etaError}
        actions={
          check?.status === "paid" ? (
            <Button size="lg" variant="secondary" icon={<Plus className="size-5" />} onClick={() => (setReceipt(null), newTicket(kind))}>
              {L("طلب جديد", "New order")}
            </Button>
          ) : null
        }
      />
      <OpenChecksDialog open={dlg === "checks"} onClose={() => (setDlg(null), setChFilter(null))} rows={chFilter ? rows.filter((r) => channelFor(settings, r.order)?.id === chFilter) : rows} title={chFilter ? `${L("المفتوح", "Open")}: ${channelsOf(settings).find((c) => c.id === chFilter)?.name ?? ""}` : undefined} plain={!!chFilter} activeId={activeId} onPick={(c) => (setActiveId(c.id), setDlg(null), setChFilter(null))} />
      <OpenChecksDialog
        open={dlg === "merge"}
        onClose={() => setDlg(null)}
        rows={rows}
        activeId={null}
        exclude={check?.id ?? null}
        title={L("دمج مع شيك", "Merge with check")}
        onPick={async (c) => {
          if (!check) return;
          setDlg(null);
          await run(() => mergeChecks(db, check, c));
          toast({ title: L("الشيكين اندمجوا", "Checks merged"), tone: "success" });
        }}
      />
      <TransferDialog
        open={dlg === "transfer"}
        onClose={() => setDlg(null)}
        items={items}
        rows={rows}
        exclude={check?.id ?? null}
        onMoveTable={() => setDlg("moveTable")}
        onToTable={(moves) => {
          pendingMoves.current = moves;
          setDlg("itemsToTable");
        }}
        onToCheck={async (moves, target) => {
          const t = await ticket();
          if (!t) return;
          setDlg(null);
          await run(() => moveItems(db, t, target, moves));
          toast({ title: L("الأصناف اتنقلت", "Lines moved"), tone: "success" });
        }}
      />
      <OpenShiftDialog
        open={dlg === "shift"}
        onClose={() => setDlg(null)}
        device={device}
        onOpened={() => {
          setDlg(null);
          const next = afterShift.current;
          afterShift.current = null;
          if (next) setTimeout(next, 50);
        }}
      />
      <span className="sr-only" aria-live="polite">
        {check ? `${L("الإجمالي", "Total")} ${formatMoney(check.total, { lang })}` : ""}
      </span>
    </div>
  );
}
