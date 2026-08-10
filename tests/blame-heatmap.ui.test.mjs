import { describe, expect, it } from "vitest";
import { getBlameHeatBucket } from "../src/features/blame/blame-heatmap.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-08-10T00:00:00.000Z");

describe("getBlameHeatBucket", () => {
  it("uses all five recency buckets", () => {
    expect(getBlameHeatBucket(new Date(NOW - 1 * DAY), NOW).key).toBe("fresh");
    expect(getBlameHeatBucket(new Date(NOW - 10 * DAY), NOW).key).toBe("recent");
    expect(getBlameHeatBucket(new Date(NOW - 60 * DAY), NOW).key).toBe("aging");
    expect(getBlameHeatBucket(new Date(NOW - 180 * DAY), NOW).key).toBe("old");
    expect(getBlameHeatBucket(new Date(NOW - 400 * DAY), NOW).key).toBe("ancient");
  });

  it("returns an explicit unknown bucket for invalid dates", () => {
    expect(getBlameHeatBucket("not-a-date", NOW)).toMatchObject({ key: "unknown", shortLabel: "?" });
  });
});
