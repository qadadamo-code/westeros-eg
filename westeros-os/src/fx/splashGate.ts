/** Whether the opening animation plays: once per browser session, never in light mode or for reduced motion. */
import { isLite } from "@/lib/device";

export const SPLASH_KEY = "westeros.splash";

export function splashWanted(): boolean {
  try {
    if (sessionStorage.getItem(SPLASH_KEY) === "1") return false;
  } catch {
    /* private mode: decide below */
  }
  if (isLite()) return false;
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  return true;
}
