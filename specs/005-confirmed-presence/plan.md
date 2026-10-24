# Spec 005 — Plan

## Steps

- [x] 1. `PresenceFilter` + tests.
- [x] 2. `index.ts`: filtered motion, immediate cut on a lower setpoint + tests.
- [ ] 3. Release v0.4.0, registry bump; owner's check on the office (AC4).

## Test plan

| Module   | Scenario                                          | Expected                         |
| -------- | ------------------------------------------------- | -------------------------------- |
| presence | One 63 s detection, empty room                    | never motion; dropped at 5 min   |
| presence | Motion lasting 2 min                              | confirmed                        |
| presence | Second detection at 4 min / at 6 min              | confirmed / dropped, new pending |
| presence | Occupied room                                     | passes through                   |
| index    | The 14:05 sequence                                | no order, eco, log line          |
| index    | Motion lasting 2 min / two detections 3 min apart | comfort, socket on               |
| index    | On at 26 min, room empty at 30 min                | cut at once                      |
