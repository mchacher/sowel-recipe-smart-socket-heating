# Spec 003 — Architecture

| File                         | Change                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| `src/i18n.ts`                | `temperatureSensor` removed; `heaters`, `buttons` without `crossZone`                                   |
| `src/inputs.ts`              | `temperatureSources(em, zoneIds, exclude)`, `readZoneTemperature(em, ids, now)` replace `readSensor`    |
| `src/index.ts`               | Params without `sensorId`; validation of the zone's sources; `temperature` events from any source; logs |
| `src/sowel-types.ts`         | `Equipment.zoneId`, `EquipmentManager.getByZone`, `RecipeContext.zoneManager.getDescendantIds`          |
| `src/testing/ctx.testing.ts` | Equipments carry a zone; `getByZone`, `getDescendantIds`                                                |
| `package.json`               | `build`: `tsc --noEmit` then an esbuild bundle to `dist/index.js`                                       |

## Core APIs added

| API                                        | Use                                            |
| ------------------------------------------ | ---------------------------------------------- |
| `ctx.zoneManager.getDescendantIds(zoneId)` | The zone and its sub-zones (aggregation scope) |
| `ctx.equipmentManager.getByZone(zoneId)`   | The equipments of each of those zones          |

The core's own zone temperature (`aggregatedData.temperature`) is not used: it keeps a quiet sensor's last value in the average and carries no timestamp, so the silent rule (spec 001 FR7) could not be kept.
