# Spec 002 — Architecture

## Changes

| File                 | Change                                                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/decide.ts`      | `MODES` gains `cocoon`; `Setpoints.cocoonTemp: number \| null`; `setpointOf` returns `cocoon` first (before the night window); status `cocoon` |
| `src/summary.ts`     | Label `Cocoon`                                                                                                                                 |
| `src/i18n.ts`        | Slots `cocoonTemp`, `buttons` (group `cocoon`); `cocoon` option after `auto`; names "Socket Heating" / "Chauffage sur prise"                   |
| `src/index.ts`       | Params, validation, button subscription, `startCocoon` / `endCocoon`, night-start edge, `cocoonSince` persisted, countdown in cocoon           |
| `manifest.json`      | Names, version 0.2.0                                                                                                                           |
| core `registry.json` | Names, version, sha256 (release)                                                                                                               |

## Decision table (`decide`)

Unchanged order: safety > manual hold > off > silent > regulation. In regulation, the setpoint is chosen as:

| Mode      | Setpoint                                                 |
| --------- | -------------------------------------------------------- |
| `cocoon`  | `cocoonTemp` (falls back to auto when null)              |
| `comfort` | `comfortTemp`                                            |
| `eco`     | `ecoTemp`                                                |
| `auto`    | night window → `nightTemp`; occupied → comfort; else eco |

## Cocoon lifecycle (`index.ts`)

```
tile set_mode cocoon ─┐
button press (≠ cocoon)┴─► startCocoon: mode=cocoon, cocoonSince=now, hold ended
                              │
  button press ───────────────┤
  set_mode other ─────────────┤ (mode set by the action)
  absence ≥ timeout since max(cocoonSince, lastMotion) ─┤
  night window start (edge, tick or event) ──────────────┴─► endCocoon: mode=auto
```

The night edge compares the window state with the previous evaluation's; it is initialised at start, so a cocoon started (or restored) inside the night window lasts until the absence.

State keys added: `cocoonSince` (ISO). The absence rule is `presence.holdEnded`, unchanged: it already counts from the later of a start and the last motion.
