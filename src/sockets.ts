/**
 * Spec 001 FR4, FR5, FR8, FR12 — switching the sockets.
 *
 * For each socket the recipe keeps the state it expects: the last value it
 * ordered, or the reading it found. A reading that really changes to another
 * value is someone else's switch (FR8). The core relays every report, changed
 * or not (a power report carries the relay state too), so an unchanged
 * report never counts.
 */

import { MIN_CYCLE_MS } from "./decide.js";
import type { SocketView } from "./inputs.js";
import type { RecipeContext } from "./sowel-types.js";

/** The same order is not sent again to a socket within this delay. */
export const RETRY_MS = 60_000;

export class SocketControl {
  private readonly expected = new Map<string, boolean | null>();
  /** When the recipe last switched each socket: the minimum cycle runs from here. */
  private readonly lastSwitchAt = new Map<string, number>();
  private readonly lastAttempt = new Map<string, { at: number; on: boolean }>();
  /** Sockets whose last order failed: logged once until one succeeds. */
  private readonly failing = new Set<string>();
  private readonly inFlight = new Set<string>();
  private stopped = false;

  constructor(
    private readonly ctx: RecipeContext,
    private readonly names: Map<string, string>,
  ) {}

  /** At start: what each socket reads is what the recipe expects. */
  init(sockets: SocketView[]): void {
    for (const s of sockets) this.expected.set(s.id, s.state);
  }

  /** Results of orders still in flight are dropped after this. */
  stop(): void {
    this.stopped = true;
  }

  /**
   * FR8 — a report. True when it is someone else's switch: the reading really
   * changed, to a value the recipe does not expect. An unknown reading is
   * ignored, and a socket first seen now (offline at start) is adopted.
   */
  observe(id: string, state: boolean | null, previous: boolean | null): boolean {
    if (state === null || state === previous) return false;
    const expected = this.expected.get(id) ?? null;
    this.expected.set(id, state);
    return expected !== null && expected !== state;
  }

  /**
   * Bring every socket to `want`. Not `immediate`: a socket the recipe
   * switched less than the minimum cycle ago waits. `note` ends the log line
   * written once the order succeeds. Returns the sockets an order went to.
   */
  apply(
    want: "on" | "off",
    immediate: boolean,
    sockets: SocketView[],
    now: number,
    note = "",
  ): string[] {
    const target = want === "on";
    const sent: string[] = [];
    for (const s of sockets) {
      if (s.state === target || this.inFlight.has(s.id)) continue;
      const attempt = this.lastAttempt.get(s.id);
      if (attempt && attempt.on === target && now - attempt.at < RETRY_MS) continue;
      const last = this.lastSwitchAt.get(s.id);
      if (!immediate && last !== undefined && now - last < MIN_CYCLE_MS) continue;
      const before = this.expected.get(s.id) ?? null;
      this.expected.set(s.id, target);
      this.lastSwitchAt.set(s.id, now);
      this.lastAttempt.set(s.id, { at: now, on: target });
      sent.push(s.id);
      void this.send(s.id, target, before, note);
    }
    return sent;
  }

  private async send(id: string, on: boolean, before: boolean | null, note: string): Promise<void> {
    this.inFlight.add(id);
    const name = this.names.get(id) ?? id;
    try {
      const r = await this.ctx.dispatchOrder(id, "state", this.orderValue(id, on));
      if (this.stopped) return;
      if (r.success) {
        this.failing.delete(id);
        this.ctx.log(`${on ? "Chauffage allumé" : "Chauffage coupé"} (${name})${note}`);
      } else {
        this.fail(id, on, before, `Commande de ${name} refusée : ${r.error ?? "erreur inconnue"}`);
      }
    } catch (err) {
      if (this.stopped) return;
      const reason = err instanceof Error ? err.message : String(err);
      this.fail(id, on, before, `Commande de ${name} impossible : ${reason}`);
    } finally {
      this.inFlight.delete(id);
    }
  }

  /** A failed order switched nothing: expect the old state again and retry later. */
  private fail(id: string, on: boolean, before: boolean | null, message: string): void {
    this.lastSwitchAt.delete(id);
    if (this.expected.get(id) === on) this.expected.set(id, before);
    if (this.failing.has(id)) return;
    this.failing.add(id);
    this.ctx.log(message, "error");
  }

  /** The order's own `ON` / `OFF` spelling when it is an enum, a boolean otherwise. */
  private orderValue(id: string, on: boolean): unknown {
    const order = this.ctx.equipmentManager
      .getOrderBindingsWithDetails(id)
      .find((o) => o.alias === "state");
    const match = order?.enumValues?.find((v) => v.toLowerCase() === (on ? "on" : "off"));
    return match ?? on;
  }
}
