/**
 * Spec 001 — the decision table (architecture.md). Pure: a snapshot in, what
 * the sockets should do out. Rules are evaluated top to bottom.
 */

/** FR4 — sockets on at setpoint − 0.2 °C, off at setpoint + 0.2 °C. */
export const HALF_HYSTERESIS = 0.2;
/** FR6 — every socket off at or above this temperature. */
export const MAX_TEMP = 25;
/** FR7 — a sensor with no report for this long is silent. */
export const SILENT_MS = 90 * 60_000;
/** FR5 — a regulation switch of a socket waits this long after the previous one. */
export const MIN_CYCLE_MS = 5 * 60_000;

export const MODES = ["auto", "comfort", "eco", "off"] as const;
export type Mode = (typeof MODES)[number];

export function isMode(v: unknown): v is Mode {
  return typeof v === "string" && (MODES as readonly string[]).includes(v);
}

export type Status = "safety" | "off" | "manual" | "silent" | "comfort" | "eco" | "night";

export interface NightWindow {
  start: string;
  end: string;
  temp: number;
}

export interface Setpoints {
  comfortTemp: number;
  ecoTemp: number;
  night: NightWindow | null;
}

export interface Snapshot {
  now: Date;
  mode: Mode;
  occupied: boolean;
  hold: boolean;
  temperature: number | null;
  /** Epoch ms of the sensor's last report; null when unknown. */
  temperatureAt: number | null;
  setpoints: Setpoints;
}

export interface Decision {
  status: Status;
  setpoint: number | null;
  want: "on" | "off" | "leave";
  /** True: act at once, the minimum cycle does not apply. */
  immediate: boolean;
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Local time in [start, end); a window whose end is not after its start crosses midnight. */
export function inWindow(now: Date, start: string, end: string): boolean {
  const m = now.getHours() * 60 + now.getMinutes();
  const s = minutesOf(start);
  const e = minutesOf(end);
  return s < e ? m >= s && m < e : m >= s || m < e;
}

/** FR3 — the setpoint for a regulating mode. */
export function setpointOf(snap: Snapshot): { status: "comfort" | "eco" | "night"; temp: number } {
  const { setpoints: sp } = snap;
  if (snap.mode === "comfort") return { status: "comfort", temp: sp.comfortTemp };
  if (snap.mode === "eco") return { status: "eco", temp: sp.ecoTemp };
  if (sp.night && inWindow(snap.now, sp.night.start, sp.night.end))
    return { status: "night", temp: sp.night.temp };
  return snap.occupied
    ? { status: "comfort", temp: sp.comfortTemp }
    : { status: "eco", temp: sp.ecoTemp };
}

export function decide(snap: Snapshot): Decision {
  const t = snap.temperature;
  if (t !== null && t >= MAX_TEMP)
    return { status: "safety", setpoint: null, want: "off", immediate: true };
  if (snap.mode === "off") return { status: "off", setpoint: null, want: "off", immediate: true };
  if (snap.hold) return { status: "manual", setpoint: null, want: "leave", immediate: false };
  if (
    t === null ||
    snap.temperatureAt === null ||
    snap.now.getTime() - snap.temperatureAt >= SILENT_MS
  )
    return { status: "silent", setpoint: null, want: "off", immediate: true };

  const { status, temp } = setpointOf(snap);
  // Rounded so that 19.8 reads as "at" 20 − 0.2 despite binary floats.
  const delta = Math.round((t - temp) * 100) / 100;
  const want = delta <= -HALF_HYSTERESIS ? "on" : delta >= HALF_HYSTERESIS ? "off" : "leave";
  return { status, setpoint: temp, want, immediate: false };
}
