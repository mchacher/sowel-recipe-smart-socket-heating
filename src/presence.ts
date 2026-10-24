/**
 * Spec 001 FR1, FR10 — presence and the end of a manual hold. Pure.
 *
 * `lastMotionAt` is the instant motion was last seen: while the zone reports
 * motion the room is occupied whatever it holds, so it only matters once
 * motion has ended.
 */

/** The instant the room turns empty, or null when no motion was ever seen. */
export function emptyAt(lastMotionAt: number | null, timeoutMs: number): number | null {
  return lastMotionAt === null ? null : lastMotionAt + timeoutMs;
}

export function isOccupied(
  motion: boolean,
  lastMotionAt: number | null,
  now: number,
  timeoutMs: number,
): boolean {
  if (motion) return true;
  const until = emptyAt(lastMotionAt, timeoutMs);
  return until !== null && now < until;
}

/**
 * A hold ends once the zone has had no motion for `timeout`, counted from the
 * later of the hold's start and the last motion.
 */
export function holdEnded(
  motion: boolean,
  holdSince: number,
  lastMotionAt: number | null,
  now: number,
  timeoutMs: number,
): boolean {
  if (motion) return false;
  const from = Math.max(holdSince, lastMotionAt ?? holdSince);
  return now - from >= timeoutMs;
}

/** Spec 005 — motion lasting this long confirms a presence in an empty room. */
export const CONFIRM_HOLD_MS = 2 * 60_000;
/** Spec 005 — a second motion within this delay of the first confirms it too; past it, the first is dropped. */
export const CONFIRM_WINDOW_MS = 5 * 60_000;

/**
 * Spec 005 FR1 — filters the zone's motion: in an empty room a lone detection
 * (a PIR fooled by warm air, a pet) does not make it occupied. Motion counts
 * once it lasts `CONFIRM_HOLD_MS` or starts again within `CONFIRM_WINDOW_MS`.
 * In an occupied room motion passes through. Pure: time comes in.
 */
export class PresenceFilter {
  private raw = false;
  private pendingSince: number | null = null;

  /** `raw` is the zone's motion now, `occupied` the room before this update. */
  update(raw: boolean, occupied: boolean, now: number): { motion: boolean; dropped: boolean } {
    const rising = raw && !this.raw;
    this.raw = raw;
    if (occupied) {
      this.pendingSince = null;
      return { motion: raw, dropped: false };
    }
    let dropped = false;
    if (this.pendingSince !== null && now - this.pendingSince >= CONFIRM_WINDOW_MS) {
      this.pendingSince = null;
      dropped = true;
    }
    if (this.pendingSince === null) {
      if (rising) this.pendingSince = now;
      return { motion: false, dropped };
    }
    if (raw && (rising || now - this.pendingSince >= CONFIRM_HOLD_MS)) {
      this.pendingSince = null;
      return { motion: true, dropped };
    }
    return { motion: false, dropped };
  }
}
