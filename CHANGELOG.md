# Changelog

All notable changes to this recipe. Versions follow semver; the registry in `mchacher/sowel` carries the SHA256 of each released tarball.

## v0.4.0

Confirmed presence (spec 005).

- **A lone detection no longer heats an empty room.** Motion counts once it lasts 2 minutes or repeats within 5 minutes; an isolated detection is ignored and logged ("Mouvement isolé ignoré"). In an occupied room motion counts at once, as before.
- **The heating is cut as soon as the room is empty**, without waiting for the 5 minute minimum between two switches.

## v0.3.1

- **Cocoon up to 26 °C** (spec 004). Comfort, eco and night stay at 24 °C at most.
- **Safety cut at 28 °C** instead of 25 °C, still on the hottest reading of the room and still immediate.

## v0.3.0

Everything from the room (spec 003).

- **No temperature sensor to pick.** The temperature is the average of the room's sensors (its sub-zones included, sockets left out). A sensor quiet for 90 minutes drops out; with none left, the heating is cut as before. The 25 °C cut looks at the hottest reading.
- **The form proposes only the room's sockets and cocoon buttons**, all of them, without asking for a zone.
- **Updates load all the new code.** The recipe ships as a single bundled file. With 0.2.0, an update from the UI kept the 0.1.0 parameters until Sowel restarted (core issue mchacher/sowel#1073).

## v0.2.0

Cocoon, and a new name (spec 002).

- **Cocoon**: optional cocoon temperature and buttons. A tap on the tile (auto → cocoon) or a button press starts a warmer setpoint, which wins over the night window. The next press, the absence delay, the start of the night window or another mode ends it, back to auto; a socket switched by hand stays alone until a press or a picked mode. The tile counts down to its end on absence.
- **Renamed** "Chauffage sur prise" / "Socket Heating". The recipe id `smart-socket-heating` and the installed instances do not change.

## v0.1.0

First release (spec 001). Heats a room through smart sockets feeding electric radiators, from a temperature sensor:

- **Comfort** while someone is in the zone, **eco** after the absence delay, an optional **night** setpoint over a time window.
- **On/off regulation** at ±0.2 °C around the setpoint, at least 5 minutes between two switches.
- **Safety**: the sockets are cut at 25 °C, and when the sensor has been silent for 90 minutes.
- A socket switched by hand (Sowel, its own button, another automation) is left alone until the room has been empty for the absence delay, or until a mode is picked.
- **Dashboard tile**: setpoint, temperature, whether the radiator heats or rests on its own thermostat, and an auto / comfort / eco / off control.
