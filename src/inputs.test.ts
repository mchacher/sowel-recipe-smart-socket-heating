import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readZoneTemperature, temperatureSources } from "./inputs.js";
import { FakeWorld } from "./testing/ctx.testing.js";

const MIN = 60_000;

describe("the room's temperature (spec 003 FR2)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 24, 12, 0));
  });
  afterEach(() => vi.useRealTimers());

  it("lists the room's sensors, never a socket, selected or not", () => {
    const world = new FakeWorld()
      .sensor(19)
      .socket("socket", { temperature: 30 })
      .socket("lamp", { temperature: 40 })
      .sensor(22, "kitchen", "kitchen");
    const em = world.ctx().equipmentManager;
    expect(temperatureSources(em, ["zone"], ["socket"])).toEqual(["sensor"]);
  });

  it("averages the live readings, keeps the latest instant and the hottest", () => {
    const world = new FakeWorld().sensor(19);
    vi.setSystemTime(Date.now() + 10 * MIN);
    world.sensor(22, "s2");
    const em = world.ctx().equipmentManager;
    expect(readZoneTemperature(em, ["sensor", "s2"], Date.now())).toEqual({
      temperature: 20.5,
      at: Date.now(),
      hottest: 22,
    });
  });

  it("leaves out a reading older than the silent delay; none left is null", () => {
    const world = new FakeWorld().sensor(19).sensor(25, "s2");
    vi.setSystemTime(Date.now() + 80 * MIN);
    world.temp(20);
    vi.setSystemTime(Date.now() + 10 * MIN);
    const em = world.ctx().equipmentManager;
    expect(readZoneTemperature(em, ["sensor", "s2"], Date.now())).toMatchObject({
      temperature: 20,
      hottest: 20,
    });
    vi.setSystemTime(Date.now() + 90 * MIN);
    expect(readZoneTemperature(em, ["sensor", "s2"], Date.now())).toEqual({
      temperature: null,
      at: null,
      hottest: null,
    });
  });
});
