/**
 * تقرير مراجعة المطبخ مع إنهاء اليوم (Saqr 2026-11-27): when the day ends (every shift of the branch closed) or a
 * review is left from an earlier day, the members with "مراجعة طلبات المطبخ المتأخرة" get a message listing the
 * orders still waiting in «مراجعة», with the supervising chef and the time of each, and a button to the review tab.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChefHat, ClipboardCheck } from "lucide-react";
import { useSession } from "@/auth/session";
import { useLive } from "@/data/hooks";
import { saveRaw } from "@/lib/storage";
import { listsOf } from "@/modules/cc/lib";
import { memberCan } from "@/modules/cc/perms";
import { Button, Dialog } from "@/ui";
import { businessDayOf, hm, todayCairo } from "./review";

const SEEN_KEY = "westeros-os.kdsReviewSeen";
const inReview = (i: { reviewAt?: string | null; reviewResult?: string | null }) => !!i.reviewAt && !i.reviewResult;

export function ReviewAlerts() {
  const { staff, branchId, resting } = useSession();
  const lists = listsOf(useLive("mfgSettings").data[0]);
  const can = !!staff && memberCan(staff, lists, "kitchen.review");
  const lines = useLive("orderItems", { where: { status: ["sent", "preparing"] } }, { enabled: can }).data.filter(inReview);
  const orderIds = useMemo(() => [...new Set(lines.map((i) => i.orderId))], [lines]);
  const orders = useLive("orders", { where: { id: orderIds } }, { enabled: can && orderIds.length > 0 }).data.filter((o) => !branchId || o.branchId === branchId);
  const since = useMemo(() => new Date(Date.now() - 2 * 86_400_000).toISOString(), []);
  const shifts = useLive("shifts", { where: branchId ? { branchId } : {}, gte: { openedAt: since } }, { enabled: can && orders.length > 0 }).data;
  const members = useLive("memberships", undefined, { enabled: can && orders.length > 0 }).data;
  const nav = useNavigate();
  const [open, setOpen] = useState(false);

  const report = useMemo(() => {
    const byId = new Map(orders.map((o) => [o.id, o]));
    const mine = lines.filter((i) => byId.has(i.orderId));
    if (!mine.length) return null;
    const first = mine.reduce((m, i) => (i.reviewAt! < m ? i.reviewAt! : m), mine[0].reviewAt!);
    const stale = businessDayOf(first) < todayCairo();
    const lastClose = shifts.filter((s) => s.status === "closed" && s.closedAt).reduce<string | null>((m, s) => (!m || s.closedAt! > m ? s.closedAt! : m), null);
    const dayEnded = !shifts.some((s) => s.status === "open") && !!lastClose && lastClose >= first;
    if (!stale && !dayEnded) return null;
    const groups = [...new Set(mine.map((i) => i.orderId))].map((id) => ({ order: byId.get(id)!, items: mine.filter((i) => i.orderId === id) }));
    return { groups, key: mine.map((i) => i.id).sort().join(",") };
  }, [lines, orders, shifts]);

  useEffect(() => {
    if (!report || !staff || resting) return;
    let seen = "";
    try {
      seen = sessionStorage.getItem(`${SEEN_KEY}.${staff.id}`) ?? "";
    } catch {
      /* private mode */
    }
    if (seen !== report.key) setOpen(true);
  }, [report?.key, staff?.id, resting]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !report || !staff) return null;
  const close = () => {
    try {
      sessionStorage.setItem(`${SEEN_KEY}.${staff.id}`, report.key);
    } catch {
      /* private mode */
    }
    setOpen(false);
  };
  const name = (id: string | null | undefined) => (id ? members.find((m) => m.id === id)?.name ?? "—" : "—");
  return (
    <Dialog open onClose={close} size="lg" title="تقرير طلبات المطبخ المحتاجة مراجعة" description="طلبات ما اتعملتش جاهز في الوقت المحدد. حدد على كل طلب: جاهز أو هدر أو خرج."
      footer={<div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" onClick={close}>لاحقاً</Button><Button icon={<ClipboardCheck />} onClick={() => { close(); saveRaw("sufra-os.kds.view", "review"); nav("/kitchen?view=review"); }}>فتح المراجعة</Button></div>}>
      <div className="grid gap-2" data-review-report>
        {report.groups.map(({ order, items }) => {
          const fired = items.reduce<string | null>((m, i) => (i.firedAt && (!m || i.firedAt < m) ? i.firedAt : m), null);
          return (
            <div key={order.id} className="grid gap-1 rounded-xl border border-line p-3 text-[14px]">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <b className="num text-[16px]" dir="ltr">#{order.number}</b>
                <span className="inline-flex items-center gap-1"><ChefHat className="size-4 text-primary" aria-hidden />{name(items.find((i) => i.chefId)?.chefId)}</span>
                <span className="text-muted">الإرسال <span className="num" dir="ltr">{fired ? hm(fired) : "—"}</span></span>
              </div>
              <span className="text-[13px] text-muted">{items.map((i) => `${i.qty}× ${i.name.ar || i.name.en}`).join("، ")}</span>
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}
