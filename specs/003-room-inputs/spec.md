# Spec 003 — Everything from the room: temperature, sockets and buttons of the recipe's zone

- **Status**: In progress (release v0.3.0 pending)
- **Date**: 2026-10-24
- **Amends**: spec 001 (`temperatureSensor` slot, sensor in another zone allowed), spec 002 (buttons from any zone)
- **Related**: core issue mchacher/sowel#1073 (a recipe update keeps the old version of the files its entry imports)

## Context

The owner, configuring the office instance, found the form heavier than the recipe needs:

- the heater and sensor pickers asked for a zone first (`crossZone`) and offered sockets from the whole house;
- the recipe already takes the presence from its zone, yet asked for a temperature sensor.

The owner's rule: the recipe is about one room; it proposes what is in that room and takes the room's readings, like the presence.

Separately, updating to 0.2.0 from the UI left prod running the 0.1.0 parameters until a restart (core issue #1073). The recipe now ships as one bundled file.

## Goals

1. **No sensor to pick.** The temperature is the room's: the average of its sensors.
2. **Only the room's equipments offered** for the sockets and the cocoon buttons; every socket of the room is offered.
3. **An update from the UI loads all the new code** (single-file build).

## Functional requirements

- **FR1 — Slots.** `temperatureSensor` is removed; an instance still carrying it ignores it. `heaters` and `buttons` drop `crossZone`: the form lists the equipments of the recipe's zone, all of them, without asking for a zone.
- **FR2 — Temperature.** The temperature is the average of the `temperature` readings of the equipments in the zone and its sub-zones (the core's zone aggregation scope), every socket (`switch`) excepted — a plug's own device temperature is not the room's —, counting only readings reported within the silent delay (90 min). A sensor gone quiet drops out of the average instead of holding it on its last value.
- **FR2b — Safety on the hottest.** The 25 °C cut (spec 001 FR6) looks at the hottest live reading of the room, not at the average: a sensor next to the radiator at 26 °C cuts even when the room averages 24 °C.
- **FR3 — Silent.** No live reading left is spec 001's silent sensor: sockets off, alert `Température de la pièce muette`, one log line per edge.
- **FR4 — Events.** A `temperature` report from any of those equipments re-evaluates; the set is re-read at each use, so an equipment moved in or out counts at once.
- **FR5 — Validation.** The zone must hold at least one equipment with a `temperature` reading (sockets excepted).
- **FR6 — Build.** `dist/index.js` is a single esbuild bundle.

## Acceptance criteria

- [x] AC1 — The form asks for no sensor and offers only the room's sockets and buttons.
- [x] AC2 — Two sensors in the room and one in a sub-zone are averaged; a sensor of another zone and a socket's own temperature are not.
- [x] AC3 — A sensor quiet for 90 min drops out; all quiet cuts the heating with the alert.
- [x] AC4 — A zone without a temperature sensor is refused.
- [ ] AC5 — Updating prod from 0.2.0 shows the cocoon slots and the new name without a restart.
