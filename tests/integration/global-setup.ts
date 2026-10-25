import { loadConfig } from "../../src/config.ts";
import { RestClient } from "../../src/transport/rest.ts";
import { deleteStaleTestTrips } from "./test-trip-cleanup.ts";

export async function teardown(): Promise<void> {
  if (!process.env.WANDERLOG_COOKIE) return;
  try {
    const { deleted, failed } = await deleteStaleTestTrips(new RestClient(loadConfig()));
    console.log(`[cleanup] deleted ${deleted.length} test trip(s)`);
    for (const f of failed) console.warn(`[cleanup] could not delete ${f.key}: ${f.error}`);
  } catch (err) {
    console.warn(`[cleanup] skipped: ${(err as Error).message}`);
  }
}
