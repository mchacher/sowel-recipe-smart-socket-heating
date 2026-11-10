# Spec 007 — Architecture

One declarative field, no runtime change.

| File                 | Change                                    |
| -------------------- | ----------------------------------------- |
| `src/sowel-types.ts` | `requiresParam?: string` on cycle options |
| `src/i18n.ts`        | `requiresParam: "cocoonTemp"` on cocoon   |
| `src/index.test.ts`  | Asserts the declaration                   |
