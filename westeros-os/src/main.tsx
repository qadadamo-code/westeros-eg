import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app/App";
import "@/styles/index.css";
import { Splash } from "@/fx/Splash";
import { initLatinDigits } from "@/lib/latinInput";
import { initPwa } from "@/lib/pwa";
import { reloadIfStale } from "@/shell/ErrorBoundary";

initPwa();
initLatinDigits();
// A lazy page from a build that was replaced on the server: load the new build instead of showing an error.
window.addEventListener("vite:preloadError", (e) => {
  if (reloadIfStale((e as Event & { payload?: unknown }).payload)) e.preventDefault();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <Splash />
  </StrictMode>,
);
