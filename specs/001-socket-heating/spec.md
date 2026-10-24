# Spec 001 — Smart socket heating: presence setpoint, on/off regulation, safety cuts

- **Status**: In progress (live check AC8 pending)
- **Date**: 2026-10-24
- **Related**: `sowel-recipe-presence-thermostat` (the comfort / eco / night logic it mirrors), `sowel-recipe-presence-heater` (pilot-wire heaters, opposite relay convention), core spec 169 / 171 (recipe Dashboard tile and its control)
- **Installation**: the owner's office — zone Bureau with two PIR sensors (PIR Marc, PIR Elodie), THR_BUREAU (Tuya IH-K009: temperature every 30 min plus on change), Radiateur Bureau (SONOFF S60ZBTPF socket, core type `switch`, with power metering) feeding an electric radiator that has its own thermostat

## Context

The owner plugged an electric radiator into a smart socket and wants Sowel to heat the room when someone is in it, from a temperature sensor in the room. None of the existing recipes does it:

- **presence-heater** follows the pilot-wire convention (relay off = comfort, relay on = eco) and reads no temperature: on a socket it would heat the empty room.
- **presence-thermostat** sends a setpoint to a `thermostat` equipment; a socket has none.

Two facts measured on the installation shape the recipe:

1. **The radiator regulates by itself.** On 2026-10-24 the socket was on and the radiator drew 0 W at 23.6 °C: its own thermostat had cut. The recipe can only heat below that thermostat's setting, which stays as a physical ceiling.
2. **The sensor reports every 30 minutes, plus on change.** The recipe re-evaluates on every reading and every minute; how fast the room is followed depends on the sensor's reporting (configured in Zigbee2MQTT, outside this recipe).

## Goals

1. Hold a **setpoint that follows the zone presence**: comfort while someone is there, eco after `timeout` without motion, an optional night setpoint over a time window.
2. **Regulate on/off** through the sockets from the sensor, with a hysteresis and a minimum time between switches.
3. **Cut on safety**: room too hot, sensor silent.
4. Let the user **pick a mode** from the tile or the zone page: auto, comfort, eco, off.
5. **Never fight the user**: a socket switched by someone else is left alone until the next absence.

## Non-goals

- **Preheat windows, cocoon boost.** Not needed for the office; may come later as optional slots.
- **Proportional control (PWM, PID).** On/off with a hysteresis is enough for a radiator with its own thermostat.
- **Window-open detection.** No contact sensor in the room.
- **Pilot-wire heaters** (core `heater` type): their relay convention is the opposite; presence-heater covers them.
- **Configurable regulation constants.** Hysteresis, minimum cycle, maximum temperature and the silent-sensor delay are fixed in the code (owner's decision, 2026-10-24); a later version may expose them.

## Parameters (slots)

| Slot                | Type                         | Required | Default | Meaning                                                        |
| ------------------- | ---------------------------- | -------- | ------- | -------------------------------------------------------------- |
| `zone`              | zone                         | yes      | current | The zone whose aggregated motion is the presence               |
| `temperatureSensor` | equipment with `temperature` | yes      | —       | The room's temperature (any zone)                              |
| `heaters`           | equipment `switch`, list     | yes      | —       | The sockets feeding the radiators, each with a `state` order   |
| `comfortTemp`       | number °C, 5–24              | yes      | 20      | Setpoint while someone is there                                |
| `ecoTemp`           | number °C, 5–24              | yes      | 17      | Setpoint after `timeout` without motion                        |
| `timeout`           | duration                     | yes      | 30m     | Time without motion before the room counts as empty            |
| `nightStart`        | time                         | no       | —       | Start of the night window (HH:MM)                              |
| `nightEnd`          | time                         | no       | —       | End of the night window (HH:MM); the window may cross midnight |
| `nightTemp`         | number °C, 5–24              | no       | —       | Setpoint during the night window, whatever the presence        |

Fixed in the code: hysteresis ±0.2 °C, minimum cycle 5 min, maximum temperature 25 °C, sensor silent after 90 min.

Validation (the instance is refused with a clear message):

- the sensor exists and has a `temperature` data binding;
- at least one heater; each exists, is a `switch` and has a `state` order binding;
- `ecoTemp` ≤ `comfortTemp`;
- `nightStart`, `nightEnd`, `nightTemp`: all three or none; `nightStart` ≠ `nightEnd`.

## Functional requirements

### Setpoint

- **FR1 — Presence.** The room is occupied while the zone's aggregated `motion` is true, and for `timeout` after the last motion. The time of the last motion is kept in the instance state (when motion ends, every 5 minutes while it lasts, and at stop), so a restart within the timeout keeps the room occupied, even after a long presence. A zone with no motion sensor is logged once at start (the room then always counts as empty).
- **FR2 — Mode.** The user picks `auto` (default), `comfort`, `eco` or `off` through the `set_mode` cycle action (tile and zone page). The choice is kept in the instance state, survives a restart and lasts until changed.
- **FR3 — Setpoint in `auto`.** Night window active → `nightTemp`; else occupied → `comfortTemp`; else `ecoTemp`. In `comfort` / `eco` the setpoint is that temperature, presence and night ignored. In `off` there is no setpoint.

### Regulation

- **FR4 — On/off with hysteresis.** Temperature ≤ setpoint − 0.2 °C → sockets on; ≥ setpoint + 0.2 °C → off; in between → unchanged. Every socket of the list follows the same decision; an order is sent only to a socket whose reading differs from it (or is unknown).
- **FR5 — Minimum cycle.** A regulation switch of a socket waits until 5 minutes after the recipe last switched it. FR6, FR7 and the `off` mode act at once.

### Safety

- **FR6 — Too hot.** Temperature ≥ 25 °C → every socket off at once, in every mode, a manual hold included (the hold is kept). The tile says so.
- **FR7 — Silent sensor.** No temperature value, or none received for 90 minutes (the binding's `lastUpdated`) → sockets off at once, `alert` set in the state, one warning in the log. Cleared by the next reading. Not applied during a manual hold: the recipe does not regulate then, so it raises no alert either (it still clears one).

### Manual hold

- **FR8 — Detection.** For each socket the recipe keeps the state it expects: the last value it ordered, or the reading at start. A `state` reading that really changes (its previous value differs: the core relays every report, and a Zigbee2MQTT socket republishes `state` with each power report) to a value different from the expected one is a person (or another automation) switching the socket: the recipe holds. Whoever did it — the Sowel UI, the socket's own button, a mode — is not distinguished. An unknown reading (socket offline) is ignored. A failed order switched nothing: the recipe expects the old state again.
- **FR9 — During the hold** the recipe sends no order to the sockets, except FR6. The hold wins over the `off` mode too: a radiator switched on by hand while the tile reads Arrêt stays on (picking a mode ends the hold, FR10).
- **FR10 — End.** The hold ends when the zone has had no motion for `timeout`, counted from the later of the hold's start and the last motion; or when the user picks a mode (FR2). The hold is kept in the state and survives a restart.

### Visibility

- **FR11 — Tile.** Icon `Flame`, the `set_mode` control. The summary, in French like the owner's other recipes:
  - `Confort 20° · 19,4° · chauffe` — the label is Confort, Eco or Nuit; the setpoint; the temperature; then `chauffe` when a socket draws power (`power` > 10 W, or `state` on when the socket has no `power` binding or no power reading yet), `radiateur au repos` when a socket is on but draws nothing (its own thermostat has cut), nothing when the sockets are off;
  - `Manuel · 19,4°`, `Arrêt`, `Sécurité · 25,3°`, `Capteur muet`.
  - `timerExpiresAt`: in `auto`, while comfort is held by the timeout (occupied, no motion right now, outside the night window), the instant it turns empty (the tile counts it down).
- **FR12 — Log.** One line per decision change (status, setpoint, sockets switched, hold started or ended, sensor silent or back), never one per tick. A switch is logged once its order succeeds. A failed order is logged once; the same order is not sent again to a socket within a minute.

### Lifecycle

- **FR13 — Evaluation.** On every change of the zone's motion, the sensor's `temperature`, the sockets' `state` or `power`, on a mode change, and every minute.
- **FR14 — Start and stop.** At start the decision applies at once from the readings (no minimum cycle yet). `stop()` (instance disabled or deleted, core stopping) clears the timers and handlers and leaves the sockets as they are.

## Acceptance criteria

- [x] AC1 — Motion in the zone → comfort setpoint; no motion for `timeout` → eco; night window → night setpoint whatever the presence.
- [x] AC2 — Below setpoint − 0.2 → sockets on; above setpoint + 0.2 → off; in between unchanged; a second switch within 5 min waits.
- [x] AC3 — 25 °C reached → sockets off at once, in every mode.
- [x] AC4 — Sensor silent for 90 min → sockets off, `alert` set; a new reading clears it.
- [x] AC5 — A socket switched by hand → no order from the recipe until the room has been empty for `timeout`; a mode picked from the tile ends the hold.
- [x] AC6 — The tile's control cycles auto → comfort → eco → off; the choice survives a restart.
- [x] AC7 — The summary shows `chauffe` / `radiateur au repos` from the socket's power.
- [ ] AC8 — Live on the owner's office (candidate instance through a personal source, with the owner's agreement): comfort on arrival, eco after the timeout, a manual switch held, the radiator's own thermostat seen as `radiateur au repos`.

## Edge cases

| Case                                        | Expected                                                                               |
| ------------------------------------------- | -------------------------------------------------------------------------------------- |
| Radiator thermostat set below comfort       | Socket on, 0 W: summary `radiateur au repos`; the room stays at the radiator's setting |
| Socket offline (`state` unknown)            | The decision still computed; the order is sent and its failure logged once, retried    |
| Socket restarts and reads a different state | Counted as a manual hold (FR8): no order until the room has been empty for `timeout`   |
| Several sockets, one switched by hand       | The whole instance holds                                                               |
| Comfort forced from the tile at night       | Comfort setpoint (the forced mode wins over the night window)                          |
| Manual hold while the room is empty         | Ends `timeout` after the hold started, if no motion meanwhile                          |
| Restart while the room is occupied          | Still occupied until `timeout` after the persisted last motion                         |
| Restart during a manual hold                | The hold is kept                                                                       |
| Temperature exactly on setpoint ± 0.2       | ≤ / ≥ apply: on at exactly setpoint − 0.2, off at exactly setpoint + 0.2               |
| Sensor in another zone                      | Allowed (`crossZone`)                                                                  |
| Instance disabled while heating             | Sockets left as they are; the radiator's own thermostat caps the room                  |

## Docs delta

This repository: `README.md` (what the recipe does, its parameters, the radiator thermostat to set above comfort, the sensor's reporting).

Core `mchacher/sowel`, in the registry PR of the first release:

| Page                                                | Change                                                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `docs/user/recipes.md` (EN only: no FR page exists) | New row "Smart Socket Heating"; fix the Presence Heater row (it has no setpoints and no away setback)  |
| `ui/src/i18n/locales/{en,fr}.json`                  | `recipes.actions.set_mode.auto` (Auto) and `.off` (Off / Arrêt), so the tile's control reads in French |
