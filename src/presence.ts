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
