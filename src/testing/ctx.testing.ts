/**
 * A fake recipe context: a temperature sensor, sockets that reflect their
 * orders, a zone with motion, an event bus, an order recorder with scripted
 * answers.
 */

import type { DispatchResult, RecipeContext } from "../sowel-types.js";

export interface FakeEquipment {
  id: string;
  name: string;
  type: string;
  zoneId: string;
  data: Record<string, unknown>;
  lastUpdated: Record<string, string | null>;
  orders: { alias: string; enumValues?: string[] }[];
}

export interface OrderCall {
  equipmentId: string;
  alias: string;
  value: unknown;
}

/** The core's spelling of `lastUpdated`. */
function coreInstant(ms: number): string {
  return new Date(ms)
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d+Z$/, "Z");
}

export class FakeWorld {
  readonly equipments = new Map<string, FakeEquipment>();
  readonly orders: OrderCall[] = [];
  readonly logs: { message: string; level: string }[] = [];
  readonly state = new Map<string, unknown>();
  readonly zone = { motion: false, motionSensors: 2 };
  /** Zones below "zone" (spec 003: their sensors count too). */
  readonly childZones: string[] = [];
  private readonly handlers = new Map<string, ((e: unknown) => void)[]>();
  /** Scripted answers: a result, "throw", or undefined for success + reflect. */
  answer: (call: OrderCall) => DispatchResult | "throw" | undefined = () => undefined;

  add(
    e: Omit<FakeEquipment, "lastUpdated" | "zoneId"> & {
      lastUpdated?: FakeEquipment["lastUpdated"];
      zoneId?: string;
    },
  ): this {
    const lastUpdated: Record<string, string | null> = {};
    for (const alias of Object.keys(e.data)) lastUpdated[alias] = coreInstant(Date.now());
    this.equipments.set(e.id, {
      ...e,
      zoneId: e.zoneId ?? "zone",
      lastUpdated: { ...lastUpdated, ...e.lastUpdated },
    });
    return this;
  }

  sensor(temperature: number | null = 19, id = "sensor", zoneId = "zone"): this {
    return this.add({
      id,
      zoneId,
      name: "THR_BUREAU",
      type: "sensor",
      data: { temperature, humidity: 50 },
      orders: [],
    });
  }

  socket(
    id = "socket",
    data: Record<string, unknown> = {},
    orders: FakeEquipment["orders"] = [{ alias: "state" }],
  ): this {
    return this.add({
      id,
      name: id === "socket" ? "Radiateur Bureau" : id,
      type: "switch",
      data: { state: false, power: 0, ...data },
      orders,
    });
  }

  /** A sensor report. */
  temp(value: number | null, id = "sensor"): void {
    this.set(id, "temperature", value);
  }

  /**
   * A report: the value and its `lastUpdated` move, and `equipment.data.changed`
   * fires whether the value changed or not — the core relays every report (a
   * Zigbee2MQTT socket republishes `state` with each power report).
   */
  set(equipmentId: string, alias: string, value: unknown): void {
    const eq = this.equipments.get(equipmentId)!;
    const previous = eq.data[alias];
    eq.data[alias] = value;
    eq.lastUpdated[alias] = coreInstant(Date.now());
    this.emit("equipment.data.changed", {
      type: "equipment.data.changed",
      equipmentId,
      alias,
      value,
      previous,
    });
  }

  motion(on: boolean): void {
    this.zone.motion = on;
    this.emit("zone.data.changed", {
      type: "zone.data.changed",
      zoneId: "zone",
      aggregatedData: { ...this.zone },
    });
  }

  emit(type: string, event: unknown): void {
    for (const h of this.handlers.get(type) ?? []) h(event);
  }

  handlerCount(): number {
    return [...this.handlers.values()].reduce((n, l) => n + l.length, 0);
  }

  stateOf(id = "socket"): unknown {
    return this.equipments.get(id)!.data.state;
  }

  ctx(): RecipeContext {
    const logger = { info() {}, warn() {}, error() {}, debug() {} };
    return {
      eventBus: {
        onType: (type, handler) => {
          const list = this.handlers.get(type) ?? [];
          list.push(handler);
          this.handlers.set(type, list);
          return () =>
            this.handlers.set(
              type,
              (this.handlers.get(type) ?? []).filter((h) => h !== handler),
            );
        },
      },
      equipmentManager: {
        getById: (id) => {
          const e = this.equipments.get(id);
          return e ? { id: e.id, name: e.name, type: e.type, zoneId: e.zoneId } : null;
        },
        getByZone: (zoneId) =>
          [...this.equipments.values()]
            .filter((e) => e.zoneId === zoneId)
            .map((e) => ({ id: e.id, name: e.name, type: e.type, zoneId: e.zoneId })),
        getDataBindingsWithValues: (id) => {
          const e = this.equipments.get(id);
          return Object.entries(e?.data ?? {}).map(([alias, value]) => ({
            alias,
            value,
            lastUpdated: e?.lastUpdated[alias] ?? null,
          }));
        },
        getOrderBindingsWithDetails: (id) => this.equipments.get(id)?.orders ?? [],
      },
      zoneManager: {
        getDescendantIds: (zoneId) => (zoneId === "zone" ? ["zone", ...this.childZones] : [zoneId]),
      },
      zoneAggregator: {
        getByZoneId: (zoneId) => (zoneId === "zone" ? { ...this.zone } : null),
      },
      logger,
      state: {
        get: (k) => this.state.get(k) ?? null,
        set: (k, v) => void this.state.set(k, v),
        delete: (k) => void this.state.delete(k),
      },
      log: (message, level = "info") => void this.logs.push({ message, level }),
      dispatchOrder: (equipmentId, alias, value) => {
        const call = { equipmentId, alias, value };
        this.orders.push(call);
        const scripted = this.answer(call);
        if (scripted === "throw") return Promise.reject(new Error("integration unavailable"));
        if (scripted && !scripted.success) return Promise.resolve(scripted);
        // The device reports the new state a moment later.
        queueMicrotask(() => this.set(equipmentId, alias, value));
        return Promise.resolve({ success: true });
      },
    };
  }
}

/** Let queued order results and device reports land. */
export async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}
