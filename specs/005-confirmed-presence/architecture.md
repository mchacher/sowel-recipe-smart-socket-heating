# Spec 005 — Architecture

| File              | Change                                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `src/presence.ts` | `PresenceFilter.update(raw, occupied, now)` → `{ motion, dropped }`; `CONFIRM_HOLD_MS`, `CONFIRM_WINDOW_MS`                            |
| `src/index.ts`    | `rawMotion` from the zone, `motion` = filtered; `filterMotion()` at the start of each evaluation; `heatSetpoint` and the immediate cut |

`lastMotionAt` follows the filtered motion only, so an ignored detection neither occupies the room nor extends a hold or a cocoon.
