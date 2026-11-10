# Spec 007 — Cocoon offered only with a cocoon setpoint

## Context

The Sowel core hides a cycle option named `cocoon` when the instance has no `cocoonTemp`, by name, a rule written for presence-thermostat that this recipe met by coincidence. Core issue mchacher/sowel#1210 removes it: a cycle option now declares `requiresParam`, the instance parameter it needs.

## Goals

1. The cocoon option stays hidden without a cocoon setpoint once the core stops hard-coding it.

## Non-Goals

- No change to the decision: `set_mode` already ignores cocoon without `cocoonTemp`.

## Functional Requirements

### FR1 — `requiresParam: "cocoonTemp"` on the cocoon option

The mirrored `RecipeActionDef` option type gains the optional field. An older core ignores it.

## Acceptance Criteria

- [x] `set_mode`'s cocoon option declares `requiresParam: "cocoonTemp"`, and no other option declares one.

## Edge Cases

- Cocoon picked through the API without a setpoint: still ignored by the recipe.
