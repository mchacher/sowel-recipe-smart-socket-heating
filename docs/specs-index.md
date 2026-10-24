# Specs index — sowel-recipe-smart-socket-heating

Every feature ever specified in this repository, one row each, newest last. A
CI check (`scripts/check-specs-index.sh`) fails a pull request that creates a
`specs/NNN-name/` folder without its row here.

Status: 📝 Draft · 🚧 In progress · ✅ Shipped

| #   | Title                                                                           | Status | Summary                                                                                                                                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 001 | Smart socket heating: presence setpoint, on/off regulation, safety              | 🚧     | Sockets (`switch`) feeding radiators, regulated on/off (±0.2 °C, 5 min minimum cycle) from a temperature sensor; setpoint comfort on presence, eco after a timeout, optional night window; cuts at 25 °C and on a sensor silent 90 min; manual hold until the next absence; tile with an auto/comfort/eco/off mode. |
| 002 | Cocoon boost from the tile or a button; renamed "Chauffage sur prise"           | 🚧     | Optional `cocoonTemp` and `buttons`: a tile tap or a button press starts a cocoon setpoint, ended by the next press, an absence, the night start or another mode; recipe shown as "Chauffage sur prise" / "Socket Heating".                                                                                         |
| 003 | Everything from the room: temperature, sockets and buttons of the recipe's zone | 🚧     | No sensor slot: the temperature is the average of the zone's live `temperature` readings (sub-zones included, sockets excepted); sockets and buttons offered from the zone only (no `crossZone`); single-file build (core #1073).                                                                                   |
| 004 | Cocoon up to 26 °C, safety cut at 28 °C                                         | 🚧     | `cocoonTemp` accepts 5–26 °C (other setpoints stay 5–24); the safety cut moves from 25 to 28 °C, on the hottest reading. Amends specs 001 and 002.                                                                                                                                                                  |
