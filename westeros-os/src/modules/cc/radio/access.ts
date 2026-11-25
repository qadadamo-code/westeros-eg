/**
 * اللاسلكي المنظم (Saqr 2026-11-25): management sets, per employee, whether they may use the radio and with whom,
 * and the group chats. The owner always may, with everyone. Pure, so the settings screen, the talk screen and the
 * runtime agree.
 */
import type { MfgLists, RadioSetup } from "@/data/types";

export const EMPTY_RADIO: RadioSetup = { access: {}, groups: [] };
export const radioOf = (lists: Pick<MfgLists, "radio"> | null | undefined): RadioSetup => ({ ...EMPTY_RADIO, ...(lists?.radio ?? {}) });

type Member = { id: string; role: string };

/** may this member use the radio at all? */
export const radioOn = (r: RadioSetup, m: Member | null | undefined): boolean => !!m && (m.role === "owner" || !!r.access[m.id]?.on);

/** may `a` send to `b` directly? Both must be allowed, and `b` must be in `a`'s list (the owner talks to everyone). */
export function mayTalk(r: RadioSetup, a: Member, b: Member): boolean {
  if (a.id === b.id || !radioOn(r, a) || !radioOn(r, b)) return false;
  if (a.role === "owner") return true;
  const p = r.access[a.id]?.peers ?? [];
  return p === "all" || p.includes(b.id);
}

/** the groups this member talks in (they must be allowed too) */
export const groupsOf = (r: RadioSetup, m: Member | null | undefined) => (radioOn(r, m) && m ? r.groups.filter((g) => g.memberIds.includes(m.id)) : []);
