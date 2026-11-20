/**
 * إشعار طلبات التوريد: when the system opens (or another employee signs in), a message lists the supply requests
 * waiting for the signed-in employee: to send (by the kinds ticked on their role) and to receive (the ones they asked
 * for). A request that arrives while the system is open shows the message again, and a device notification when the
 * employee allowed it. The المخازن والفروع menu item carries the count.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BellRing, PackageCheck, Send } from "lucide-react";
import { useSession } from "@/auth/session";
import { useLive } from "@/data/hooks";
import type { StockRequest } from "@/data/types";
import { Badge, Button, Dialog } from "@/ui";
import { screenAllowed } from "@/modules/screens";
import { fmtDay, listsOf, num, REQUEST_STATUS } from "../lib";
import { handlesKinds, KIND_LABEL, lineKind, pendingFor, waitingToReceive, waitingToSend } from "./supply";

const SEEN_KEY = "westeros-os.supplySeen";

function usePending() {
  const { staff } = useSession();
  const requests = useLive("stockRequests", { where: { kind: "supply" } }, { enabled: !!staff }).data;
  const settings = useLive("mfgSettings").data[0];
  const items = useLive("stockItems").data;
  return useMemo(() => {
    const lists = listsOf(settings);
    const itemById = new Map(items.map((i) => [i.id, i]));
    return { staff, lists, itemById, ...pendingFor(staff, lists, requests, itemById) };
  }, [staff, settings, items, requests]);
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
  const keys = useMemo(() => [...p.toSend.map((r) => `s:${r.id}:${r.status}`), ...p.toReceive.map((r) => `r:${r.id}:${r.lines.filter(waitingToReceive).length}`)], [p.toSend, p.toReceive]);
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
          new Notification("وستروس: طلب توريد", { body: k.startsWith("s:") ? "طلب توريد مستني التنفيذ" : "طلب توريد اتبعت ومستني تأكيد الاستلام", tag: k });
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
    nav(`/stores/supply?open=${r.id}`);
  };
  const kinds = handlesKinds(p.staff, p.lists);
  const askNotify = typeof Notification !== "undefined" && Notification.permission === "default";
  return (
    <Dialog open onClose={close} size="lg" title="طلبات التوريد" description="الطلبات اللي مستنياك دلوقتي"
      footer={<div className="flex flex-wrap items-center justify-end gap-2">{askNotify ? <Button variant="ghost" icon={<BellRing />} className="me-auto" onClick={() => void Notification.requestPermission()}>تفعيل إشعارات الجهاز</Button> : null}<Button variant="ghost" onClick={close}>لاحقاً</Button><Button onClick={() => { close(); nav("/stores/supply"); }}>فتح طلبات التوريد</Button></div>}>
      <div className="grid gap-4">
        {p.toSend.length ? (
          <section className="grid gap-2">
            <h3 className="flex items-center gap-2 text-[15px] font-bold"><Send className="size-4" />مطلوب تنفيذها</h3>
            {p.toSend.map((r) => {
              const lines = r.lines.filter((l) => waitingToSend(l) && kinds.includes(lineKind(l, p.itemById)));
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
