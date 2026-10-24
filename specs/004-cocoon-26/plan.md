# Spec 004 — Plan

## Steps

- [x] 1. Constants, validation, slot constraint, descriptions.
- [x] 2. Tests moved to 28 °C; 26 °C cocoon scenarios.
- [ ] 3. Release v0.3.1, registry bump.

## Test plan

| Module | Scenario                                 | Expected                     |
| ------ | ---------------------------------------- | ---------------------------- |
| decide | Cocoon 26, 25.5 °C / 26.2 °C             | `cocoon` on / off            |
| decide | 28 °C (any mode, hold) / hottest 27.9 °C | `safety` / regulates         |
| index  | 28.1 °C report                           | cut, `Sécurité · 28,1°`      |
| index  | cocoonTemp 26 / 26.5; comfortTemp 25     | accepted / refused / refused |
