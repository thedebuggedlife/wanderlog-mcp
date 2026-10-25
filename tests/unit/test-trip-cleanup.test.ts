import { describe, expect, it } from "vitest";
import { deleteStaleTestTrips } from "../integration/test-trip-cleanup.ts";
import type { TripPlanSummary } from "../../src/types.ts";

const ME = { id: 7, username: "me" };
const FRIEND = { id: 9, username: "friend" };

function trip(key: string, title: string, user?: TripPlanSummary["user"]): TripPlanSummary {
  return { id: 0, key, title, startDate: "", endDate: "", placeCount: 0, user };
}

function fakeRest(trips: TripPlanSummary[], failOn: string[] = []) {
  const deleted: string[] = [];
  return {
    deleted,
    rest: {
      getUser: async () => ME,
      listTrips: async () => trips,
      deleteTrip: async (key: string) => {
        if (failOn.includes(key)) throw new Error(`boom ${key}`);
        deleted.push(key);
      },
    },
  };
}

describe("deleteStaleTestTrips", () => {
  it("deletes only test-titled trips owned by the current user", async () => {
    const { rest, deleted } = fakeRest([
      trip("a", "WANDERDOG_TEST_1", ME),
      trip("b", "WANDERDOG_TEST_2", FRIEND),
      trip("c", "Lisbon weekend", ME),
      trip("d", "WANDERDOG_TEST_3"),
      trip("e", "my WANDERDOG_TEST_4", ME),
    ]);

    const result = await deleteStaleTestTrips(rest);

    expect(deleted).toEqual(["a"]);
    expect(result).toEqual({ deleted: ["a"], failed: [] });
  });

  it("keeps going when one delete fails and reports it", async () => {
    const { rest, deleted } = fakeRest(
      [trip("a", "WANDERDOG_TEST_1", ME), trip("b", "WANDERDOG_TEST_2", ME)],
      ["a"],
    );

    const result = await deleteStaleTestTrips(rest);

    expect(deleted).toEqual(["b"]);
    expect(result.deleted).toEqual(["b"]);
    expect(result.failed).toEqual([{ key: "a", error: "boom a" }]);
  });
});
