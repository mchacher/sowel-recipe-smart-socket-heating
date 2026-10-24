/**
 * Spec 001 — reads the sensor and the sockets by contract alias.
 */

import { DRAWING_W, type Heat } from "./summary.js";
import type { DataBindingValue, EquipmentManager } from "./sowel-types.js";

export interface SensorView {
  temperature: number | null;
  /** Epoch ms of the last report (changed or not). */
  at: number | null;
}

export interface SocketView {
  id: string;
  state: boolean | null;
  power: number | null;
  hasPower: boolean;
}

/** A relay reading: booleans, `ON`/`OFF` in any case, 1/0. Anything else is unknown. */
export function parseOn(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1 ? true : v === 0 ? false : null;
  if (typeof v === "string") {
    const s = v.toLowerCase();
    if (s === "on" || s === "true") return true;
    if (s === "off" || s === "false") return false;
  }
  return null;
}

function num(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** The core's `lastUpdated` is `YYYY-MM-DD HH:MM:SSZ`; ISO with a `T` parses everywhere. */
export function parseInstant(v: unknown): number | null {
  if (typeof v !== "string" || v === "") return null;
  const ms = Date.parse(v.replace(" ", "T"));
  return Number.isFinite(ms) ? ms : null;
}

function binding(bindings: DataBindingValue[], alias: string): DataBindingValue | undefined {
  return bindings.find((b) => b.alias === alias);
}

export function readSensor(em: EquipmentManager, id: string): SensorView {
  const b = binding(em.getDataBindingsWithValues(id), "temperature");
  const temperature = num(b?.value);
  return { temperature, at: temperature === null ? null : parseInstant(b?.lastUpdated) };
}

export function readSocket(em: EquipmentManager, id: string): SocketView {
  const bindings = em.getDataBindingsWithValues(id);
  const power = binding(bindings, "power");
  return {
    id,
    state: parseOn(binding(bindings, "state")?.value),
    power: num(power?.value),
    hasPower: power !== undefined,
  };
}

/**
 * FR11 — heating when a socket that is on draws power (or cannot tell: no
 * `power` binding or no reading yet); idle when every socket that is on draws
 * nothing — the radiator's own thermostat has cut.
 */
export function heatOf(sockets: SocketView[]): Heat {
  const on = sockets.filter((s) => s.state === true);
  if (on.length === 0) return "off";
  return on.some((s) => !s.hasPower || s.power === null || s.power > DRAWING_W)
    ? "heating"
    : "idle";
}
