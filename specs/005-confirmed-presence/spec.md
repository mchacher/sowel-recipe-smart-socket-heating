# Spec 005 — Confirmed presence, immediate cut on absence

- **Status**: In progress (release v0.4.0 pending)
- **Date**: 2026-10-24
- **Amends**: spec 001 FR1 (presence), FR5 (minimum cycle)

## Context

On 2026-10-24 the office heated twice while empty (prod recipe log, socket power history, server log):

- **14:06 → 14:16, 1.7 kW.** PIR Marc reported motion once at 14:05:47 for 63 s; nothing else until 14:19:49. The owner confirms nobody went in. One detection switched the room to comfort for 30 minutes and the radiator heated 10 minutes.
- **13:46 → 13:51, 1.7 kW.** Still inside the 30 min absence delay after the last motion (≈13:20); the room turned empty at 13:50:09 but the cut waited for the 5 min minimum cycle until 13:51:23.

## Requirements

- **FR1 — Confirmed presence.** In an empty room, motion makes it occupied only once confirmed: the zone's motion lasts **2 minutes**, or motion starts again within **5 minutes** of the first detection. An unconfirmed detection is dropped after 5 minutes, with one log line `Mouvement isolé ignoré : présence non confirmée`. In an occupied room (motion, or within the absence delay) motion counts at once, as before. Motion already present when the instance starts counts as confirmed (a person creating the instance from the room).
- **FR2 — Immediate cut on a lower setpoint.** A cut because the setpoint dropped below the one the sockets were switched on for (absence → eco, night, a mode picked) does not wait for the minimum cycle. Regulation switches around one setpoint still do.

## Non-goals

- Configurable confirmation delays: fixed in the code, like the other constants.
- Per-sensor logic (two different PIRs): the zone's aggregated motion is filtered.

## Acceptance criteria

- [x] AC1 — The 14:05 sequence (one 63 s detection, nothing for 5 min) sends no order and logs the ignored motion.
- [x] AC2 — Motion lasting 2 min, or two detections 3 min apart, switch to comfort.
- [x] AC3 — Switched on 4 min before the room empties, the socket is cut at once.
- [ ] AC4 — On the office, a day without heating in an empty room (owner's check).

## Edge cases

- **Risk to watch (AC4):** an occupant who enters, sits within a minute and moves less than once every 5 minutes is never confirmed and the room stays at eco. Two PIRs combined help.
- The tick runs every minute: confirmation by duration lands between 2 and 3 minutes.
- Cocoon started from the tile in an empty room still lasts the absence delay (spec 002); an unconfirmed detection does not extend it.
