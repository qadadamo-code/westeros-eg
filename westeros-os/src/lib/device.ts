/**
 * Light mode for modest devices (cheap cashier PCs, budget phones): heavy visual effects — frosted-glass blur,
 * the opening animation — cost a lot of GPU time there and make every scroll and tap feel slow.
 *
 * Light mode is on when the device reports little memory or few cores, or asks to save data. A per-device choice
 * saved under "westeros.lite" ("1" on, "0" off) wins over the guess.
 */
const KEY = "westeros.lite";

export function liteChoice(): boolean | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "1" ? true : v === "0" ? false : null;
  } catch {
    return null;
  }
}

export function setLiteChoice(v: boolean | null) {
  try {
    if (v === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, v ? "1" : "0");
  } catch {
    /* private mode: the guess applies */
  }
  applyLite();
}

export function guessLowEnd(): boolean {
  if (typeof navigator === "undefined") return false;
  const n = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if (n.connection?.saveData) return true;
  if (typeof n.deviceMemory === "number" && n.deviceMemory <= 4) return true;
  if (typeof n.hardwareConcurrency === "number" && n.hardwareConcurrency > 0 && n.hardwareConcurrency <= 4) return true;
  return false;
}

export function isLite(): boolean {
  return liteChoice() ?? guessLowEnd();
}

/** Marks <html> so the stylesheet can switch the heavy effects off (see .sf-lite in styles/index.css). */
export function applyLite() {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("sf-lite", isLite());
}
