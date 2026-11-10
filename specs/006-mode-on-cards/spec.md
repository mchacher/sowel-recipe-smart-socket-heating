# Spec 006 — The mode on the sockets' Dashboard cards

## Context

Core spec 201 (mchacher/sowel) lets a cycle action name the equipment slots its mode applies to (`targets`); the Dashboard card of each such equipment then shows the current mode as a pill. Without the declaration the core shows nothing, because it cannot tell the sockets this recipe drives from the cocoon buttons it only reads.

## Goals

1. The card of every socket in `heaters` shows the recipe's mode (Auto, Cocoon, Comfort, Eco, Off).

## Non-Goals

- No pill on the cocoon buttons.
- No change to the decision, the tile or the zone page.

## Functional Requirements

### FR1 — `targets: ["heaters"]` on `set_mode`

The `set_mode` cycle action declares `targets: ["heaters"]`. The mirrored `RecipeActionDef` in `src/sowel-types.ts` gains the optional field. A core older than spec 201 ignores it.

## Acceptance Criteria

- [x] `createRecipe().actions[0].targets` is `["heaters"]`.
- [ ] With a core carrying spec 201, the Radiateur Bureau card shows the mode; the cocoon button's card does not.

## Edge Cases

- Several sockets: each card shows the pill.
