import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALERT_SILENT, createRecipe, RECIPE_ID, TICK_MS } from "./index.js";
import { FakeWorld, flush } from "./testing/ctx.testing.js";

const MIN = 60_000;

const PARAMS = {
  zone: "zone",
  temperatureSensor: "sensor",
  heaters: ["socket"],
  comfortTemp: "20",
  ecoTemp: "17",
  timeout: "30m",
};

function office(temp = 19): FakeWorld {
  return new FakeWorld().sensor(temp).socket();
}

async function start(world: FakeWorld, params: Record<string, unknown> = PARAMS) {
  const recipe = createRecipe();
  const ctx = world.ctx();
  recipe.validate(params, ctx);
  const handle = recipe.createInstance(params, ctx);
  await flush();
  return handle;
}

describe("createRecipe", () => {
  it("declares the recipe, its mode control and its tile", () => {
    const r = createRecipe();
    expect(r.id).toBe(RECIPE_ID);
    expect(r.actions?.[0]).toMatchObject({ id: "set_mode", stateKey: "mode" });
    expect(r.actions?.[0].options.map((o) => o.value)).toEqual(["auto", "comfort", "eco", "off"]);
    expect(r.tile).toEqual({ icon: "Flame", actions: ["set_mode"] });
    expect(r.i18n?.fr.name).toBe("Chauffage malin sur prise");
  });
});

describe("validation", () => {
  const validate = (world: FakeWorld, over: Record<string, unknown>) => () =>
    createRecipe().validate({ ...PARAMS, ...over }, world.ctx());

  it("accepts the office", () => {
    expect(validate(office(), {})).not.toThrow();
  });

  it("refuses a socket without a state order", () => {
    const world = new FakeWorld().sensor().socket("socket", {}, []);
    expect(validate(world, {})).toThrow(/no "state" order/);
  });

  it("refuses a heater that is not a switch", () => {
    const world = office().add({
      id: "pilot",
      name: "Radiateur",
      type: "heater",
      data: { state: false },
      orders: [{ alias: "state" }],
    });
    expect(validate(world, { heaters: ["pilot"] })).toThrow(/not a switch/);
  });

  it("refuses a sensor without temperature", () => {
    const world = office().add({ id: "pir", name: "PIR", type: "sensor", data: {}, orders: [] });
    expect(validate(world, { temperatureSensor: "pir" })).toThrow(/no temperature/);
  });

  it("refuses eco above comfort", () => {
    expect(validate(office(), { ecoTemp: "21" })).toThrow(/Eco must not be above comfort/);
  });

  it("refuses a half-configured night", () => {
    expect(validate(office(), { nightStart: "22:00", nightEnd: "06:00" })).toThrow(/all three/);
    expect(validate(office(), { nightTemp: "15" })).toThrow(/all three/);
  });

  it("refuses a night that starts when it ends", () => {
    expect(validate(office(), { nightStart: "22:00", nightEnd: "22:00", nightTemp: "15" })).toThrow(
      /must differ/,
    );
  });

  it("accepts empty night fields", () => {
    expect(validate(office(), { nightStart: "", nightEnd: "", nightTemp: "" })).not.toThrow();
  });
});

describe("instance", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 24, 12, 0));
  });
  afterEach(() => vi.useRealTimers());

  it("heats on presence below comfort, and the socket's report is not a manual switch", async () => {
    const world = office(19);
    world.zone.motion = true;
    await start(world);
    expect(world.orders).toEqual([{ equipmentId: "socket", alias: "state", value: true }]);
    expect(world.stateOf()).toBe(true);
    expect(world.state.get("hold")).toBeUndefined();
    expect(world.logs.map((l) => l.message)).toEqual([
      "Consigne confort 20° (présence)",
      "Chauffage allumé à 19° (consigne 20°)",
    ]);
  });

  it("drops to eco once the room has been empty for the timeout", async () => {
    const world = office(19);
    world.zone.motion = true;
    await start(world);
    world.motion(false);
    await vi.advanceTimersByTimeAsync(29 * MIN);
    world.temp(19);
    expect(world.state.get("summary")).toMatch(/^Confort 20°/);
    // Past the timeout and the minimum cycle: eco 17, the room at 19 → cut.
    await vi.advanceTimersByTimeAsync(2 * MIN);
    world.temp(19.1);
    await flush();
    expect(world.state.get("summary")).toBe("Eco 17° · 19,1°");
    expect(world.orders.map((o) => o.value)).toEqual([true, false]);
  });

  it("shows the radiator's own thermostat as 'radiateur au repos'", async () => {
    const world = office(19);
    world.zone.motion = true;
    await start(world);
    expect(world.state.get("summary")).toBe("Confort 20° · 19° · radiateur au repos");
    world.set("socket", "power", 1500);
    expect(world.state.get("summary")).toBe("Confort 20° · 19° · chauffe");
  });

  it("cuts at once at 25 °C", async () => {
    const world = office(19);
    world.zone.motion = true;
    await start(world);
    await vi.advanceTimersByTimeAsync(MIN);
    world.temp(25.1);
    await flush();
    expect(world.stateOf()).toBe(false);
    expect(world.state.get("summary")).toBe("Sécurité · 25,1°");
  });

  describe("manual hold (FR8–FR10)", () => {
    it("holds when someone switches the socket, and sends nothing while held", async () => {
      const world = office(19);
      world.zone.motion = true;
      await start(world);
      world.set("socket", "state", false);
      await vi.advanceTimersByTimeAsync(10 * MIN);
      world.temp(18);
      await flush();
      expect(world.orders).toHaveLength(1);
      expect(world.state.get("hold")).toBe(true);
      expect(world.state.get("summary")).toBe("Manuel · 18°");
      expect(world.logs.filter((l) => l.message.includes("basculée à la main"))).toHaveLength(1);
    });

    it("hands back once the room has been empty for the timeout", async () => {
      const world = office(19);
      world.zone.motion = true;
      await start(world);
      world.set("socket", "state", false);
      world.motion(false);
      await vi.advanceTimersByTimeAsync(31 * MIN);
      world.temp(16);
      await flush();
      expect(world.state.get("hold")).toBeUndefined();
      expect(world.logs.some((l) => l.message.includes("la recette reprend la main"))).toBe(true);
      // Eco 17 with the room at 16: the recipe heats again.
      expect(world.orders.at(-1)?.value).toBe(true);
    });

    it("hands back when a mode is picked", async () => {
      const world = office(19);
      world.zone.motion = true;
      const handle = await start(world);
      world.set("socket", "state", false);
      handle.onAction?.("set_mode", { mode: "comfort" });
      await flush();
      expect(world.state.get("hold")).toBeUndefined();
      expect(world.state.get("mode")).toBe("comfort");
      // The recipe switched the socket at start: the minimum cycle applies.
      expect(world.stateOf()).toBe(false);
      await vi.advanceTimersByTimeAsync(5 * MIN);
      expect(world.stateOf()).toBe(true);
    });

    it("keeps a persisted hold across a restart", async () => {
      const world = office(18);
      world.state.set("hold", true);
      world.state.set("holdSince", new Date().toISOString());
      world.zone.motion = true;
      await start(world);
      expect(world.orders).toEqual([]);
      expect(world.state.get("summary")).toBe("Manuel · 18°");
    });
  });

  describe("mode (FR2)", () => {
    it("publishes auto from the start so the control renders", async () => {
      const world = office();
      await start(world);
      expect(world.state.get("mode")).toBe("auto");
    });

    it("cuts at once in off, and the choice survives a restart", async () => {
      const world = office(19);
      world.zone.motion = true;
      const handle = await start(world);
      handle.onAction?.("set_mode", { mode: "off" });
      await flush();
      expect(world.stateOf()).toBe(false);
      expect(world.state.get("summary")).toBe("Arrêt");
      handle.stop();
      await start(world);
      expect(world.state.get("mode")).toBe("off");
      expect(world.state.get("summary")).toBe("Arrêt");
    });

    it("ignores an unknown mode", async () => {
      const world = office();
      const handle = await start(world);
      handle.onAction?.("set_mode", { mode: "turbo" });
      expect(world.state.get("mode")).toBe("auto");
    });
  });

  it("keeps the room occupied across a restart within the timeout", async () => {
    const world = office(19);
    world.state.set("lastMotionAt", new Date(Date.now() - 10 * MIN).toISOString());
    await start(world);
    expect(world.state.get("summary")).toMatch(/^Confort 20°/);
    expect(world.state.get("timerExpiresAt")).toBe(new Date(Date.now() + 20 * MIN).toISOString());
  });

  it("counts down to the absence only while occupied without motion", async () => {
    const world = office(19);
    world.zone.motion = true;
    await start(world);
    expect(world.state.get("timerExpiresAt")).toBeUndefined();
    world.motion(false);
    expect(world.state.get("timerExpiresAt")).toBe(new Date(Date.now() + 30 * MIN).toISOString());
    world.motion(true);
    expect(world.state.get("timerExpiresAt")).toBeUndefined();
  });

  it("cuts on a silent sensor and clears the alert on the next reading (FR7)", async () => {
    const world = office(19);
    world.zone.motion = true;
    await start(world);
    await vi.advanceTimersByTimeAsync(91 * MIN);
    expect(world.state.get("alert")).toBe(ALERT_SILENT);
    expect(world.stateOf()).toBe(false);
    expect(world.state.get("summary")).toBe("Capteur muet");
    world.temp(18.5);
    await flush();
    expect(world.state.get("alert")).toBeUndefined();
    // Cut a minute ago: the regulation waits for the minimum cycle to switch it back on.
    expect(world.stateOf()).toBe(false);
    await vi.advanceTimersByTimeAsync(5 * MIN);
    world.temp(18.4);
    await flush();
    expect(world.stateOf()).toBe(true);
    const sensorLogs = world.logs.filter((l) => l.message.startsWith("THR_BUREAU"));
    expect(sensorLogs.map((l) => l.level)).toEqual(["warn", "info"]);
  });

  it("follows the night setpoint over its window", async () => {
    vi.setSystemTime(new Date(2026, 9, 24, 23, 0));
    const world = office(16);
    world.zone.motion = true;
    await start(world, { ...PARAMS, nightStart: "22:00", nightEnd: "06:00", nightTemp: "15" });
    expect(world.state.get("summary")).toBe("Nuit 15° · 16°");
    expect(world.orders).toEqual([]);
  });

  it("logs nothing and orders nothing over an hour when nothing changes", async () => {
    const world = office(20);
    world.zone.motion = true;
    await start(world);
    const logs = world.logs.length;
    await vi.advanceTimersByTimeAsync(60 * TICK_MS);
    expect(world.logs.length).toBe(logs);
    expect(world.orders).toEqual([]);
  });

  it("stops cleanly: no handler, no timer, no order", async () => {
    const world = office(20);
    world.zone.motion = true;
    const handle = await start(world);
    handle.stop();
    expect(world.handlerCount()).toBe(0);
    world.temp(15);
    await vi.advanceTimersByTimeAsync(10 * TICK_MS);
    expect(world.orders).toEqual([]);
  });
});
