/**
 * الحسابات is being built phase by phase and is released in one go: until then it shows only in development, in tests
 * and in a build made with VITE_FINANCE=1. The live build leaves it out of the menu, the routes and the permissions list.
 */
// scripts that run outside Vite (the seed generator) have no import.meta.env
const env = (import.meta as { env?: Record<string, unknown> }).env ?? {};
export const FINANCE_ON = !!env.DEV || env.MODE === "test" || env.VITE_FINANCE === "1";
