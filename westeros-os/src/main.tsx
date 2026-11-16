import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app/App";
import "@/styles/index.css";
import { Splash } from "@/fx/Splash";
import { initPwa } from "@/lib/pwa";

initPwa();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <Splash />
  </StrictMode>,
);
