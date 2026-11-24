/** Everything the finance screens read: the chart, the journal, cost centres, settings and the branches. */
import { useMemo } from "react";
import { useSession } from "@/auth/session";
import { useLive } from "@/data/hooks";
import { settingsOf } from "./ops";
import { useFinPerms } from "./perms";
import { indexChart } from "./tree";

export function useFinance() {
  const { branchId, branches: mine, staff } = useSession();
  // مكان العمل: a user held to some branches sees only them, whatever the role
  const work = staff && staff.branchIds.length ? staff.branchIds.join(",") : "";
  const accountsLive = useLive("finAccounts");
  const accounts = accountsLive.data;
  const entries = useLive("finEntries").data;
  const centres = useLive("finCentres").data;
  const settingsRow = useLive("finSettings").data[0];
  const branches = useLive("branches").data;
  const everyBranch = useFinPerms().has("branches.all");
  return useMemo(() => {
    const ix = indexChart(accounts);
    const byId = new Map(accounts.map((x) => [x.id, x]));
    const settings = settingsOf(settingsRow);
    const branchById = new Map(branches.map((b) => [b.id, b]));
    const sorted = [...branches].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || (a.code ?? 1e9) - (b.code ?? 1e9) || a.createdAt.localeCompare(b.createdAt));
    return {
      loading: accountsLive.loading, accounts, entries, centres, settings, ix, byId, branches: sorted,
      branchName: (id: string | null | undefined) => branchById.get(id ?? "")?.name.ar ?? "كل الفروع",
      branchId: branchId ?? mine.find((b) => b.isDefault)?.id ?? mine[0]?.id ?? null,
      /** the only branches this user may look at; null = all of them */
      onlyBranches: work ? work.split(",") : everyBranch || !mine.length ? null : mine.map((b) => b.id),
      /** "1101 · النقدية" */
      label: (id: string | null | undefined) => { const x = byId.get(id ?? ""); return x ? `${x.code} · ${x.name.ar}` : "—"; },
    };
  }, [accounts, entries, centres, settingsRow, branches, accountsLive.loading, branchId, mine, everyBranch, work]);
}
export type Fin = ReturnType<typeof useFinance>;
