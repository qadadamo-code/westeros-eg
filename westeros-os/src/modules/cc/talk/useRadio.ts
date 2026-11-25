/** The signed-in employee's radio: allowed or not, the people and groups they talk to (اللاسلكي settings). */
import { useMemo } from "react";
import { useSession } from "@/auth/session";
import { useLive } from "@/data/hooks";
import { listsOf } from "../lib";
import { groupsOf, mayTalk, radioOf, radioOn } from "../radio/access";

export function useMyRadio() {
  const { staff, role } = useSession();
  const settings = useLive("mfgSettings").data[0];
  const members = useLive("memberships", { where: { active: true } }).data;
  return useMemo(() => {
    const setup = radioOf(listsOf(settings));
    const me = staff ? { id: staff.id, role: role ?? "" } : null;
    const on = radioOn(setup, me);
    const people = me && on ? members.filter((m) => m.role !== "platform_admin" && mayTalk(setup, me, m)).sort((a, b) => a.name.localeCompare(b.name, "ar")) : [];
    return { setup, on, people, groups: groupsOf(setup, me), members };
  }, [settings, members, staff, role]);
}
