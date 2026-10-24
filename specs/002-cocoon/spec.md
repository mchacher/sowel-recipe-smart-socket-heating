# Spec 002 — Cocoon boost from the tile or a button; renamed "Chauffage sur prise"

- **Status**: In progress (release v0.2.0 pending)
- **Date**: 2026-10-24
- **Related**: spec 001; `sowel-recipe-presence-thermostat` (the stove's cocoon: `cocoonTemp`, `buttons`, `cocoon` in `set_mode`); core spec 171 (a tap on a single-control tile fires its cycle); core `resolveCycle` (hides the `cocoon` option when the instance has no `cocoonTemp`)

## Context

The owner wants the cocoon boost the stove already has: a warmer setpoint for while they sit in the office, switched on by a tap on the recipe tile or by a physical button, as on the stove. The stove's recipe (presence-thermostat) toggles cocoon on any button press and leaves it on absence or at the start of the night.

The owner also asked to rename the recipe "Chauffage sur prise". Only the displayed names change: the id `smart-socket-heating`, the repository and the installed instance stay.

## Goals

1. An optional **cocoon setpoint**, active while someone is in the room.
2. **Switched on** by a tap on the tile (the `set_mode` cycle) or by a press on a configured button.
3. **Switched off** by the next button press, by an absence, at the start of the night window, or by picking another mode. It then returns to **auto**.
4. Displayed name **"Chauffage sur prise"** (fr) / **"Socket Heating"** (en).

## Non-goals

- A cocoon timeout of its own: the absence delay (`timeout`) ends it, as on the stove.
- Telling button actions apart (single, double, hold): any press toggles, as on the stove.
- Changing the recipe id or the repository name.

## Parameters (new slots, group "cocoon")

| Slot         | Type                                  | Required | Meaning                                                               |
| ------------ | ------------------------------------- | -------- | --------------------------------------------------------------------- |
| `cocoonTemp` | number °C, 5–24 (5–26 since spec 004) | no       | The cocoon setpoint. Without it, cocoon is not offered.               |
| `buttons`    | equipment `button`, list              | no       | Buttons whose press toggles cocoon (the recipe's zone since spec 003) |

Validation: `buttons` without `cocoonTemp` is refused; each button exists and has an `action` data binding; `cocoonTemp` in 5–24 (5–26 since spec 004).

## Functional requirements

- **FR1 — Mode `cocoon`.** `set_mode` gains `cocoon`, placed right after `auto`: auto → cocoon → comfort → eco → off. One tap on the tile from auto starts cocoon. The core hides the option when the instance has no `cocoonTemp`; the recipe also ignores a `cocoon` request then.
- **FR2 — Setpoint.** In cocoon the setpoint is `cocoonTemp`, whatever the night window. Regulation, safety cuts, silent sensor and manual hold rank as in spec 001 (hold and safety above the mode).
- **FR3 — Button.** A press (an `action` report with a non-empty value) on a configured button toggles: cocoon → auto, any other mode → cocoon. A press ends a manual hold, like picking a mode. The end of a press (`release`, Zigbee2MQTT `*_release` / `*_stop`) is not a press, and a second report from the same button within 2 s is ignored.
- **FR4 — End on absence.** Cocoon ends (→ auto) once the zone has had no motion for `timeout`, counted from the later of the cocoon's start and the last motion: started from an empty room, it still lasts `timeout`. A manual hold in progress stays: only a press or a picked mode ends it.
- **FR5 — End at night.** Cocoon ends (→ auto) when the night window starts. Started during the night window, it lasts until the absence. After a restart, the night start is judged against the cocoon's start, so a night that began while the core was down ends it.
- **FR6 — Persistence.** `mode` = `cocoon` and `cocoonSince` survive a restart; the end rules apply after it.
- **FR7 — Tile.** Summary `Cocoon 23° · 21,4° · chauffe`. The countdown shows when cocoon will end on absence (no motion, room still occupied).
- **FR8 — Logs.** One line at the start (`Cocoon activé (bouton Switch Cocoon)` / `(tuile)`, followed by the usual `Consigne cocoon 23° (cocoon)`) and one at the end (`Fin du cocoon : pièce vide depuis 30 min` / `début de la nuit` / `bouton`).
- **FR9 — Names.** fr "Chauffage sur prise", en "Socket Heating", in the recipe, the manifest and the core registry entry.

## Acceptance criteria

- [x] AC1 — Tile tap from auto starts cocoon; the sockets regulate around `cocoonTemp`.
- [x] AC2 — A button press toggles cocoon on and off; a hold/release pair toggles once.
- [x] AC3 — Cocoon ends on absence after `timeout`, and at the start of the night window, back to auto.
- [x] AC4 — Without `cocoonTemp`, a `cocoon` request and a button press change nothing; buttons without `cocoonTemp` are refused.
- [x] AC5 — Cocoon and its start survive a restart.
- [x] AC6 — The recipe shows as "Chauffage sur prise" in French.

## Edge cases

- Started from an empty room (tile tapped from elsewhere): lasts `timeout`, then auto.
- Safety (≥ 25 °C, 28 °C since spec 004) during cocoon: cut, cocoon stays; regulation resumes below.
- Button press while mode `off`: starts cocoon (an explicit request).
- `cocoonTemp` removed from an instance in cocoon: the next evaluation reads auto.
