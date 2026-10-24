import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALERT_SILENT, createRecipe, RECIPE_ID, TICK_MS } from "./index.js";
import { FakeWorld, flush } from "./testing/ctx.testing.js";

const MIN = 60_000;

const PARAMS = {
  zone: "zone",
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
    expect(r.actions?.[0].options.map((o) => o.value)).toEqual([
      "auto",
      "cocoon",
      "comfort",
      "eco",
      "off",
    ]);
    expect(r.tile).toEqual({ icon: "Flame", actions: ["set_mode"] });
    expect(r.i18n?.fr.name).toBe("Chauffage sur prise");
    expect(r.name).toBe("Socket Heating");
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

  it("refuses a zone without a temperature sensor (spec 003)", () => {
    const world = new FakeWorld()
      .socket("socket", { temperature: 30 })
      .add({ id: "pir", name: "PIR", type: "sensor", data: { occupancy: false }, orders: [] })
      .sensor(19, "elsewhere", "kitchen");
    expect(validate(world, {})).toThrow(/no temperature sensor/);
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
      "Chauffage allumé (Radiateur Bureau) à 19° (consigne 20°)",
    ]);
  });

  it("a failed order followed by an unchanged state report is not a manual switch", async () => {
    const world = office(19);
    world.zone.motion = true;
    world.answer = () => "throw"; // the integration is not connected yet
    await start(world);
    // The socket's next power report republishes its unchanged state.
    world.set("socket", "power", 0);
    world.set("socket", "state", false);
    expect(world.state.get("hold")).toBeUndefined();
    world.answer = () => undefined;
    await vi.advanceTimersByTimeAsync(MIN);
    expect(world.stateOf()).toBe(true);
  });

  it("logs a bounded number of lines while the integration is down", async () => {
    const world = office(19);
    world.zone.motion = true;
    world.answer = () => "throw";
    await start(world);
    for (let i = 0; i < 10; i++) {
      world.set("socket", "power", 0);
      await vi.advanceTimersByTimeAsync(MIN);
    }
    expect(world.logs.map((l) => l.level)).toEqual(["info", "error"]);
    // One attempt a minute at most.
    expect(world.orders.length).toBeLessThanOrEqual(11);
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

  it("cuts at once at 28 °C", async () => {
    const world = office(19);
    world.zone.motion = true;
    await start(world);
    await vi.advanceTimersByTimeAsync(MIN);
    world.temp(28.1);
    await flush();
    expect(world.stateOf()).toBe(false);
    expect(world.state.get("summary")).toBe("Sécurité · 28,1°");
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

  describe("hold and the off mode, hold and a silent sensor", () => {
    it("leaves a socket switched on by hand while the tile is on off", async () => {
      const world = office(19);
      const handle = await start(world);
      handle.onAction?.("set_mode", { mode: "off" });
      world.set("socket", "state", true);
      await vi.advanceTimersByTimeAsync(2 * MIN);
      expect(world.stateOf()).toBe(true);
      expect(world.orders).toEqual([]);
      expect(world.state.get("summary")).toBe("Manuel · 19°");
    });

    it("raises no alert for a silent sensor during a hold", async () => {
      const world = office(19);
      world.zone.motion = true;
      await start(world);
      world.set("socket", "state", false);
      await vi.advanceTimersByTimeAsync(95 * MIN);
      expect(world.state.get("hold")).toBe(true);
      expect(world.state.get("alert")).toBeUndefined();
      expect(world.logs.some((l) => l.message.includes("muet"))).toBe(false);
    });
  });

  describe("mode (FR2)", () => {
    it("walks the whole cycle: auto, comfort, eco, off, auto", async () => {
      const world = office(18.5);
      const handle = await start(world); // empty room: eco 17, the room at 18.5 → off
      expect(world.state.get("summary")).toBe("Eco 17° · 18,5°");
      handle.onAction?.("set_mode", { mode: "comfort" });
      await flush();
      expect(world.stateOf()).toBe(true);
      expect(world.state.get("mode")).toBe("comfort");
      await vi.advanceTimersByTimeAsync(5 * MIN);
      handle.onAction?.("set_mode", { mode: "eco" });
      await flush();
      expect(world.stateOf()).toBe(false);
      handle.onAction?.("set_mode", { mode: "off" });
      expect(world.state.get("summary")).toBe("Arrêt");
      handle.onAction?.("set_mode", { mode: "auto" });
      expect(world.state.get("mode")).toBe("auto");
      expect(world.state.get("summary")).toMatch(/^Eco 17°/);
    });

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
    world.motion(false);
    await vi.advanceTimersByTimeAsync(31 * MIN);
    expect(world.state.get("timerExpiresAt")).toBeUndefined();
  });

  it("does not count down over the night window", async () => {
    vi.setSystemTime(new Date(2026, 9, 24, 23, 0));
    const world = office(16);
    world.zone.motion = true;
    await start(world, { ...PARAMS, nightStart: "22:00", nightEnd: "06:00", nightTemp: "15" });
    world.motion(false);
    expect(world.state.get("timerExpiresAt")).toBeUndefined();
  });

  it("keeps the room occupied after a restart in the middle of a long presence", async () => {
    const world = office(19);
    world.zone.motion = true;
    const handle = await start(world);
    await vi.advanceTimersByTimeAsync(120 * MIN);
    world.temp(19.5);
    handle.stop();
    // The core comes back with no motion yet.
    world.zone.motion = false;
    await vi.advanceTimersByTimeAsync(2 * MIN);
    world.temp(19.5);
    await start(world);
    expect(world.state.get("summary")).toMatch(/^Confort 20°/);
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
    const sensorLogs = world.logs.filter(
      (l) =>
        l.message.includes("Température de la pièce") || l.message.startsWith("Aucune température"),
    );
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

describe("cocoon (spec 002)", () => {
  const COCOON = { ...PARAMS, cocoonTemp: "23", buttons: ["button"] };

  function withButton(temp = 22): FakeWorld {
    return office(temp).add({
      id: "button",
      name: "Switch Cocoon",
      type: "button",
      data: { action: "single", battery: 100 },
      orders: [],
    });
  }

  const press = (world: FakeWorld, action: unknown = "single") =>
    world.set("button", "action", action);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 24, 12, 0));
  });
  afterEach(() => vi.useRealTimers());

  it("starts from the tile and regulates around the cocoon setpoint (AC1)", async () => {
    const world = withButton(22.5);
    world.zone.motion = true;
    const handle = await start(world, COCOON);
    expect(world.orders).toEqual([]);
    handle.onAction?.("set_mode", { mode: "cocoon" });
    await flush();
    expect(world.state.get("mode")).toBe("cocoon");
    expect(world.state.get("cocoonSince")).toBe(new Date().toISOString());
    expect(world.stateOf()).toBe(true);
    expect(world.state.get("summary")).toMatch(/^Cocoon 23° · 22,5°/);
    expect(world.logs.map((l) => l.message)).toContain("Cocoon activé (tuile)");
  });

  it("ignores a cocoon request without a cocoon temperature (AC4)", async () => {
    const world = withButton();
    world.zone.motion = true;
    const handle = await start(world);
    handle.onAction?.("set_mode", { mode: "cocoon" });
    expect(world.state.get("mode")).toBe("auto");
  });

  it("toggles on a button press, then back to auto on the next (AC2)", async () => {
    const world = withButton();
    world.zone.motion = true;
    await start(world, COCOON);
    press(world);
    expect(world.state.get("mode")).toBe("cocoon");
    expect(world.logs.map((l) => l.message)).toContain("Cocoon activé (bouton Switch Cocoon)");
    await vi.advanceTimersByTimeAsync(10_000);
    press(world);
    expect(world.state.get("mode")).toBe("auto");
    expect(world.state.get("cocoonSince")).toBeUndefined();
    expect(world.logs.map((l) => l.message)).toContain("Fin du cocoon : bouton Switch Cocoon");
  });

  it("toggles once on a hold / release pair, and ignores an empty report", async () => {
    const world = withButton();
    world.zone.motion = true;
    await start(world, COCOON);
    press(world, "");
    expect(world.state.get("mode")).toBe("auto");
    press(world, "hold");
    await vi.advanceTimersByTimeAsync(1_500);
    press(world, "release");
    expect(world.state.get("mode")).toBe("cocoon");
  });

  it("ignores a button without a cocoon temperature (AC4)", async () => {
    const world = withButton();
    world.zone.motion = true;
    await start(world);
    press(world);
    expect(world.state.get("mode")).toBe("auto");
  });

  it("a press ends a manual hold", async () => {
    const world = withButton(22);
    world.zone.motion = true;
    await start(world, COCOON);
    world.set("socket", "state", true);
    expect(world.state.get("hold")).toBe(true);
    press(world);
    expect(world.state.get("hold")).toBeUndefined();
    expect(world.state.get("summary")).toMatch(/^Cocoon 23°/);
  });

  it("ends on absence after the timeout, back to auto (AC3)", async () => {
    const world = withButton(22);
    world.zone.motion = true;
    await start(world, COCOON);
    press(world);
    world.motion(false);
    expect(world.state.get("timerExpiresAt")).toBe(new Date(Date.now() + 30 * MIN).toISOString());
    await vi.advanceTimersByTimeAsync(29 * MIN);
    expect(world.state.get("mode")).toBe("cocoon");
    await vi.advanceTimersByTimeAsync(2 * MIN);
    expect(world.state.get("mode")).toBe("auto");
    expect(world.logs.map((l) => l.message)).toContain("Fin du cocoon : pièce vide depuis 30 min");
    expect(world.state.get("summary")).toMatch(/^Eco 17°/);
  });

  it("started from an empty room, lasts the timeout", async () => {
    const world = withButton(22);
    const handle = await start(world, COCOON);
    expect(world.state.get("summary")).toMatch(/^Eco 17°/);
    handle.onAction?.("set_mode", { mode: "cocoon" });
    expect(world.state.get("mode")).toBe("cocoon");
    expect(world.state.get("timerExpiresAt")).toBe(new Date(Date.now() + 30 * MIN).toISOString());
    await vi.advanceTimersByTimeAsync(31 * MIN);
    expect(world.state.get("mode")).toBe("auto");
  });

  it("ends when the night window starts (AC3)", async () => {
    vi.setSystemTime(new Date(2026, 9, 24, 21, 50));
    const world = withButton(22);
    world.zone.motion = true;
    const night = { nightStart: "22:00", nightEnd: "06:00", nightTemp: "15" };
    await start(world, { ...COCOON, ...night });
    press(world);
    await vi.advanceTimersByTimeAsync(9 * MIN);
    expect(world.state.get("mode")).toBe("cocoon");
    await vi.advanceTimersByTimeAsync(2 * MIN);
    expect(world.state.get("mode")).toBe("auto");
    expect(world.logs.map((l) => l.message)).toContain("Fin du cocoon : début de la nuit");
    expect(world.state.get("summary")).toMatch(/^Nuit 15°/);
  });

  it("started inside the night window, wins over it until the absence", async () => {
    vi.setSystemTime(new Date(2026, 9, 24, 23, 0));
    const world = withButton(16);
    world.zone.motion = true;
    const night = { nightStart: "22:00", nightEnd: "06:00", nightTemp: "15" };
    await start(world, { ...COCOON, ...night });
    press(world);
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(world.state.get("mode")).toBe("cocoon");
    expect(world.state.get("summary")).toMatch(/^Cocoon 23°/);
  });

  it("survives a restart with its start (AC5)", async () => {
    const world = withButton(22);
    world.zone.motion = true;
    const handle = await start(world, COCOON);
    press(world);
    const since = world.state.get("cocoonSince");
    world.motion(false);
    await vi.advanceTimersByTimeAsync(10 * MIN);
    handle.stop();
    await vi.advanceTimersByTimeAsync(5 * MIN);
    world.temp(22);
    await start(world, COCOON);
    expect(world.state.get("mode")).toBe("cocoon");
    expect(world.state.get("cocoonSince")).toBe(since);
    await vi.advanceTimersByTimeAsync(16 * MIN);
    expect(world.state.get("mode")).toBe("auto");
  });

  it("ignores the release of a long hold", async () => {
    const world = withButton();
    world.zone.motion = true;
    await start(world, COCOON);
    press(world, "hold");
    await vi.advanceTimersByTimeAsync(5_000);
    press(world, "release");
    press(world, "brightness_stop");
    expect(world.state.get("mode")).toBe("cocoon");
  });

  it("counts down from the last motion when it outlasts the start", async () => {
    const world = withButton(22);
    world.zone.motion = true;
    await start(world, COCOON);
    press(world);
    await vi.advanceTimersByTimeAsync(10 * MIN);
    world.motion(false);
    expect(world.state.get("timerExpiresAt")).toBe(new Date(Date.now() + 30 * MIN).toISOString());
  });

  it("ending on its own keeps a manual hold: night start", async () => {
    vi.setSystemTime(new Date(2026, 9, 24, 21, 50));
    const world = withButton(24);
    world.zone.motion = true;
    const night = { nightStart: "22:00", nightEnd: "06:00", nightTemp: "15" };
    await start(world, { ...COCOON, ...night });
    press(world);
    world.set("socket", "state", true);
    expect(world.state.get("hold")).toBe(true);
    const orders = world.orders.length;
    await vi.advanceTimersByTimeAsync(11 * MIN);
    expect(world.state.get("mode")).toBe("auto");
    expect(world.state.get("hold")).toBe(true);
    expect(world.orders).toHaveLength(orders);
    expect(world.stateOf()).toBe(true);
  });

  it("ending on its own keeps a manual hold: absence", async () => {
    const world = withButton(22);
    const handle = await start(world, COCOON);
    handle.onAction?.("set_mode", { mode: "cocoon" });
    await vi.advanceTimersByTimeAsync(20 * MIN);
    world.set("socket", "state", false);
    expect(world.state.get("hold")).toBe(true);
    await vi.advanceTimersByTimeAsync(11 * MIN);
    expect(world.state.get("mode")).toBe("auto");
    expect(world.state.get("hold")).toBe(true);
    await vi.advanceTimersByTimeAsync(20 * MIN);
    expect(world.state.get("hold")).toBeUndefined();
  });

  it("a restart across the night start ends the cocoon", async () => {
    vi.setSystemTime(new Date(2026, 9, 24, 21, 50));
    const world = withButton(22);
    world.zone.motion = true;
    const params = { ...COCOON, nightStart: "22:00", nightEnd: "06:00", nightTemp: "15" };
    const handle = await start(world, params);
    press(world);
    await vi.advanceTimersByTimeAsync(9 * MIN);
    handle.stop();
    await vi.advanceTimersByTimeAsync(3 * MIN);
    world.temp(22);
    await start(world, params);
    expect(world.state.get("mode")).toBe("auto");
    expect(world.logs.map((l) => l.message)).toContain("Fin du cocoon : début de la nuit");
  });

  it("restarts in auto when the cocoon temperature was removed", async () => {
    const world = withButton(22);
    world.zone.motion = true;
    world.state.set("mode", "cocoon");
    world.state.set("cocoonSince", new Date().toISOString());
    await start(world);
    expect(world.state.get("mode")).toBe("auto");
    expect(world.state.get("cocoonSince")).toBeUndefined();
  });

  it("refuses buttons without a cocoon temperature, and a button without action", () => {
    const world = withButton().add({
      id: "lamp",
      name: "Lampe",
      type: "light",
      data: { state: false },
      orders: [],
    });
    const validate = (p: Record<string, unknown>) => () =>
      createRecipe().validate({ ...PARAMS, ...p }, world.ctx());
    expect(validate({ buttons: ["button"] })).toThrow(/need a cocoon temperature/);
    expect(validate({ cocoonTemp: "23", buttons: ["lamp"] })).toThrow(/no "action" data/);
    expect(validate({ cocoonTemp: "26.5" })).toThrow(
      /Cocoon must be a temperature between 5 and 26/,
    );
    expect(validate({ cocoonTemp: "26" })).not.toThrow();
    expect(validate({ comfortTemp: "25" })).toThrow(/Comfort must be/);
    expect(validate({ cocoonTemp: "23" })).not.toThrow();
    expect(validate({ cocoonTemp: "", buttons: [] })).not.toThrow();
  });
});

describe("the room's temperature (spec 003)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 24, 12, 0));
  });
  afterEach(() => vi.useRealTimers());

  it("averages the room's sensors, its sub-zones included", async () => {
    const world = office(19).sensor(20, "s2").sensor(21, "s3", "desk");
    world.childZones.push("desk");
    world.zone.motion = true;
    await start(world);
    expect(world.state.get("summary")).toMatch(/^Confort 20° · 20°/);
  });

  it("ignores the other zones and the sockets' own temperature", async () => {
    const world = new FakeWorld()
      .sensor(19)
      .sensor(30, "kitchen", "kitchen")
      .socket("socket", { temperature: 45 });
    world.zone.motion = true;
    await start(world);
    expect(world.state.get("summary")).toMatch(/^Confort 20° · 19°/);
  });

  it("follows a reading of any sensor of the room", async () => {
    const world = office(19).sensor(19, "s2");
    world.zone.motion = true;
    await start(world);
    await vi.advanceTimersByTimeAsync(5 * MIN);
    world.temp(21, "s2");
    await flush();
    expect(world.state.get("summary")).toMatch(/· 20°/);
  });

  it("drops a sensor gone quiet from the average", async () => {
    const world = office(19).sensor(23, "s2");
    world.zone.motion = true;
    await start(world);
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(10 * MIN);
      world.temp(19);
    }
    await flush();
    expect(world.state.get("summary")).toMatch(/· 19°/);
    expect(world.state.get("alert")).toBeUndefined();
  });
});
