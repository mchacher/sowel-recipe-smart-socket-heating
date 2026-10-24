import { describe, expect, it } from "vitest";
import { PresenceFilter, emptyAt, holdEnded, isOccupied } from "./presence.js";

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

describe("PresenceFilter (spec 005 FR1)", () => {
  const S = 1_000;

  it("drops a lone detection in an empty room", () => {
    const f = new PresenceFilter();
    expect(f.update(true, false, 0).motion).toBe(false);
    expect(f.update(false, false, 63 * S).motion).toBe(false);
    expect(f.update(false, false, 4 * MIN)).toEqual({ motion: false, dropped: false });
    expect(f.update(false, false, 5 * MIN)).toEqual({ motion: false, dropped: true });
  });

  it("confirms motion lasting 2 minutes", () => {
    const f = new PresenceFilter();
    f.update(true, false, 0);
    expect(f.update(true, false, MIN).motion).toBe(false);
    expect(f.update(true, false, 2 * MIN).motion).toBe(true);
  });

  it("confirms a second detection within 5 minutes", () => {
    const f = new PresenceFilter();
    f.update(true, false, 0);
    f.update(false, false, MIN);
    expect(f.update(true, false, 4 * MIN).motion).toBe(true);
  });

  it("a second detection after 5 minutes starts over", () => {
    const f = new PresenceFilter();
    f.update(true, false, 0);
    f.update(false, false, MIN);
    expect(f.update(true, false, 6 * MIN)).toEqual({ motion: false, dropped: true });
    expect(f.update(true, false, 8 * MIN).motion).toBe(true);
  });

  it("passes motion through in an occupied room", () => {
    const f = new PresenceFilter();
    expect(f.update(true, true, 0).motion).toBe(true);
    expect(f.update(false, true, S).motion).toBe(false);
  });
});
