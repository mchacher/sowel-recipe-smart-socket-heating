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
    control.apply("on", true, read(), Date.now());
    await flush();
    control.apply("on", true, read(), Date.now());
    await flush();
    expect(world.logs).toHaveLength(1);
    expect(world.logs[0].level).toBe("error");
  });

  it("tells someone else's switch from its own (FR8)", async () => {
    const world = new FakeWorld().socket();
    const { control, read } = setup(world);
    control.apply("on", false, read(), Date.now());
    expect(control.observe("socket", true)).toBe(false);
    expect(control.observe("socket", false)).toBe(true);
    expect(control.observe("socket", null)).toBe(false);
  });

  it("adopts a socket that was offline at start", () => {
    const world = new FakeWorld().socket("socket", { state: null });
    const { control } = setup(world);
    expect(control.observe("socket", true)).toBe(false);
    expect(control.observe("socket", false)).toBe(true);
  });
});
