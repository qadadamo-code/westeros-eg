import { useSession } from "@/auth/session";
import { COST_CONTROL_ONLY } from "@/costControl";
import { useLive } from "@/data/hooks";
import { setMoneyHidden } from "@/lib/money";
import { seesPrices, userTypeOf } from "@/modules/cc/lib";
import { screensOfRole } from "@/modules/cc/access";
import { setAllowedScreens } from "@/modules/screens";

/**
 * The screens the signed-in user's type may open, as a key that changes when they change.
 * The account owner has no limit. Sets the registry's filter while rendering, so nav, home and guards agree.
 */
export function useScreenAccess(): string {
  const { staff } = useSession();
  const settings = useLive("mfgSettings").data[0];
  const lists = settings?.lists;
  const type = COST_CONTROL_ONLY && staff && staff.role !== "owner" && lists ? userTypeOf(staff, lists) : null;
  const screens = type ? screensOfRole(type) : null;
  setAllowedScreens(screens);
  // prices: the owner always sees them; everyone else needs the permission on their user type
  const hide = COST_CONTROL_ONLY && !!staff && staff.role !== "owner" && (!lists || !type || !seesPrices(type));
  setMoneyHidden(hide);
  return `${screens ? screens.join(",") : "*"}|${hide ? "no-prices" : "prices"}`;
}
