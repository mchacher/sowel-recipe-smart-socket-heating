# Spec 001 — Plan

## Steps

- [ ] 1. Repository tooled like the core: CI, gitleaks, husky, Prettier, specs checks, `CLAUDE.md`, skills; GitHub repo and `main-protection` ruleset.
- [ ] 2. `presence.ts`, `decide.ts`, `summary.ts` (pure) + tests.
- [ ] 3. `inputs.ts`, `sockets.ts` + tests against a fake ctx.
- [ ] 4. `index.ts` (lifecycle, events, tick, `set_mode`, tile, i18n) + tests with fake timers.
- [ ] 5. Manifest, README, changelog.
- [ ] 6. Candidate instance on the owner's office through a personal source (spec 136), with the owner's agreement (AC8).
- [ ] 7. Release v0.1.0, then the core PR: registry entry (`owner`, `sha256`), docs EN/FR, the two `set_mode` labels.

## Test plan

| Module   | Scenario                                                                                       | Expected                                                         |
| -------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| presence | Motion now                                                                                     | occupied                                                         |
| presence | No motion, last motion 10 min ago, timeout 30 min                                              | occupied, empty at last motion + 30 min                          |
| presence | No motion, last motion 31 min ago                                                              | empty                                                            |
| presence | No last motion recorded                                                                        | empty                                                            |
| presence | Hold started 40 min ago, last motion 20 min ago, timeout 30 min                                | hold kept (counted from the later: 20 min)                       |
| presence | Hold started 31 min ago, no motion since                                                       | hold ended                                                       |
| decide   | Auto, occupied, 19.7 °C, comfort 20                                                            | `comfort`, on (≤ 19.8)                                           |
| decide   | Auto, occupied, 20.2 °C                                                                        | `comfort`, off (≥ 20.2)                                          |
| decide   | Auto, occupied, 20.0 °C                                                                        | leave                                                            |
| decide   | Auto, empty, 18 °C, eco 17                                                                     | `eco`, off                                                       |
| decide   | Auto, night window 22:00–06:00 at 23:30, occupied, night 15                                    | `night`, setpoint 15                                             |
| decide   | Night window crossing midnight, 05:59 / 06:00                                                  | night / not night                                                |
| decide   | No night configured                                                                            | never `night`                                                    |
| decide   | Mode `comfort` at night, room empty                                                            | `comfort`                                                        |
| decide   | Mode `eco`, room occupied                                                                      | `eco`                                                            |
| decide   | Mode `off`                                                                                     | `off`, off, immediate                                            |
| decide   | 25.0 °C, any mode, manual hold included                                                        | `safety`, off, immediate                                         |
| decide   | Manual hold, 18 °C                                                                             | `manual`, leave                                                  |
| decide   | Temperature null / last update 91 min ago                                                      | `silent`, off, immediate                                         |
| decide   | Last update 89 min ago                                                                         | regulates normally                                               |
| summary  | Comfort, socket on, 1200 W                                                                     | `Confort 20° · 19,4° · chauffe`                                  |
| summary  | Comfort, socket on, 0 W                                                                        | `… · radiateur au repos`                                         |
| summary  | Socket on without a `power` binding                                                            | `… · chauffe`                                                    |
| summary  | Eco, socket off                                                                                | `Eco 17° · 18,2°`                                                |
| summary  | manual / off / safety / silent                                                                 | `Manuel · 19,4°` / `Arrêt` / `Sécurité · 25,3°` / `Capteur muet` |
| sockets  | Want on, reading off, never switched                                                           | `state` order sent at once                                       |
| sockets  | Want off 3 min after the recipe switched on, not immediate                                     | no order; sent once 5 min have passed                            |
| sockets  | Want off immediate 1 min after a switch                                                        | order sent at once                                               |
| sockets  | Reading already equal to the decision                                                          | no order                                                         |
| sockets  | Order binding with enum `ON`/`OFF`                                                             | `"ON"` / `"OFF"` sent; boolean otherwise                         |
| sockets  | Order fails twice                                                                              | one log line, retried at the next evaluation                     |
| index    | `state` reading changes to the value the recipe ordered                                        | no hold                                                          |
| index    | `state` reading changes to another value                                                       | hold, logged once, no order while held                           |
| index    | Hold, then no motion for `timeout`                                                             | hold ends, regulation resumes                                    |
| index    | Hold, then `set_mode` from the tile                                                            | hold ends, mode applied                                          |
| index    | `set_mode` cycles and persists; restart reads it back                                          | mode kept                                                        |
| index    | Restart with `lastMotionAt` 10 min ago, timeout 30 min                                         | occupied at start                                                |
| index    | Restart with a persisted hold                                                                  | hold kept                                                        |
| index    | Sensor silent → reading arrives                                                                | `alert` set then cleared, one log line each                      |
| index    | `timerExpiresAt` while occupied without motion; removed when empty or motion                   | set / deleted                                                    |
| index    | Validation: missing `state` order, eco > comfort, night half-configured, nightStart = nightEnd | refused with a message                                           |
| index    | 60 ticks with nothing changing                                                                 | no log line, no order                                            |
| index    | `stop()`                                                                                       | timers cleared, handlers unsubscribed, no order                  |
