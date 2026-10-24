/**
 * Sowel recipe: smart-socket-heating (spec 001)
 *
 * Smart sockets feeding radiators, switched on/off from a temperature sensor
 * around a setpoint that follows the zone's presence: comfort while someone
 * is there, eco after an absence, an optional night setpoint. Cuts at 25 °C
 * and on a silent sensor; stands back when someone else switches a socket.
 */

import { decide, isMode, SILENT_MS, type Decision, type Mode, type Setpoints } from "./decide.js";
import { ACTIONS, DESCRIPTION, I18N, NAME, SLOTS } from "./i18n.js";
import { heatOf, parseInstant, parseOn, readSensor, readSocket } from "./inputs.js";
import { emptyAt, holdEnded, isOccupied } from "./presence.js";
import { SocketControl } from "./sockets.js";
import { degrees, summaryOf } from "./summary.js";
import type {
  DataChangedEvent,
  RecipeContext,
  RecipeDefinition,
  RecipeInstanceHandle,
  ZoneChangedEvent,
} from "./sowel-types.js";

export const RECIPE_ID = "smart-socket-heating";
export const TICK_MS = 60_000;
export const ALERT_SILENT = "Capteur de température muet";
/** While motion lasts, its time is persisted at most this often. */
export const MOTION_PERSIST_MS = 5 * 60_000;

const TEMP_MIN = 5;
const TEMP_MAX = 24;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface Params {
  zoneId: string;
  sensorId: string;
  heaterIds: string[];
  timeoutMs: number;
  setpoints: Setpoints;
}

function present(v: unknown): boolean {
  return v !== undefined && v !== null && v !== "";
}

function numParam(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** "30m", "90s", "1h", or milliseconds — the core's duration slot format. */
export function parseDuration(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : null;
  if (typeof v !== "string") return null;
  const m = v.trim().match(/^(\d+)\s*(s|m|h)$/);
  if (!m) return null;
  const n = parseInt(m[1], 10) * { s: 1_000, m: 60_000, h: 3_600_000 }[m[2] as "s" | "m" | "h"];
  return n > 0 ? n : null;
}

function idList(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && x !== "");
  return typeof v === "string" && v !== "" ? [v] : [];
}

export function readParams(p: Record<string, unknown>): Params {
  const nightTemp = numParam(p.nightTemp);
  const night =
    present(p.nightStart) && present(p.nightEnd) && nightTemp !== null
      ? { start: String(p.nightStart), end: String(p.nightEnd), temp: nightTemp }
      : null;
  return {
    zoneId: String(p.zone ?? ""),
    sensorId: String(p.temperatureSensor ?? ""),
    heaterIds: idList(p.heaters),
    timeoutMs: parseDuration(p.timeout) ?? 30 * 60_000,
    setpoints: {
      comfortTemp: numParam(p.comfortTemp) ?? 20,
      ecoTemp: numParam(p.ecoTemp) ?? 17,
      night,
    },
  };
}

function checkTemp(label: string, v: unknown): number {
  const n = numParam(v);
  if (n === null || n < TEMP_MIN || n > TEMP_MAX)
    throw new Error(`${label} must be a temperature between ${TEMP_MIN} and ${TEMP_MAX} °C`);
  return n;
}

export function validateParams(p: Record<string, unknown>, ctx: RecipeContext): void {
  const em = ctx.equipmentManager;
  if (!present(p.zone)) throw new Error("A zone is required");

  const sensor = em.getById(String(p.temperatureSensor ?? ""));
  if (!sensor) throw new Error("Temperature sensor not found");
  if (!em.getDataBindingsWithValues(sensor.id).some((b) => b.alias === "temperature"))
    throw new Error(`"${sensor.name}" has no temperature`);

  const heaterIds = idList(p.heaters);
  if (heaterIds.length === 0) throw new Error("At least one heater is required");
  for (const id of heaterIds) {
    const eq = em.getById(id);
    if (!eq) throw new Error(`Heater ${id} not found`);
    if (eq.type !== "switch") throw new Error(`"${eq.name}" is not a switch`);
    if (!em.getOrderBindingsWithDetails(id).some((o) => o.alias === "state"))
      throw new Error(`"${eq.name}" has no "state" order`);
  }

  const comfort = checkTemp("Comfort", p.comfortTemp);
  const eco = checkTemp("Eco", p.ecoTemp);
  if (eco > comfort) throw new Error("Eco must not be above comfort");
  if (parseDuration(p.timeout) === null) throw new Error('Absence delay must be like "30m"');

  const night = [p.nightStart, p.nightEnd, p.nightTemp].filter(present).length;
  if (night !== 0 && night !== 3)
    throw new Error(
      "Night start, night end and night temperature go together: set all three or none",
    );
  if (night === 3) {
    for (const t of [p.nightStart, p.nightEnd])
      if (!TIME_RE.test(String(t))) throw new Error(`Invalid night time "${String(t)}" (HH:MM)`);
    if (p.nightStart === p.nightEnd) throw new Error("Night start and end must differ");
    checkTemp("Night", p.nightTemp);
  }
}

function minutes(ms: number): string {
  return ms >= 3_600_000 && ms % 3_600_000 === 0
    ? `${ms / 3_600_000} h`
    : `${Math.round(ms / 60_000)} min`;
}

const MODE_LABELS: Record<Mode, string> = {
  auto: "auto",
  comfort: "confort",
  eco: "eco",
  off: "arrêt",
};

const SETPOINT_LABELS = { comfort: "confort", eco: "eco", night: "nuit" } as const;

class Instance implements RecipeInstanceHandle {
  private mode: Mode;
  private hold: boolean;
  private holdSince: number;
  private motion: boolean;
  private lastMotionAt: number | null;
  private silent = false;
  private lastDecisionKey = "";
  private persistedMotionAt = 0;
  private stopped = false;
  private readonly sockets: SocketControl;
  private readonly names = new Map<string, string>();
  private readonly unsubs: (() => void)[] = [];
  private readonly tick: ReturnType<typeof setInterval>;

  constructor(
    private readonly p: Params,
    private readonly ctx: RecipeContext,
  ) {
    const em = ctx.equipmentManager;
    for (const id of [p.sensorId, ...p.heaterIds]) this.names.set(id, em.getById(id)?.name ?? id);

    const saved = ctx.state.get("mode");
    this.mode = isMode(saved) ? saved : "auto";
    // The control renders only while its state key holds a value.
    ctx.state.set("mode", this.mode);

    this.hold = ctx.state.get("hold") === true;
    this.holdSince = parseInstant(ctx.state.get("holdSince")) ?? Date.now();
    this.lastMotionAt = parseInstant(ctx.state.get("lastMotionAt"));

    const zone = ctx.zoneAggregator.getByZoneId(p.zoneId);
    this.motion = zone?.motion ?? false;
    if (zone && zone.motionSensors === 0)
      ctx.log(
        "La zone n'a aucun détecteur de mouvement : la pièce est toujours considérée vide",
        "warn",
      );

    this.sockets = new SocketControl(ctx, this.names);
    this.sockets.init(p.heaterIds.map((id) => readSocket(em, id)));

    this.unsubs.push(
      ctx.eventBus.onType("zone.data.changed", (e) =>
        this.guard(() => this.onZone(e as ZoneChangedEvent)),
      ),
      ctx.eventBus.onType("equipment.data.changed", (e) =>
        this.guard(() => this.onData(e as DataChangedEvent)),
      ),
    );
    this.tick = setInterval(() => this.guard(() => this.evaluate()), TICK_MS);
    this.guard(() => this.evaluate());
  }

  stop(): void {
    // FR1 — a core restarting mid-presence keeps the room occupied for `timeout`.
    if (!this.stopped && this.motion) this.persistLastMotion(Date.now());
    this.stopped = true;
    this.sockets.stop();
    clearInterval(this.tick);
    for (const u of this.unsubs) u();
    this.unsubs.length = 0;
  }

  onAction(action: string, payload?: Record<string, unknown>): void {
    this.guard(() => {
      if (action !== "set_mode") return;
      const mode = payload?.mode;
      if (!isMode(mode)) return;
      this.mode = mode;
      this.ctx.state.set("mode", mode);
      if (this.hold) this.endHold();
      this.ctx.log(`Mode ${MODE_LABELS[mode]} choisi`);
      this.lastDecisionKey = "";
      this.evaluate();
    });
  }

  /** Handlers and timers never throw (CLAUDE.md). */
  private guard(fn: () => void): void {
    if (this.stopped) return;
    try {
      fn();
    } catch (err) {
      this.ctx.logger.error({ err }, "smart-socket-heating evaluation failed");
    }
  }

  private onZone(e: ZoneChangedEvent): void {
    if (e.zoneId !== this.p.zoneId) return;
    const motion = e.aggregatedData?.motion ?? false;
    if (motion === this.motion) return;
    // FR1 — the room stays occupied for `timeout` from the end of motion; a restart keeps it.
    this.persistLastMotion(Date.now());
    this.motion = motion;
    this.evaluate();
  }

  private persistLastMotion(at: number): void {
    this.lastMotionAt = at;
    this.persistedMotionAt = at;
    this.ctx.state.set("lastMotionAt", new Date(at).toISOString());
  }

  private onData(e: DataChangedEvent): void {
    if (e.equipmentId === this.p.sensorId && e.alias === "temperature") {
      this.evaluate();
      return;
    }
    if (!this.p.heaterIds.includes(e.equipmentId)) return;
    if (e.alias === "state") {
      const manual = this.sockets.observe(e.equipmentId, parseOn(e.value), parseOn(e.previous));
      if (manual && !this.hold) {
        this.startHold(e.equipmentId);
      }
      this.evaluate();
    } else if (e.alias === "power") {
      this.evaluate();
    }
  }

  private startHold(id: string): void {
    this.hold = true;
    this.holdSince = Date.now();
    this.ctx.state.set("hold", true);
    this.ctx.state.set("holdSince", new Date(this.holdSince).toISOString());
    this.ctx.log(
      `${this.names.get(id) ?? id} basculée à la main : la recette s'efface jusqu'à la prochaine absence`,
    );
  }

  private endHold(reason?: string): void {
    this.hold = false;
    this.ctx.state.delete("hold");
    this.ctx.state.delete("holdSince");
    if (reason) this.ctx.log(reason);
  }

  private evaluate(): void {
    const now = Date.now();
    const { timeoutMs } = this.p;
    if (this.motion) {
      this.lastMotionAt = now;
      // Also written while motion lasts, so a crash (no stop()) loses little.
      if (now - this.persistedMotionAt >= MOTION_PERSIST_MS) this.persistLastMotion(now);
    }

    if (this.hold && holdEnded(this.motion, this.holdSince, this.lastMotionAt, now, timeoutMs)) {
      this.endHold(`Pièce vide depuis ${minutes(timeoutMs)} : la recette reprend la main`);
    }

    const em = this.ctx.equipmentManager;
    const sensor = readSensor(em, this.p.sensorId);
    const occupied = isOccupied(this.motion, this.lastMotionAt, now, timeoutMs);
    const d = decide({
      now: new Date(now),
      mode: this.mode,
      occupied,
      hold: this.hold,
      temperature: sensor.temperature,
      temperatureAt: sensor.at,
      setpoints: this.p.setpoints,
    });

    const silent =
      sensor.temperature === null || sensor.at === null || now - sensor.at >= SILENT_MS;
    // FR7 — a hold cuts nothing on a silent sensor: no alert raised then, only cleared.
    if (d.status !== "manual" || !silent) this.trackSensor(silent);
    this.logDecision(d, occupied, sensor.temperature);

    // The summary follows the readings; a switch shows once the socket reports it.
    const sockets = this.p.heaterIds.map((id) => readSocket(em, id));
    if (d.want !== "leave") {
      const t = sensor.temperature === null ? "" : ` à ${degrees(sensor.temperature)}`;
      const sp = d.setpoint === null ? "" : ` (consigne ${degrees(d.setpoint)})`;
      this.sockets.apply(d.want, d.immediate, sockets, now, `${t}${sp}`);
    }

    this.setState("summary", summaryOf(d, sensor.temperature, heatOf(sockets)));
    // Counts down only where presence sets the setpoint: auto, outside the night window.
    const until = emptyAt(this.lastMotionAt, timeoutMs);
    const counting =
      this.mode === "auto" && d.status === "comfort" && !this.motion && occupied && until !== null;
    this.setState("timerExpiresAt", counting ? new Date(until).toISOString() : null);
  }

  /** FR7 — `alert` follows the sensor, one log line per edge. */
  private trackSensor(silent: boolean): void {
    if (silent === this.silent) return;
    this.silent = silent;
    const name = this.names.get(this.p.sensorId) ?? this.p.sensorId;
    if (silent) {
      this.ctx.state.set("alert", ALERT_SILENT);
      this.ctx.log(
        `${name} muet depuis ${minutes(SILENT_MS)} ou sans valeur : chauffage coupé`,
        "warn",
      );
    } else {
      this.ctx.state.delete("alert");
      this.ctx.log(`${name} de nouveau disponible`);
    }
  }

  private logDecision(d: Decision, occupied: boolean, t: number | null): void {
    const key = `${d.status}|${d.setpoint}`;
    if (key === this.lastDecisionKey) return;
    this.lastDecisionKey = key;
    switch (d.status) {
      case "safety":
        this.ctx.log(
          `Sécurité : ${t === null ? "?" : degrees(t)} atteint, chauffage coupé`,
          "warn",
        );
        return;
      case "off":
        this.ctx.log("Mode arrêt : chauffage coupé");
        return;
      case "manual":
      case "silent":
        // Logged where they start (startHold, trackSensor).
        return;
      default: {
        const why =
          this.mode !== "auto"
            ? "mode forcé"
            : d.status === "night"
              ? "plage de nuit"
              : occupied
                ? "présence"
                : "absence";
        this.ctx.log(`Consigne ${SETPOINT_LABELS[d.status]} ${degrees(d.setpoint ?? 0)} (${why})`);
      }
    }
  }

  private setState(key: string, value: string | null): void {
    const current = this.ctx.state.get(key);
    if (value === null) {
      if (current !== null && current !== undefined) this.ctx.state.delete(key);
    } else if (current !== value) {
      this.ctx.state.set(key, value);
    }
  }
}

export function createRecipe(): RecipeDefinition {
  return {
    id: RECIPE_ID,
    name: NAME,
    description: DESCRIPTION,
    slots: SLOTS,
    actions: ACTIONS,
    tile: { icon: "Flame", actions: ["set_mode"] },
    i18n: I18N,
    validate(params, ctx) {
      validateParams(params, ctx);
    },
    createInstance(params, ctx) {
      return new Instance(readParams(params), ctx);
    },
  };
}
