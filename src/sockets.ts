/**
 * Spec 001 FR4, FR5, FR8, FR12 — switching the sockets.
 *
 * For each socket the recipe keeps the state it expects: the last value it
 * ordered, or the reading it found. A reading that moves away from it is
 * someone else's switch (FR8).
 */

import { MIN_CYCLE_MS } from "./decide.js";
import type { SocketView } from "./inputs.js";
import type { RecipeContext } from "./sowel-types.js";

export class SocketControl {
  private readonly expected = new Map<string, boolean | null>();
  private readonly lastSwitchAt = new Map<string, number>();
  /** Sockets whose last order failed: logged once until one succeeds. */
  private readonly failing = new Set<string>();
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly ctx: RecipeContext,
    private readonly names: Map<string, string>,
  ) {}

  /** At start: what each socket reads is what the recipe expects. */
  init(sockets: SocketView[]): void {
    for (const s of sockets) this.expected.set(s.id, s.state);
  }

  /**
   * FR8 — a new reading. True when it is someone else's switch; the reading
   * becomes the expected state either way. An unknown reading is ignored, and
   * a socket first seen now (offline at start) is adopted, not held.
   */
  observe(id: string, state: boolean | null): boolean {
    if (state === null) return false;
    const expected = this.expected.get(id) ?? null;
    this.expected.set(id, state);
    return expected !== null && expected !== state;
  }

  /**
   * Bring every socket to `want`. Not `immediate`: a socket the recipe
   * switched less than the minimum cycle ago waits. Returns the sockets an
   * order went to.
   */
  apply(want: "on" | "off", immediate: boolean, sockets: SocketView[], now: number): string[] {
    const target = want === "on";
    const sent: string[] = [];
    for (const s of sockets) {
      if (s.state === target) continue;
      if (this.inFlight.has(s.id)) continue;
      const last = this.lastSwitchAt.get(s.id);
      if (!immediate && last !== undefined && now - last < MIN_CYCLE_MS) continue;
      this.expected.set(s.id, target);
      this.lastSwitchAt.set(s.id, now);
      sent.push(s.id);
      void this.send(s.id, target);
    }
    return sent;
  }

  private async send(id: string, on: boolean): Promise<void> {
    this.inFlight.add(id);
    const name = this.names.get(id) ?? id;
    try {
      const r = await this.ctx.dispatchOrder(id, "state", this.orderValue(id, on));
      if (r.success) {
        this.failing.delete(id);
      } else {
        this.fail(id, `Commande de ${name} refusée : ${r.error ?? "erreur inconnue"}`);
      }
    } catch (err) {
      this.fail(id, `Commande de ${name} impossible : ${(err as Error).message ?? String(err)}`);
    } finally {
      this.inFlight.delete(id);
    }
  }

  private fail(id: string, message: string): void {
    // A failed order did not switch anything: the next evaluation retries it.
    this.lastSwitchAt.delete(id);
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
