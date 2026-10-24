import { describe, expect, it } from "vitest";
import { decide, inWindow, type Snapshot } from "./decide.js";

const MIN = 60_000;
const NOON = new Date(2026, 9, 24, 12, 0);

function snap(over: Partial<Snapshot> = {}): Snapshot {
  const now = over.now ?? NOON;
  return {
    now,
    mode: "auto",
    occupied: true,
    hold: false,
    temperature: 19,
    temperatureAt: now.getTime() - 5 * MIN,
    setpoints: { comfortTemp: 20, ecoTemp: 17, night: null, cocoonTemp: null },
    ...over,
  };
}

const NIGHT = { start: "22:00", end: "06:00", temp: 15 };

describe("decide — regulation (FR3, FR4)", () => {
  it("heats when occupied at setpoint − 0.2", () => {
    expect(decide(snap({ temperature: 19.8 }))).toEqual({
      status: "comfort",
      setpoint: 20,
      want: "on",
      immediate: false,
    });
    expect(decide(snap({ temperature: 19.7 })).want).toBe("on");
  });

  it("cuts at setpoint + 0.2", () => {
    expect(decide(snap({ temperature: 20.2 })).want).toBe("off");
  });

  it("leaves the sockets inside the band", () => {
    expect(decide(snap({ temperature: 20 })).want).toBe("leave");
    expect(decide(snap({ temperature: 19.9 })).want).toBe("leave");
    expect(decide(snap({ temperature: 20.1 })).want).toBe("leave");
  });

  it("holds eco when the room is empty", () => {
    const d = decide(snap({ occupied: false, temperature: 18 }));
    expect(d).toMatchObject({ status: "eco", setpoint: 17, want: "off" });
  });

  it("holds the night setpoint over the window whatever the presence", () => {
    const now = new Date(2026, 9, 24, 23, 30);
    const d = decide(
      snap({ now, setpoints: { comfortTemp: 20, ecoTemp: 17, night: NIGHT, cocoonTemp: null } }),
    );
    expect(d).toMatchObject({ status: "night", setpoint: 15 });
  });

  it("never uses night when none is configured", () => {
    const now = new Date(2026, 9, 24, 23, 30);
    expect(decide(snap({ now })).status).toBe("comfort");
  });

  it("forced comfort wins over the night window and the absence", () => {
    const now = new Date(2026, 9, 24, 23, 30);
    const d = decide(
      snap({
        now,
        mode: "comfort",
        occupied: false,
        setpoints: { comfortTemp: 20, ecoTemp: 17, night: NIGHT, cocoonTemp: null },
      }),
    );
    expect(d).toMatchObject({ status: "comfort", setpoint: 20 });
  });

  it("forced eco ignores presence", () => {
    expect(decide(snap({ mode: "eco" }))).toMatchObject({ status: "eco", setpoint: 17 });
  });
});

describe("decide — off, hold and safety (FR2, FR6, FR7, FR9)", () => {
  it("mode off cuts at once", () => {
    expect(decide(snap({ mode: "off" }))).toEqual({
      status: "off",
      setpoint: null,
      want: "off",
      immediate: true,
    });
  });

  it("cuts at 25 °C in every mode, a manual hold included", () => {
    for (const s of [
      snap({ temperature: 25 }),
      snap({ temperature: 25.3, mode: "comfort" }),
      snap({ temperature: 25, hold: true }),
      snap({ temperature: 26, mode: "off" }),
    ]) {
      expect(decide(s)).toMatchObject({ status: "safety", want: "off", immediate: true });
    }
  });

  it("leaves the sockets alone during a manual hold", () => {
    expect(decide(snap({ hold: true, temperature: 18 }))).toMatchObject({
      status: "manual",
      want: "leave",
    });
  });

  it("cuts on a silent sensor: no value, or no report for 90 min", () => {
    expect(decide(snap({ temperature: null }))).toMatchObject({ status: "silent", want: "off" });
    expect(decide(snap({ temperatureAt: null }))).toMatchObject({ status: "silent" });
    expect(decide(snap({ temperatureAt: NOON.getTime() - 91 * MIN }))).toMatchObject({
      status: "silent",
      immediate: true,
    });
  });

  it("still regulates on a report 89 min old", () => {
    expect(decide(snap({ temperatureAt: NOON.getTime() - 89 * MIN })).status).toBe("comfort");
  });
});

describe("inWindow", () => {
  it("handles a window crossing midnight", () => {
    expect(inWindow(new Date(2026, 9, 24, 5, 59), "22:00", "06:00")).toBe(true);
    expect(inWindow(new Date(2026, 9, 24, 6, 0), "22:00", "06:00")).toBe(false);
    expect(inWindow(new Date(2026, 9, 24, 22, 0), "22:00", "06:00")).toBe(true);
    expect(inWindow(new Date(2026, 9, 24, 21, 59), "22:00", "06:00")).toBe(false);
  });

  it("handles a window within the day", () => {
    expect(inWindow(new Date(2026, 9, 24, 13, 0), "12:00", "14:00")).toBe(true);
    expect(inWindow(new Date(2026, 9, 24, 14, 0), "12:00", "14:00")).toBe(false);
  });
});

describe("decide — the hottest reading (spec 003)", () => {
  it("cuts when one reading of the room reaches 25 °C, whatever the average", () => {
    expect(decide(snap({ temperature: 24, hottest: 26 }))).toMatchObject({ status: "safety" });
    expect(decide(snap({ temperature: 19.5, hottest: 24.9 })).status).toBe("comfort");
  });
});

describe("decide — cocoon (spec 002 FR2)", () => {
  const sp = { comfortTemp: 20, ecoTemp: 17, night: NIGHT, cocoonTemp: 23 };

  it("regulates around the cocoon setpoint", () => {
    expect(decide(snap({ mode: "cocoon", temperature: 22.7, setpoints: sp }))).toEqual({
      status: "cocoon",
      setpoint: 23,
      want: "on",
      immediate: false,
    });
  });

  it("wins over the night window", () => {
    const now = new Date(2026, 9, 24, 23, 30);
    expect(decide(snap({ now, mode: "cocoon", setpoints: sp }))).toMatchObject({
      status: "cocoon",
      setpoint: 23,
    });
  });

  it("regulates as auto without a cocoon temperature", () => {
    const d = decide(snap({ mode: "cocoon", setpoints: { ...sp, cocoonTemp: null } }));
    expect(d).toMatchObject({ status: "comfort", setpoint: 20 });
  });

  it("still yields to a manual hold and to safety", () => {
    expect(decide(snap({ mode: "cocoon", hold: true, setpoints: sp })).status).toBe("manual");
    expect(decide(snap({ mode: "cocoon", temperature: 25, setpoints: sp })).status).toBe("safety");
  });
});
