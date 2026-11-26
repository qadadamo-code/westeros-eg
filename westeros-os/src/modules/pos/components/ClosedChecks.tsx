/** الطلبات المغلقة (Saqr 2026-11-26): today's paid checks of the branch; tap one to see and print its receipt again. */
import { useMemo } from "react";
import { ReceiptText } from "lucide-react";
import { useSession } from "@/auth/session";
import { useLive } from "@/data/hooks";
import type { Check } from "@/data/types";
import { formatMoney } from "@/lib/money";
import { startOfDay } from "@/lib/time";
import { useT } from "@/i18n/i18n";
import { Dialog, EmptyState } from "@/ui";
import { useChannelName } from "../channelName";

export function ClosedChecksDialog({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (c: Check) => void }) {
  const { L, lang } = useT();
  const { branchId } = useSession();
  const since = useMemo(() => startOfDay().toISOString(), [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const checks = useLive("checks", { where: { status: "paid", ...(branchId ? { branchId } : {}) }, gte: { closedAt: since } }, { enabled: open }).data;
  const ids = checks.map((c) => c.id);
  const orders = useLive("orders", { where: { checkId: ids } }, { enabled: open && ids.length > 0 }).data;
  const chName = useChannelName();
  const rows = [...checks].sort((a, b) => (b.closedAt ?? "").localeCompare(a.closedAt ?? ""));
  return (
    <Dialog open={open} onClose={onClose} size="lg" title={L("الطلبات المغلقة النهارده", "Closed today")}>
      {rows.length ? (
        <div className="grid gap-2">
          {rows.map((c) => {
            const o = orders.find((x) => x.checkId === c.id);
            return (
              <button key={c.id} type="button" onClick={() => onPick(c)} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 text-start hover:bg-surface-2">
                <span className="num min-w-12 text-[15px] font-bold">#{o?.number ?? "—"}</span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-muted">{chName(o) ?? ""}</span>
                <span className="num text-[13px] text-muted" dir="ltr">{c.closedAt ? new Date(c.closedAt).toLocaleTimeString(lang === "ar" ? "ar-EG" : "en-GB", { hour: "2-digit", minute: "2-digit" }) : ""}</span>
                <span className="num font-semibold">{formatMoney(c.total, { lang })}</span>
                <ReceiptText className="size-4 text-muted" />
              </button>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={<ReceiptText />} title={L("مفيش طلبات مغلقة النهارده", "Nothing closed today")} compact />
      )}
    </Dialog>
  );
}
