// WESTEROS_PASSWORD=... npx tsx scripts/gen-westeros-seed.ts <out.sql>
// Writes the Westeros tenant (restaurant, branch, staff, menu, raw materials, manufactured products) as SQL for a
// fresh Supabase project. The file holds the staff password and PINs, so write it outside the repository.
process.env.TZ = "Africa/Cairo";
const { seedSql } = await import("../src/data/seedSql");
const { buildWesterosSeed, WESTEROS_STAFF } = await import("../src/data/westeros/seed");
const fs = await import("node:fs");
const out = process.argv[2];
const password = process.env.WESTEROS_PASSWORD;
if (!out || !password) throw new Error("usage: WESTEROS_PASSWORD=... tsx scripts/gen-westeros-seed.ts <out.sql>");
fs.writeFileSync(out, seedSql({ build: buildWesterosSeed, staff: WESTEROS_STAFF, password, header: "-- Westeros OS tenant seed (generated). Idempotent: every insert is ON CONFLICT DO NOTHING." }));
console.log("wrote", out);
export {};
