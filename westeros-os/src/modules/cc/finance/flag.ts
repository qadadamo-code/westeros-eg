/**
 * الحسابات is being built phase by phase and is released in one go: until then it shows only in development, in tests
 * and in a build made with VITE_FINANCE=1. The live build leaves it out of the menu, the routes and the permissions list.
 */
export const FINANCE_ON = import.meta.env.DEV || import.meta.env.MODE === "test" || import.meta.env.VITE_FINANCE === "1";
