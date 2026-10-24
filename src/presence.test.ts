import { describe, expect, it } from "vitest";
import { emptyAt, holdEnded, isOccupied } from "./presence.js";

const MIN = 60_000;
const T = 30 * MIN;
const NOW = 1_000 * MIN;

describe("isOccupied (FR1)", () => {
  it("is occupied while the zone reports motion", () => {
    expect(isOccupied(true, null, NOW, T)).toBe(true);
  });

  it("stays occupied for the timeout after the last motion", () => {
    expect(isOccupied(false, NOW - 10 * MIN, NOW, T)).toBe(true);
    expect(emptyAt(NOW - 10 * MIN, T)).toBe(NOW + 20 * MIN);
  });

  it("is empty once the timeout has passed", () => {
    expect(isOccupied(false, NOW - 31 * MIN, NOW, T)).toBe(false);
  });

  it("is empty when no motion was ever seen", () => {
    expect(isOccupied(false, null, NOW, T)).toBe(false);
    expect(emptyAt(null, T)).toBeNull();
  });
});

describe("holdEnded (FR10)", () => {
  it("counts from the later of the hold's start and the last motion", () => {
    expect(holdEnded(false, NOW - 40 * MIN, NOW - 20 * MIN, NOW, T)).toBe(false);
  });

  it("ends a hold started on an empty room after the timeout", () => {
    expect(holdEnded(false, NOW - 31 * MIN, null, NOW, T)).toBe(true);
    expect(holdEnded(false, NOW - 31 * MIN, NOW - 60 * MIN, NOW, T)).toBe(true);
  });

  it("never ends while there is motion", () => {
    expect(holdEnded(true, NOW - 120 * MIN, NOW - 120 * MIN, NOW, T)).toBe(false);
  });
});
