/** زر "القيد المحاسبي" on a batch, a supply request or any other action: opens the entry (or entries) it produced. */
import { useNavigate } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { useLive } from "@/data/hooks";
import { Button } from "@/ui";
import { FINANCE_ON } from "./flag";
import { entryRef } from "./journal";
import { useFinPerms } from "./perms";
import { entriesOfSource } from "./sync";
import { useShiftSync, useStockSync } from "./useStockSync";

function Inner({ refIds, size }: { refIds: string[]; size?: "sm" | "md" }) {
  const nav = useNavigate();
  const can = useFinPerms().has("chart.view");
  const entries = useLive("finEntries").data;
  if (!can) return null;
  const mine = refIds.flatMap((id) => entriesOfSource(entries, id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (!mine.length) return null;
  return (
    <>
      {mine.map((e, i) => (
        <Button key={e.id} variant="secondary" size={size} icon={<BookOpen />} onClick={() => nav(`/finance/journal?entry=${e.id}`)}>
          {mine.length > 1 ? <>القيد المحاسبي {i + 1} <span className="num" dir="ltr">({entryRef(e)})</span></> : "القيد المحاسبي"}
        </Button>
      ))}
    </>
  );
}
/** Nothing at all while the accounts section is not released. */
export function SourceEntry({ refId, size }: { refId: string | string[]; size?: "sm" | "md" }) {
  return FINANCE_ON ? <Inner refIds={Array.isArray(refId) ? refId : [refId]} size={size} /> : null;
}

/** Mounted once in the shell: posts the entries of new stock movements. */
function Sync() { useStockSync(); useShiftSync(); return null; }
export const StockSync = () => (FINANCE_ON ? <Sync /> : null);
