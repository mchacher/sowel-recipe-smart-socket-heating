import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readSocket } from "./inputs.js";
import { SocketControl } from "./sockets.js";
import { FakeWorld, flush } from "./testing/ctx.testing.js";

const MIN = 60_000;

function setup(world: FakeWorld) {
  const ctx = world.ctx();
  const control = new SocketControl(ctx, new Map([["socket", "Radiateur Bureau"]]));
  const read = () => [readSocket(ctx.equipmentManager, "socket")];
  control.init(read());
  return { control, read };
}

describe("SocketControl (FR4, FR5, FR12)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 24, 12, 0));
  });
  afterEach(() => vi.useRealTimers());

  it("switches a socket never switched before at once", () => {
    const world = new FakeWorld().socket();
    const { control, read } = setup(world);
    expect(control.apply("on", false, read(), Date.now())).toEqual(["socket"]);
    expect(world.orders).toEqual([{ equipmentId: "socket", alias: "state", value: true }]);
  });

  it("waits for the minimum cycle on a regulation switch", async () => {
    const world = new FakeWorld().socket();
    const { control, read } = setup(world);
    const t0 = Date.now();
    control.apply("on", false, read(), t0);
    await flush();
    expect(control.apply("off", false, read(), t0 + 3 * MIN)).toEqual([]);
    expect(control.apply("off", false, read(), t0 + 5 * MIN)).toEqual(["socket"]);
    expect(world.orders.map((o) => o.value)).toEqual([true, false]);
  });

  it("does not wait for the minimum cycle on an immediate cut", async () => {
    const world = new FakeWorld().socket();
    const { control, read } = setup(world);
    const t0 = Date.now();
    control.apply("on", false, read(), t0);
    await flush();
    expect(control.apply("off", true, read(), t0 + MIN)).toEqual(["socket"]);
  });

  it("sends nothing when the socket already reads the decision", () => {
    const world = new FakeWorld().socket("socket", { state: true });
    const { control, read } = setup(world);
    expect(control.apply("on", false, read(), Date.now())).toEqual([]);
    expect(world.orders).toEqual([]);
  });

  it("uses the order's ON / OFF spelling when it is an enum", () => {
    const world = new FakeWorld().socket("socket", { state: "OFF" }, [
      { alias: "state", enumValues: ["ON", "OFF"] },
    ]);
    const { control, read } = setup(world);
    control.apply("on", false, read(), Date.now());
    expect(world.orders[0].value).toBe("ON");
  });

  it("logs a failing order once and retries it at the next evaluation", async () => {
    const world = new FakeWorld().socket();
    world.answer = () => ({ success: false, error: "timeout" });
    const { control, read } = setup(world);
    const t0 = Date.now();
    control.apply("on", false, read(), t0);
    await flush();
    control.apply("on", false, read(), t0 + MIN);
    await flush();
    expect(world.orders).toHaveLength(2);
    expect(world.logs.filter((l) => l.level === "error")).toHaveLength(1);
    expect(world.logs[0].message).toContain("Radiateur Bureau");
  });

  it("logs a thrown dispatch once", async () => {
    const world = new FakeWorld().socket();
    world.answer = () => "throw";
    const { control, read } = setup(world);
    const t0 = Date.now();
    control.apply("on", true, read(), t0);
    await flush();
    control.apply("on", true, read(), t0 + MIN);
    await flush();
    expect(world.orders).toHaveLength(2);
    expect(world.logs).toHaveLength(1);
    expect(world.logs[0].level).toBe("error");
  });

  it("does not resend the same order within a minute, even an immediate one", async () => {
    const world = new FakeWorld().socket("socket", { state: true });
    world.answer = () => ({ success: false, error: "offline" });
    const { control, read } = setup(world);
    const t0 = Date.now();
    control.apply("off", true, read(), t0);
    await flush();
    expect(control.apply("off", true, read(), t0 + 30_000)).toEqual([]);
    expect(control.apply("off", true, read(), t0 + MIN)).toEqual(["socket"]);
  });

  it("logs a switch once the order succeeds, with its note", async () => {
    const world = new FakeWorld().socket();
    const { control, read } = setup(world);
    control.apply("on", false, read(), Date.now(), " à 19° (consigne 20°)");
    expect(world.logs).toEqual([]);
    await flush();
    expect(world.logs).toEqual([
      { message: "Chauffage allumé (Radiateur Bureau) à 19° (consigne 20°)", level: "info" },
    ]);
  });

  it("tells someone else's switch from its own (FR8)", () => {
    const world = new FakeWorld().socket();
    const { control, read } = setup(world);
    control.apply("on", false, read(), Date.now());
    expect(control.observe("socket", true, false)).toBe(false);
    expect(control.observe("socket", false, true)).toBe(true);
    expect(control.observe("socket", null, false)).toBe(false);
  });

  it("never counts an unchanged report", () => {
    const world = new FakeWorld().socket();
    const { control } = setup(world);
    expect(control.observe("socket", true, true)).toBe(false);
  });

  it("a stale report while its order is in flight is not someone else's switch", () => {
    const world = new FakeWorld().socket();
    const { control, read } = setup(world);
    control.apply("on", false, read(), Date.now());
    // A power report republishes the old relay state before the relay's own report.
    expect(control.observe("socket", false, false)).toBe(false);
    expect(control.observe("socket", true, false)).toBe(false);
  });

  it("after a failed order, expects the old state again", async () => {
    const world = new FakeWorld().socket();
    world.answer = () => ({ success: false, error: "503" });
    const { control, read } = setup(world);
    control.apply("on", false, read(), Date.now());
    await flush();
    // Someone switches it on by hand afterwards: that is theirs.
    expect(control.observe("socket", true, false)).toBe(true);
  });

  it("adopts a socket that was offline at start", () => {
    const world = new FakeWorld().socket("socket", { state: null });
    const { control } = setup(world);
    expect(control.observe("socket", true, null)).toBe(false);
    expect(control.observe("socket", false, true)).toBe(true);
  });

  it("drops the result of an order in flight at stop", async () => {
    const world = new FakeWorld().socket();
    world.answer = () => ({ success: false, error: "late" });
    const { control, read } = setup(world);
    control.apply("on", false, read(), Date.now());
    control.stop();
    await flush();
    expect(world.logs).toEqual([]);
  });
});
