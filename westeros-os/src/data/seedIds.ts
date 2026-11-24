/**
 * The fixed ids of the demo tenant. Kept apart from ./seed.ts so the sign-in screens and the session can name them
 * without pulling the whole demo seed (every module's sample rows) into the first download.
 */
import { seedId } from "@/lib/id";

const id = (k: string) => seedId(`sufra-zamalek:${k}`);

export const DEMO_RESTAURANT_ID = id("restaurant");
export const DEMO_BRANCH_ID = id("branch:zamalek");
export const staffId = (key: string) => id(`staff:${key}`);
export const userId = (key: string) => id(`user:${key}`);
