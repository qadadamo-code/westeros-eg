/**
 * إشعار طلبات التوريد: when the system opens (or another employee signs in), a message lists the supply requests
 * waiting for the signed-in employee: to send (from the warehouses they keep, when their role has the permission) and to receive (the ones they asked
 * for). A request that arrives while the system is open shows the message again, and a device notification when the
 * employee allowed it. The المخازن والفروع menu item carries the count.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BellRing, PackageCheck, Send, ShoppingCart } from "lucide-react";
import { useSession } from "@/auth/session";
import { useLive } from "@/data/hooks";
import type { StockRequest } from "@/data/types";
import { Badge, Button, Dialog } from "@/ui";
import { screenAllowed } from "@/modules/screens";
import { fmtDay, listsOf, num, REQUEST_STATUS } from "../lib";
import { KIND_LABEL, lineKind, mineLine, pendingFor, waitingToReceive, waitingToSend } from "./supply";

/* طلب شراء: the employees with "مسؤول المشتريات" on their role are told too */
const SEEN_KEY = "westeros-os.supplySeen";

function usePending() {
  const { staff } = useSession();
  const requests = useLive("stockRequests", {}, { enabled: !!staff }).data;
  const settings = useLive("mfgSettings").data[0];
  const items = useLive("stockItems").data;
  const locations = useLive("storageLocations").data;
  const levels = useLive("stockLevels").data;
  return useMemo(() => {
    const lists = listsOf(settings);
    const itemById = new Map(items.map((i) => [i.id, i]));
    const stores = { locations, levels };
    return { staff, lists, itemById, stores, ...pendingFor(staff, lists, requests, stores) };
  }, [staff, settings, items, requests, locations, levels]);
}

/** the count on the المخازن والفروع menu item */
export function useSupplyBadge(): number | null {
  const p = usePending();
  return screenAllowed("cc-stores") ? p.count || null : null;
}

const seenOf = (staffId: string): string[] => {
  try {
    return JSON.parse(sessionStorage.getItem(`${SEEN_KEY}.${staffId}`) ?? "[]") as string[];
  } catch {
    return [];
  }
};
const saveSeen = (staffId: string, ids: string[]) => {
  try {
    sessionStorage.setItem(`${SEEN_KEY}.${staffId}`, JSON.stringify(ids));
  } catch {
    /* private mode */
  }
};

export function SupplyAlerts() {
  const p = usePending();
  const nav = useNavigate();
  const { resting } = useSession();
  const [open, setOpen] = useState(false);
  const notified = useRef(new Set<string>());
  const keys = useMemo(() => [...p.toBuy.map((r) => `p:${r.id}:${r.status}`), ...p.toSend.map((r) => `s:${r.id}:${r.status}`), ...p.toReceive.map((r) => `r:${r.id}:${r.lines.filter(waitingToReceive).length}`)], [p.toSend, p.toReceive, p.toBuy]);
  const allowed = screenAllowed("cc-stores");
  useEffect(() => {
    if (!p.staff || !allowed || resting || !keys.length) return;
    const seen = seenOf(p.staff.id);
    const fresh = keys.filter((k) => !seen.includes(k));
    if (!fresh.length) return;
    setOpen(true);
    // a device notification for what arrived while the system was in the background
    if (typeof document !== "undefined" && document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
      for (const k of fresh) {
        if (notified.current.has(k)) continue;
        notified.current.add(k);
        try {
          new Notification(k.startsWith("p:") ? "وستروس: طلب شراء" : "وستروس: طلب توريد", { body: k.startsWith("p:") ? "طلب شراء جديد" : k.startsWith("s:") ? "طلب توريد مستني التنفيذ" : "طلب توريد اتبعت ومستني تأكيد الاستلام", tag: k });
        } catch {
          /* not supported here */
        }
      }
    }
  }, [keys.join("|"), p.staff?.id, allowed, resting]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open || !p.staff) return null;
  const close = () => {
    saveSeen(p.staff!.id, [...new Set([...seenOf(p.staff!.id), ...keys])]);
    setOpen(false);
  };
  const go = (r: StockRequest) => {
    close();
    nav(`/stores/${r.kind === "purchase" ? "purchase" : "supply"}?open=${r.id}`);
  };
  const askNotify = typeof Notification !== "undefined" && Notification.permission === "default";
  return (
    <Dialog open onClose={close} size="lg" title={p.toBuy.length && !p.toSend.length && !p.toReceive.length ? "طلبات الشراء" : "طلبات التوريد والشراء"} description="الطلبات اللي مستنياك دلوقتي"
      footer={<div className="flex flex-wrap items-center justify-end gap-2">{askNotify ? <Button variant="ghost" icon={<BellRing />} className="me-auto" onClick={() => void Notification.requestPermission()}>تفعيل إشعارات الجهاز</Button> : null}<Button variant="ghost" onClick={close}>لاحقاً</Button><Button onClick={() => { close(); nav(p.toSend.length || p.toReceive.length ? "/stores/supply" : "/stores/purchase"); }}>{p.toSend.length || p.toReceive.length ? "فتح طلبات التوريد" : "فتح طلبات الشراء"}</Button></div>}>
      <div className="grid gap-4">
        {p.toBuy.length ? (
          <section className="grid gap-2">
            <h3 className="flex items-center gap-2 text-[15px] font-bold"><ShoppingCart className="size-4" />طلبات شراء</h3>
            {p.toBuy.map((r) => (
              <button key={r.id} type="button" onClick={() => go(r)} className="grid gap-1.5 rounded-xl border border-line p-3 text-start hover:bg-surface-2">
                <span className="flex flex-wrap items-center gap-2">
                  <b>طلب شراء رقم <span className="num">{r.number}</span></b>
                  <Badge tone={REQUEST_STATUS[r.status]?.tone ?? "neutral"} size="sm">{REQUEST_STATUS[r.status]?.ar ?? r.status}</Badge>
                  <span className="text-[13px] text-muted">من {r.keeperName || "—"} · مطلوب يوم <span className="num">{fmtDay(r.dueDate)}</span></span>
                </span>
                <span className="flex flex-wrap gap-1.5 text-[13px]">{r.lines.map((l) => <span key={l.itemId} className="rounded-lg bg-surface-2 px-2 py-0.5">{l.name.ar} <b className="num">{num(l.qty)}</b> {l.unit}</span>)}</span>
              </button>
            ))}
          </section>
        ) : null}
        {p.toSend.length ? (
          <section className="grid gap-2">
            <h3 className="flex items-center gap-2 text-[15px] font-bold"><Send className="size-4" />مطلوب تنفيذها</h3>
            {p.toSend.map((r) => {
              const lines = r.lines.filter((l) => waitingToSend(l) && mineLine(p.staff, p.lists, l, r, p.stores));
              return (
                <button key={r.id} type="button" onClick={() => go(r)} className="grid gap-1.5 rounded-xl border border-line p-3 text-start hover:bg-surface-2">
                  <span className="flex flex-wrap items-center gap-2">
                    <b>طلب رقم <span className="num">{r.number}</span></b>
                    <Badge tone={REQUEST_STATUS[r.status]?.tone ?? "neutral"} size="sm">{REQUEST_STATUS[r.status]?.ar ?? r.status}</Badge>
                    <span className="text-[13px] text-muted">من {r.keeperName || "—"} · موعد التوريد <span className="num">{fmtDay(r.dueDate)}</span></span>
                  </span>
                  <span className="flex flex-wrap gap-1.5 text-[13px]">{lines.map((l) => <span key={l.itemId} className="rounded-lg bg-surface-2 px-2 py-0.5">{l.name.ar} <b className="num">{num(l.qty)}</b> {l.unit} <span className="text-muted">({KIND_LABEL[lineKind(l, p.itemById)]})</span></span>)}</span>
                </button>
              );
            })}
          </section>
        ) : null}
        {p.toReceive.length ? (
          <section className="grid gap-2">
            <h3 className="flex items-center gap-2 text-[15px] font-bold"><PackageCheck className="size-4" />اتبعتت ومستنية تأكيد الاستلام</h3>
            {p.toReceive.map((r) => (
              <button key={r.id} type="button" onClick={() => go(r)} className="grid gap-1.5 rounded-xl border border-line p-3 text-start hover:bg-surface-2">
                <b>طلب رقم <span className="num">{r.number}</span></b>
                <span className="flex flex-wrap gap-1.5 text-[13px]">{r.lines.filter(waitingToReceive).map((l) => <span key={l.itemId} className="rounded-lg bg-surface-2 px-2 py-0.5">{l.name.ar} <b className="num">{num(l.sentQty ?? 0)}</b> {l.unit}</span>)}</span>
                <span className="text-[12.5px] text-muted">امسح الملصقات عشان تأكد الاستلام</span>
              </button>
            ))}
          </section>
        ) : null}
      </div>
    </Dialog>
  );
}
