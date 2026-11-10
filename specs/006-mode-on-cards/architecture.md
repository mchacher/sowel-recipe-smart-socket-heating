# Spec 006 — Architecture

One declarative field, no runtime change.

| File                 | Change                               |
| -------------------- | ------------------------------------ |
| `src/sowel-types.ts` | `RecipeActionDef.targets?: string[]` |
| `src/i18n.ts`        | `ACTIONS[0].targets = ["heaters"]`   |
| `src/index.test.ts`  | Asserts the declaration              |

The core reads `RecipeInfo.actions[].targets` (carried verbatim) and matches the instance's `heaters` list against each card's equipment.
