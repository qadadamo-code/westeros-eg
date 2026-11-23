/** الطلبات اللي مستنية قرار من الموظف اللي فاتح السيستم (badge on the menu and the requests tab) */
import { useMemo } from "react";
import { K, dataOf, mayDecide, requestState, type DecisionData, type RequestData } from "./model";
import { useHrx, type Hrx } from "./useHrx";

export function pendingFor(hrx: Hrx) {
  const me = hrx.staff;
  if (!me) return [];
  const decisions = hrx.by(K.decision);
  return hrx.by(K.request).filter((r) => {
    if (r.status !== "pending" || !r.memberId) return false;
    const type = hrx.settings.requestTypes.find((t) => t.id === dataOf<RequestData>(r).typeId);
    const st = requestState(type, decisions.filter((d) => dataOf<DecisionData>(d).requestId === r.id));
    return !st.done && !st.rejected && mayDecide(type?.steps[st.step], r.memberId, me, hrx.ctx);
  });
}
export function usePendingForMe(): number | null {
  const hrx = useHrx();
  return useMemo(() => pendingFor(hrx).length || null, [hrx]);
}
