# Changelog

All notable changes to this recipe. Versions follow semver; the registry in `mchacher/sowel` carries the SHA256 of each released tarball.

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
