/** set by a successful PIN or email sign-in; the greeting (src/shell/Welcome.tsx) reads and clears it, so a reload never greets again */
export const WELCOME_FLAG = "sufra-os.welcome";

export function markWelcome() {
  try {
    sessionStorage.setItem(WELCOME_FLAG, "1");
  } catch {
    /* private mode: no greeting */
  }
}
