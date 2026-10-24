# Spec 002 — Plan

## Steps

- [x] 1. `decide.ts`, `summary.ts`: mode and status `cocoon` + tests.
- [x] 2. `i18n.ts`: slots, option, names.
- [x] 3. `index.ts`: params, validation, button, start/end, night edge, persistence, countdown + tests.
- [x] 4. Manifest, README.
- [ ] 4b. Changelog and version 0.2.0 (release PR).
- [ ] 5. Release v0.2.0, then the core PR: registry bump (names, sha256), `docs/user/recipes.md` row.

## Test plan

| Module  | Scenario                                                        | Expected                                        |
| ------- | --------------------------------------------------------------- | ----------------------------------------------- |
| decide  | Mode cocoon, cocoonTemp 23, 22.7 °C                             | `cocoon`, setpoint 23, on                       |
| decide  | Mode cocoon inside the night window                             | `cocoon`, not `night`                           |
| decide  | Mode cocoon, cocoonTemp null                                    | regulates as auto                               |
| decide  | Mode cocoon, manual hold / 25 °C                                | `manual` / `safety`                             |
| summary | Cocoon, socket heating                                          | `Cocoon 23° · 21,4° · chauffe`                  |
| index   | `set_mode` cocoon                                               | mode cocoon, `cocoonSince` set, log `(tuile)`   |
| index   | `set_mode` cocoon without cocoonTemp                            | nothing changes                                 |
| index   | Button press in auto, then again                                | cocoon, then auto                               |
| index   | `hold` then `release` within 2 s                                | one toggle                                      |
| index   | Empty action report (`""`)                                      | ignored                                         |
| index   | Button press during a manual hold                               | hold ended, cocoon                              |
| index   | Cocoon, motion ends, `timeout` elapses                          | auto, log `pièce vide`                          |
| index   | Cocoon started in an empty room                                 | lasts `timeout`, then auto                      |
| index   | Cocoon, night window starts                                     | auto, log `début de la nuit`                    |
| index   | Cocoon started inside the night window                          | stays at the next ticks                         |
| index   | Cocoon ends on night / absence during a manual hold             | auto, hold kept, no order                       |
| index   | Restart straddling the night start                              | auto, log `début de la nuit`                    |
| index   | Long hold then `release` / `*_stop`                             | one toggle                                      |
| index   | Countdown, motion lasting after the start                       | from the last motion                            |
| index   | Restart in cocoon                                               | mode cocoon, `cocoonSince` restored             |
| index   | Countdown in cocoon, no motion                                  | `timerExpiresAt` = max(start, motion) + timeout |
| index   | Validation: buttons without cocoonTemp; button without `action` | refused                                         |
| index   | French name                                                     | "Chauffage sur prise"                           |
