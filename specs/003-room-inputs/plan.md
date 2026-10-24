# Spec 003 — Plan

## Steps

- [x] 1. Single-file build (esbuild), `CLAUDE.md` note.
- [x] 2. `inputs.ts`: room temperature + tests.
- [x] 3. `i18n.ts`, `index.ts`: slots, validation, events, logs + tests.
- [x] 4. README, spec 001 / 002 amended.
- [ ] 5. Release v0.3.0, registry bump, update on prod (AC5).

## Test plan

| Module | Scenario                                                 | Expected                         |
| ------ | -------------------------------------------------------- | -------------------------------- |
| index  | Sensors 19 and 20 in the room, 21 in a sub-zone          | 20°                              |
| index  | Sensor of another zone at 30, socket reporting 45        | ignored: 19°                     |
| index  | A second sensor of the room reports                      | re-evaluated, average follows    |
| index  | One sensor quiet 100 min, the other reporting            | quiet one dropped, no alert      |
| index  | Every sensor quiet 91 min                                | cut, alert, then cleared         |
| inputs | Sockets (selected or not) with a temperature             | never sources                    |
| inputs | Two live readings 19 / 22                                | 20.5, latest instant, hottest 22 |
| inputs | One reading 90 min old / all                             | dropped / null                   |
| decide | Average 24, hottest 26                                   | safety                           |
| index  | Zone without temperature (a socket's own does not count) | refused                          |
