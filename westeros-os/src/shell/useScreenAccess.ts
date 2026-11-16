import { useSession } from "@/auth/session";
import { COST_CONTROL_ONLY } from "@/costControl";
import { useLive } from "@/data/hooks";
import { screensOf, userTypeOf } from "@/modules/cc/lib";
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
  const screens = type ? screensOf(type) : null;
  setAllowedScreens(screens);
  return screens ? screens.join(",") : "*";
}
