/**
 * Spec 001, 003 — reads the zone's temperature and the sockets by contract alias.
 */

import { SILENT_MS } from "./decide.js";
import { DRAWING_W, type Heat } from "./summary.js";
import type { DataBindingValue, EquipmentManager } from "./sowel-types.js";

export interface SensorView {
  /** Average of the zone's live readings; null when none is live. */
  temperature: number | null;
  /** Epoch ms of the latest of those readings (reported, changed or not). */
  at: number | null;
  /** The hottest live reading: the safety cut looks at it, not at the average. */
  hottest: number | null;
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

/**
 * Spec 003 — the equipments of these zones that read a `temperature`, every
 * socket excepted: a plug's own device temperature is not the room's.
 */
export function temperatureSources(
  em: EquipmentManager,
  zoneIds: string[],
  exclude: string[],
): string[] {
  return zoneIds
    .flatMap((z) => em.getByZone(z))
    .filter((e) => e.type !== "switch" && !exclude.includes(e.id))
    .filter((e) => binding(em.getDataBindingsWithValues(e.id), "temperature") !== undefined)
    .map((e) => e.id);
}

/**
 * Spec 003 FR2 — the room's temperature: the average of its sources' readings
 * reported within the silent delay. A source gone quiet drops out instead of
 * holding the average on its last value; none left is a silent sensor (FR7).
 */
export function readZoneTemperature(em: EquipmentManager, ids: string[], now: number): SensorView {
  const live: { value: number; at: number }[] = [];
  for (const id of ids) {
    const b = binding(em.getDataBindingsWithValues(id), "temperature");
    const value = num(b?.value);
    const at = parseInstant(b?.lastUpdated);
    if (value !== null && at !== null && now - at < SILENT_MS) live.push({ value, at });
  }
  if (live.length === 0) return { temperature: null, at: null, hottest: null };
  const sum = live.reduce((s, r) => s + r.value, 0);
  return {
    temperature: Math.round((sum / live.length) * 100) / 100,
    at: Math.max(...live.map((r) => r.at)),
    hottest: Math.max(...live.map((r) => r.value)),
  };
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
