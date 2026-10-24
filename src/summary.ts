/**
 * Spec 001 FR11 — the tile's one-line status, in French like the owner's
 * other recipes. Pure.
 */

import type { Decision } from "./decide.js";

/** What the sockets do: drawing power, on but drawing nothing, or off. */
export type Heat = "heating" | "idle" | "off";

/** Above this a socket counts as feeding a radiator that heats. */
export const DRAWING_W = 10;

const LABELS = { comfort: "Confort", eco: "Eco", night: "Nuit" } as const;

/** 19.4 → "19,4°", 20 → "20°". */
export function degrees(v: number): string {
  const rounded = Math.round(v * 10) / 10;
  return `${String(rounded).replace(".", ",")}°`;
}

export function summaryOf(d: Decision, temperature: number | null, heat: Heat): string {
  const t = temperature === null ? "?" : degrees(temperature);
  switch (d.status) {
    case "safety":
      return `Sécurité · ${t}`;
    case "off":
      return "Arrêt";
    case "manual":
      return `Manuel · ${t}`;
    case "silent":
      return "Capteur muet";
    default: {
      const base = `${LABELS[d.status]} ${degrees(d.setpoint ?? 0)} · ${t}`;
      if (heat === "heating") return `${base} · chauffe`;
      if (heat === "idle") return `${base} · radiateur au repos`;
      return base;
    }
  }
}
