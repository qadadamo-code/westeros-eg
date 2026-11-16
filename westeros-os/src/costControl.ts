/**
 * Two versions are built from this code base:
 *   - the Cost Control version (default, served at /app/): only what the "Cost Control System" document describes,
 *     section by section (src/modules/cc);
 *   - the full system (VITE_FULL=1, served at /full/): everything that existed before, kept as a backup.
 * Both read and write the same database.
 */
export const FULL_SYSTEM = import.meta.env.VITE_FULL === "1";
export const COST_CONTROL_ONLY = !FULL_SYSTEM;
