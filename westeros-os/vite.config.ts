/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Served under the existing Vercel site at /app/ (see README → Deploy).
  // The full system (the backup version) is built a second time with VITE_FULL=1 and served at /full/.
  base: process.env.VITE_FULL === "1" ? "/full/" : "/app/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@finance": path.join(root, "../westeros-finance/src"),
      "@": path.join(root, "src"),
    },
  },
  server: { fs: { allow: [root, path.join(root, "../westeros-finance")] } },
  build: { outDir: "dist", target: "es2022", chunkSizeWarningLimit: 900 },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
    // the test suite covers the full system; the Cost Control version has its own tests under src/modules/cc
    env: { VITE_FULL: "1" },
    setupFiles: ["src/test/setup.ts"],
    // the demo seed (3 months of books, inventory moves, HR punches) takes a few seconds to write into fake-indexeddb
    testTimeout: 60_000,
  },
});
