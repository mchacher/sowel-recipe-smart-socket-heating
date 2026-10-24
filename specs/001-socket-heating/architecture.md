# Spec 001 — Architecture

```
createRecipe() → RecipeDefinition (id "smart-socket-heating", slots, set_mode action, tile, i18n fr)
  createInstance(params, ctx) → Instance
     ├─ inputs.ts     read the sensor (value, lastUpdated) and the sockets (state, power) by alias
     ├─ presence.ts   PURE: occupied(motion, lastMotionAt, now, timeout); hold ended(...)
     ├─ decide.ts     PURE: snapshot → Decision {status, setpoint, want, immediate}
     ├─ sockets.ts    expected state per socket, minimum cycle, order value (boolean or enum), failure logged once
     ├─ summary.ts    PURE: Decision + readings → summary string (French)
     └─ index.ts      lifecycle: 60 s tick, zone.data.changed, equipment.data.changed, onAction, state, log
```

- **Pure core.** `decide()`, `presence` and `summaryOf()` never touch `ctx`; every rule of the decision table is a unit test.
- **Ctx only at the edges.** `inputs.ts` reads, `sockets.ts` dispatches, `index.ts` wires timers and events. Types mirrored by hand in `src/sowel-types.ts`.

## Contracts used

| Equipment              | Alias         | Side  | Use                                                |
| ---------------------- | ------------- | ----- | -------------------------------------------------- |
| sensor (any type)      | `temperature` | data  | Regulation; `lastUpdated` for FR7                  |
| `switch` (each heater) | `state`       | data  | Current state, manual-hold detection (FR8)         |
|                        | `power`       | data  | `chauffe` / `radiateur au repos` (optional)        |
|                        | `state`       | order | On / off (boolean, or the order's enum `ON`/`OFF`) |
| zone (aggregated)      | `motion`      | —     | Presence (FR1)                                     |

## Core APIs

| API                                                    | Use                                                                               |
| ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `ctx.equipmentManager.getDataBindingsWithValues(id)`   | Value and `lastUpdated` of each alias                                             |
| `ctx.equipmentManager.getOrderBindingsWithDetails(id)` | Validation (`state` order present), enum values of the order                      |
| `ctx.zoneAggregator.getByZoneId(zoneId)`               | `motion`, `motionSensors` (warning when 0)                                        |
| `ctx.eventBus.onType("zone.data.changed")`             | Motion changes of the zone                                                        |
| `ctx.eventBus.onType("equipment.data.changed")`        | Sensor temperature, sockets state and power                                       |
| `ctx.dispatchOrder(id, "state", value)`                | Switching; `{success:false}` read, never a throw expected                         |
| `ctx.state`                                            | `mode`, `summary`, `timerExpiresAt`, `alert`, `lastMotionAt`, `hold`, `holdSince` |
| `ctx.log`                                              | Decision changes                                                                  |
| `onAction("set_mode", { mode })`                       | FR2 — payload sent by the core's cycle control                                    |

## Decision table (`decide`)

Evaluated top to bottom, first match wins. `T` is the temperature, `S` the setpoint.

| #   | Condition                               | Status                      | Sockets | Immediate |
| --- | --------------------------------------- | --------------------------- | ------- | --------- |
| 1   | `T` known and ≥ 25 °C                   | `safety`                    | off     | yes       |
| 2   | mode `off`                              | `off`                       | off     | yes       |
| 3   | manual hold                             | `manual`                    | leave   | —         |
| 4   | `T` unknown or older than 90 min        | `silent`                    | off     | yes       |
| 5   | otherwise: `S` per FR3; `T` ≤ `S` − 0.2 | `comfort` / `eco` / `night` | on      | no        |
| 6   | `T` ≥ `S` + 0.2                         | idem                        | off     | no        |
| 7   | in between                              | idem                        | leave   | —         |

Not immediate → the minimum cycle (5 min since the recipe last switched that socket) applies.

## Files

`src/index.ts`, `src/sowel-types.ts`, `src/decide.ts`, `src/presence.ts`, `src/inputs.ts`, `src/sockets.ts`, `src/summary.ts`, `src/i18n.ts`, `src/testing/ctx.testing.ts`, tests next to each; `manifest.json` (`type: "recipe"`, `sowelVersion` ≥ 1.74.0), `README.md`, `CHANGELOG.md`.
