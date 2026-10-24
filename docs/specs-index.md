# Specs index — sowel-recipe-smart-socket-heating

Every feature ever specified in this repository, one row each, newest last. A
CI check (`scripts/check-specs-index.sh`) fails a pull request that creates a
`specs/NNN-name/` folder without its row here.

Status: 📝 Draft · 🚧 In progress · ✅ Shipped

| #   | Title                                                              | Status | Summary                                                                                                                                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 001 | Smart socket heating: presence setpoint, on/off regulation, safety | 🚧     | Sockets (`switch`) feeding radiators, regulated on/off (±0.2 °C, 5 min minimum cycle) from a temperature sensor; setpoint comfort on presence, eco after a timeout, optional night window; cuts at 25 °C and on a sensor silent 90 min; manual hold until the next absence; tile with an auto/comfort/eco/off mode. |
