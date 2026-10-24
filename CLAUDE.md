# CLAUDE.md

Guidance for Claude Code (and any AI agent) working on `sowel-recipe-smart-socket-heating`. First file to read. Same method as the Sowel core: spec with gates, feature branch, tests, agent review, PR, explicit merge approval.

## What this is

A Sowel **recipe package**: it heats a room through one or more **smart sockets** (core `switch` equipments) feeding electric radiators, from the **temperature** of the room. Everything comes from the recipe's zone (spec 003): the temperature is the average of its sensors' live readings, the setpoint follows the **presence** the zone aggregates, and the form offers only its sockets and buttons (comfort while someone is there, eco after an absence timeout, an optional night setpoint). The regulation is on/off with a hysteresis; the radiator's own thermostat stays as a physical ceiling.

First installation (2026-10-24): the owner's office — a Tuya IH-K009 sensor (reports every 30 min plus on change), a SONOFF S60ZBTPF socket with power metering, two PIR sensors.

## Where to find context

| You want to know...                 | Read this                                                                                                                                |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| How a recipe package works          | `mchacher/sowel`: `docs/technical/recipe-development.md`, `.claude/skills/sowel-recipe-dev/SKILL.md`                                     |
| The recipe API (types, tile, cycle) | `mchacher/sowel`: `src/shared/types.ts` (`RecipeDefinition`, `RecipeActionDef`, `RecipeTileDef`), `src/recipes/engine/recipe.ts`         |
| The presence logic it mirrors       | [`sowel-recipe-presence-thermostat`](https://github.com/mchacher/sowel-recipe-presence-thermostat) (comfort / eco / night, override)     |
| A mature recipe to imitate          | [`sowel-recipe-ev-charge-smart`](https://github.com/mchacher/sowel-recipe-ev-charge-smart) (pure decision, fake ctx, tile, repo tooling) |
| Every feature specified here        | [docs/specs-index.md](docs/specs-index.md) — one row per spec, CI-gated                                                                  |

The core repo is expected as a sibling directory (`../sowel`).

## Non-negotiable rules

- **Equipments by contract alias, never by vendor key.** The recipe reads `temperature` on the zone's equipments, `state` and `power` on the sockets, and orders `state`. A missing concept is a core spec, never a workaround here.
- **Safety first.** Above the maximum temperature, or with a silent sensor, the sockets are off. These cuts never wait for the minimum cycle.
- **Never fight the user.** A socket switched by someone else (Sowel UI, its own button, another automation) is left alone until the next absence.
- **`dispatchOrder` failures come back as `{ success: false }`**, not as a throw: always read the result.
- **Never throw** from a timer or an event handler. Clear every timer and unsubscribe every handler in `stop()`.
- **Logs**: one recipe-log line per decision change, never one per tick.
- **The decision is pure.** `decide()` takes a snapshot and returns what to do; ctx calls live at the edges. Every rule of the decision table has a unit test.
- **Recipes never import the core.** The types used are mirrored in `src/sowel-types.ts`, kept in sync by hand.
- **Orders to the owner's real sockets** (candidate tests) only with the owner's agreement.

## Tech

Node 24, TypeScript strict, ESM. `npm run build` type-checks with `tsc` and bundles `src/index.ts` into a **single** `dist/index.js` (esbuild): the core cache-busts only the entry file when it reloads an updated recipe, so a multi-file `dist/` would keep running the old version of every other file until Sowel restarts (core issue mchacher/sowel#1073). Keep it one file. Vitest with fake timers. ESLint + Prettier as in the core. `console.*` is an error: log through `ctx.log` / `ctx.logger`.

```bash
npm install
npm run validate        # typecheck, typecheck:tests, lint, format:check, test, build, specs index — what CI runs
npx vitest run <file>   # one test file
```

## Git workflow

- Feature branches for anything non-trivial: `feat/`, `fix/`, `refactor/`, `docs/`. Main is protected (PR required, linear history, CI green).
- Conventional commits. Scopes: `decide`, `presence`, `sockets`, `tile`, `manifest`, `ci`.
- **Never merge a PR without explicit user approval** ("oui", "merge", "go").
- **Never add `Co-Authored-By: Claude` lines** in commit messages or PR bodies.
- Every new `specs/NNN-name/` folder needs `spec.md`, `architecture.md`, `plan.md` **and a row in `docs/specs-index.md`**.
- A release is a PR (version bump in `package.json` **and** `manifest.json`, changelog entry), a tag on main, then the **registry hash bump in the core** (spec 089). See the `heating-release` skill.

## Skills

| Skill             | When                                                         |
| ----------------- | ------------------------------------------------------------ |
| `heating-feature` | Implementing a feature: spec, branch, tests, PR.             |
| `heating-release` | Bumping, tagging, publishing, and bumping the registry hash. |

## Answering the user

Short and ordered. One or two lines for the what, one bullet per finding or decision. French or English, whichever the user uses.
