import type { RestClient } from "../../src/transport/rest.ts";

export const TEST_TRIP_PREFIX = "WANDERDOG_TEST_";

type CleanupRest = Pick<RestClient, "getUser" | "listTrips" | "deleteTrip">;

export async function deleteStaleTestTrips(
  rest: CleanupRest,
): Promise<{ deleted: string[]; failed: Array<{ key: string; error: string }> }> {
  const me = await rest.getUser();
  const stale = (await rest.listTrips()).filter(
    (t) => t.title.startsWith(TEST_TRIP_PREFIX) && t.user?.id === me.id,
  );

  const deleted: string[] = [];
  const failed: Array<{ key: string; error: string }> = [];
  for (const t of stale) {
    try {
      await rest.deleteTrip(t.key);
      deleted.push(t.key);
    } catch (err) {
      failed.push({ key: t.key, error: (err as Error).message });
    }
  }
  return { deleted, failed };
}
