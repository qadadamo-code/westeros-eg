/** Opening screen: the Westeros mark is revealed through a drop of liquid glass, once per browser session. */
import { useEffect, useMemo, useState } from "react";
import { LOGO_GOLD, LOGO_PATHS, LOGO_VIEWBOX } from "@/shell/logoPaths";
import { GlassIconReveal } from "./GlassIconReveal";

import { SPLASH_KEY as KEY } from "./splashGate";

// short: the app is ready behind it, so a long show only feels like waiting
const PLAY_MS = 2200;
const FADE_MS = 400;

function seen() {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function Splash() {
  const [phase, setPhase] = useState<"play" | "fade" | "done">(() => (seen() ? "done" : "play"));
  const logo = useMemo(() => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LOGO_VIEWBOX}"><g fill="${LOGO_GOLD}">${LOGO_PATHS.map((d) => `<path d="${d}"/>`).join("")}</g></svg>`, []);

  useEffect(() => {
    if (phase !== "play") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = window.setTimeout(() => setPhase("fade"), reduced ? 900 : PLAY_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== "fade") return;
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {
      /* private mode: the splash simply plays again next time */
    }
    const t = window.setTimeout(() => setPhase("done"), FADE_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  if (phase === "done") return null;
  return (
    <div
      className="fixed inset-0 z-[200] bg-[#0d0d0d] transition-opacity ease-out"
      style={{ opacity: phase === "fade" ? 0 : 1, transitionDuration: `${FADE_MS}ms`, pointerEvents: phase === "fade" ? "none" : "auto" }}
      onClick={() => setPhase("fade")}
    >
      <GlassIconReveal
        logo={logo}
        label="Westeros"
        look="light"
        background="#0d0d0d"
        logoColor={LOGO_GOLD}
        tileSize={300}
        logoScale={0.74}
        finalScale={0.92}
        loop={false}
        className="size-full"
      />
      <p dir="ltr" className="pointer-events-none absolute inset-x-0 bottom-[9svh] text-center text-[11px] font-bold tracking-[0.42em] text-[#f8bb18]/70">
        WESTEROS OS
      </p>
    </div>
  );
}
