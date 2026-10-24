# Spec 004 — Cocoon up to 26 °C, safety cut at 28 °C

- **Status**: In progress (release v0.3.1 pending)
- **Date**: 2026-10-24
- **Amends**: spec 001 FR6 (safety cut at 25 °C), spec 002 (`cocoonTemp` 5–24)

## Context

The owner wants a cocoon up to 26 °C in the office. The safety cut at 25 °C would stop it below its setpoint, and it already fired at 25.1 °C with comfort at 23 °C (the radiator overshoots): a 1 °C margin over the highest setpoint is too tight.

## Requirements

- **FR1** — `cocoonTemp` accepts 5–26 °C. Comfort, eco and night stay at 5–24 °C.
- **FR2** — The safety cut moves to **28 °C**, 2 °C above the highest setpoint allowed, still on the hottest live reading of the room (spec 003) and still immediate.

## Non-goals

- A safety cut that follows the setpoint, or a configurable one: fixed in the code, like the other regulation constants (spec 001).

## Acceptance criteria

- [x] AC1 — A 26 °C cocoon is accepted and regulated (on at 25.8, off at 26.2); 26.5 is refused; comfort 25 is refused.
- [x] AC2 — 28 °C on any reading cuts at once, in every mode; 27.9 does not.
