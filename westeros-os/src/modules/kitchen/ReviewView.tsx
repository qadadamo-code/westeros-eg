/**
 * خانة «مراجعة» في شاشة المطبخ (Saqr 2026-11-27): الطلبات اللي ما اتعملتش جاهز في الوقت المحدد بعد الإرسال للمطبخ.
 * جنب كل أوردر اسم الشيف المشرف ووقت الإرسال، وصاحب صلاحية "مراجعة طلبات المطبخ المتأخرة" بيحدد: جاهز / هدر / خرج.
 * «تقرير يوم» shows every order that went to review on a day, with what was decided and by whom.
 */
import { useMemo, useState } from "react";
import { ChefHat, CircleCheck, ClipboardCheck, LogOut, Trash2 } from "lucide-react";
import { useSession } from "@/auth/session";
import { useDb, useLive } from "@/data/hooks";
import type { Order, OrderItem } from "@/data/types";
import { listsOf } from "@/modules/cc/lib";
import { memberCan } from "@/modules/cc/perms";
import { Badge, Button, Card, EmptyState, Input, Segmented, useToast } from "@/ui";
import { dayRange, hm, REVIEW_RESULT, inReview, resolveReview, todayCairo, type ReviewResult } from "./review";
import { useChannelName } from "../pos/channelName";

interface Props {
  orders: Order[];
  items: OrderItem[];
  staffName: Map<string, string>;
  tableLabel: Map<string, string>;
  now: number;
}

export function ReviewView({ orders, items, staffName, tableLabel, now }: Props) {
  const db = useDb();
  const { toast } = useToast();
  const { staff, branchId } = useSession();
  const lists = listsOf(useLive("mfgSettings").data[0]);
  const can = memberCan(staff, lists, "kitchen.review");
  const [mode, setMode] = useState<"pending" | "day">("pending");
  const [day, setDay] = useState(todayCairo);
  const [busy, setBusy] = useState<string | null>(null);

  // تقرير يوم: every line that went to review that day (this branch)
  const range = dayRange(day);
  const dayItems = useLive("orderItems", { gte: { reviewAt: range.from } }, { enabled: mode === "day" }).data.filter((i) => i.reviewAt && i.reviewAt < range.to);
  const dayOrderIds = useMemo(() => [...new Set(dayItems.map((i) => i.orderId))], [dayItems]);
  const dayOrders = useLive("orders", { where: { id: dayOrderIds } }, { enabled: mode === "day" && dayOrderIds.length > 0 }).data;

  const groups = useMemo(() => {
    const src = mode === "pending" ? { os: orders, its: items.filter(inReview) } : { os: dayOrders.filter((o) => !branchId || o.branchId === branchId), its: dayItems };
    const byId = new Map(src.os.map((o) => [o.id, o]));
    const out = new Map<string, { order: Order; items: OrderItem[] }>();
    for (const i of src.its) {
      const o = byId.get(i.orderId);
      if (!o) continue;
      const g = out.get(o.id) ?? { order: o, items: [] };
      g.items.push(i);
      out.set(o.id, g);
    }
    return [...out.values()].sort((a, b) => (a.items[0].firedAt ?? "").localeCompare(b.items[0].firedAt ?? ""));
  }, [mode, orders, items, dayOrders, dayItems, branchId]);

  const counts = useMemo(() => {
    const c = { pending: 0, ready: 0, waste: 0, out: 0 };
    for (const g of groups) for (const i of g.items) c[i.reviewResult ?? "pending"] += 1;
    return c;
  }, [groups]);

  const decide = async (g: { order: Order; items: OrderItem[] }, r: ReviewResult) => {
    setBusy(`${g.order.id}:${r}`);
    try {
      await resolveReview(db, g.items, r, staff?.id ?? null);
      toast({ title: `أوردر #${g.order.number}: ${REVIEW_RESULT[r].ar}`, tone: r === "waste" ? "warn" : "success", duration: 2500 });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-4" data-review-view>
      <div className="flex flex-wrap items-end gap-3">
        <Segmented label="المراجعة" value={mode} onChange={setMode} options={[{ value: "pending", label: "محتاجة مراجعة" }, { value: "day", label: "تقرير يوم" }]} />
        {mode === "day" ? <Input label="اليوم" type="date" className="w-44" dir="ltr" value={day} max={todayCairo()} onChange={(e) => setDay(e.target.value || todayCairo())} /> : null}
        {mode === "day" ? (
          <div className="ms-auto flex flex-wrap gap-2 text-[13px]">
            <Badge tone="warn">محتاجة مراجعة {counts.pending}</Badge>
            <Badge tone="ok">جاهز {counts.ready}</Badge>
            <Badge tone="danger">هدر {counts.waste}</Badge>
            <Badge tone="neutral">خرج {counts.out}</Badge>
          </div>
        ) : null}
      </div>
      {!can ? <p className="rounded-2xl bg-surface-2 px-4 py-2.5 text-[13.5px] text-muted">تحديد جاهز أو هدر أو خرج محتاج صلاحية «مراجعة طلبات المطبخ المتأخرة» من الأدوار.</p> : null}

      {!groups.length ? (
        <EmptyState icon={<ClipboardCheck />} title={mode === "pending" ? "مفيش طلبات محتاجة مراجعة" : "مفيش طلبات اتحولت للمراجعة اليوم ده"} body="الطلب اللي ما يتعملش جاهز في الوقت المحدد من اعدادات التشغيل ← شاشة المطبخ بيتحول هنا." className="rounded-[24px] border border-dashed border-line py-16" />
      ) : (
        <div className="grid items-start gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))]">
          {groups.map((g) => (
            <ReviewCard key={g.order.id} g={g} now={now} staffName={staffName} tableLabel={tableLabel} can={can} busy={busy} onDecide={decide} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewCard({ g, now, staffName, tableLabel, can, busy, onDecide }: { g: { order: Order; items: OrderItem[] }; now: number; staffName: Map<string, string>; tableLabel: Map<string, string>; can: boolean; busy: string | null; onDecide: (g: { order: Order; items: OrderItem[] }, r: ReviewResult) => void }) {
  const channelName = useChannelName();
  const o = g.order;
  const fired = g.items.reduce<string | null>((m, i) => (i.firedAt && (!m || i.firedAt < m) ? i.firedAt : m), null);
  const chefId = g.items.find((i) => i.chefId)?.chefId ?? null;
  const pending = g.items.filter(inReview);
  const done = g.items.find((i) => i.reviewResult);
  const where = o.mode === "dine_in" && o.tableIds.length ? `ترابيزة ${o.tableIds.map((x) => tableLabel.get(x) ?? "?").join("+")}` : channelName(o) ?? "";
  return (
    <Card className="flex flex-col overflow-hidden border-2 border-warn/50 p-0" data-review-order={o.id}>
      <header className="flex items-center gap-3 bg-warn-soft px-3.5 py-2.5">
        <span className="font-display text-[26px] font-bold leading-none" dir="ltr">#{o.number}</span>
        <span className="min-w-0 flex-1 truncate text-[14px] font-bold">{where}</span>
        {fired ? <span className="num text-[13px] font-semibold" dir="ltr">{hm(fired)}</span> : null}
      </header>
      <div className="grid gap-1 px-3.5 pt-2.5 text-[13.5px]">
        <span className="flex items-center gap-1.5 font-semibold"><ChefHat className="size-4 text-primary" aria-hidden />الشيف المشرف: {chefId ? staffName.get(chefId) ?? "—" : "—"}</span>
        <span className="text-muted">
          وقت الإرسال للمطبخ: <span className="num" dir="ltr">{fired ? hm(fired) : "—"}</span>
          {pending.length && fired ? <> · من <span className="num">{Math.floor((now - Date.parse(fired)) / 60_000)}</span> دقيقة</> : null}
        </span>
      </div>
      <ul className="grid gap-1 px-3.5 py-2.5">
        {g.items.map((i) => (
          <li key={i.id} className="flex items-start gap-2 text-[15px]">
            <b className="num min-w-6">{i.qty}×</b>
            <span className="min-w-0 flex-1">
              {i.name.ar || i.name.en}
              {i.modifiers.length ? <span className="block text-[12.5px] text-muted">{i.modifiers.map((m) => m.name.ar || m.name.en).join("، ")}</span> : null}
            </span>
            {i.reviewResult ? <Badge size="sm" tone={REVIEW_RESULT[i.reviewResult].tone}>{REVIEW_RESULT[i.reviewResult].ar}</Badge> : null}
          </li>
        ))}
      </ul>
      {pending.length ? (
        can ? (
          <footer className="grid grid-cols-3 gap-2 border-t border-line p-2.5">
            <Button variant="soft" icon={<CircleCheck className="size-4.5" />} loading={busy === `${o.id}:ready`} onClick={() => onDecide(g, "ready")}>جاهز</Button>
            <Button variant="danger-soft" icon={<Trash2 className="size-4.5" />} loading={busy === `${o.id}:waste`} onClick={() => onDecide(g, "waste")}>هدر</Button>
            <Button variant="secondary" icon={<LogOut className="size-4.5" />} loading={busy === `${o.id}:out`} onClick={() => onDecide(g, "out")}>خرج</Button>
          </footer>
        ) : (
          <footer className="border-t border-line px-3.5 py-2 text-[12.5px] font-semibold text-warn">مستني المراجعة</footer>
        )
      ) : done ? (
        <footer className="border-t border-line px-3.5 py-2 text-[12.5px] text-muted">
          {REVIEW_RESULT[done.reviewResult!].ar} · {done.reviewedBy ? staffName.get(done.reviewedBy) ?? "—" : "—"} · <span className="num" dir="ltr">{done.reviewedAt ? hm(done.reviewedAt) : ""}</span>
        </footer>
      ) : null}
    </Card>
  );
}

