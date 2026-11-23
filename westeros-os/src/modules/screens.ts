/**
 * Screens a user type may open (Cost Control version: المستخدمين > أنواع المستخدمين).
 * `null` = no limit beyond the role. Filled by `useScreenAccess` for the signed-in user; the registry reads it.
 */
let allowed: ReadonlySet<string> | null = null;

export function setAllowedScreens(ids: readonly string[] | null) {
  allowed = ids ? new Set(ids) : null;
}
/** صفحتي (/me): every employee opens their own page, whatever their role */
const ALWAYS = new Set(["cc-me", "cc-floor"]);
export const screenAllowed = (moduleId: string) => !allowed || ALWAYS.has(moduleId) || allowed.has(moduleId);
