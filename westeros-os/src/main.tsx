import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app/App";
import "@/styles/index.css";
import { splashWanted } from "@/fx/splashGate";
import { initLatinDigits } from "@/lib/latinInput";
import { initPwa } from "@/lib/pwa";
import { applyLite } from "@/lib/device";
import { reloadIfStale } from "@/shell/ErrorBoundary";

// the opening animation is heavy (canvas + glass): its code loads only when it actually plays
const Splash = lazy(() => import("@/fx/Splash").then((m) => ({ default: m.Splash })));

initPwa();
applyLite();
initLatinDigits();
// A lazy page from a build that was replaced on the server: load the new build instead of showing an error.
window.addEventListener("vite:preloadError", (e) => {
  if (reloadIfStale((e as Event & { payload?: unknown }).payload)) e.preventDefault();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    {splashWanted() && (
      <Suspense fallback={<div className="fixed inset-0 z-[200] bg-[#0d0d0d]" />}>
        <Splash />
      </Suspense>
    )}
  </StrictMode>,
);
