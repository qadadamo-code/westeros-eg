/** An in-memory database for the finance tests. */
import { LocalAdapter } from "@/data/local/LocalAdapter";
import { makeDb } from "@/data/hooks";
import { WESTEROS_BRANCH_ID, WESTEROS_RESTAURANT_ID } from "@/data/westeros/seed";
import { buildTestKitchen } from "@/modules/production/testKitchen";

export async function financeDb() {
  const repo = new LocalAdapter({ name: `fin-test-${Math.random()}`, memory: true, buildSeed: buildTestKitchen, now: () => new Date("2026-11-18T10:00:00Z") });
  await repo.ready();
  return makeDb(repo, WESTEROS_RESTAURANT_ID, WESTEROS_BRANCH_ID, null);
}
