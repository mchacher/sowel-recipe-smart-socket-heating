# Sowel recipe: smart-socket-heating

Heats a room through a smart socket for [Sowel](https://docs.sowel.org): an electric radiator plugged into a socket (core `switch`), a temperature sensor in the room, the presence the zone's motion sensors give.

- **Comfort** while someone is in the room, **eco** after a time without motion, an optional **night** setpoint over a time window.
- **On/off regulation** from the sensor, ±0.2 °C around the setpoint, at least 5 minutes between two switches.
- **Safety**: the sockets are cut at 25 °C, and when the sensor has been silent for 90 minutes.
- A socket switched by hand is left alone until the room has been empty for the absence delay.
- A **Dashboard tile** shows the setpoint, the temperature and whether the radiator heats, with an auto / comfort / eco / off control.

## Before you start

- **Set the radiator's own thermostat above the comfort setpoint** (or at its maximum). The recipe can only cut the power; below the radiator's own setting the socket stays on and the tile reads "radiateur au repos".
- **The sensor's reporting sets how closely the room is followed.** A sensor that reports every 30 minutes lets the room overshoot; configure it to report on a 0.2 °C change where it allows (Zigbee2MQTT: device → Reporting, `msTemperatureMeasurement`).

## Parameters

| Parameter          | Default | Meaning                                                 |
| ------------------ | ------- | ------------------------------------------------------- |
| Zone               | current | The zone whose motion sensors give the presence         |
| Temperature sensor | —       | The room's temperature                                  |
| Heaters            | —       | The sockets feeding the radiators                       |
| Comfort (°C)       | 20      | Setpoint while someone is there                         |
| Eco (°C)           | 17      | Setpoint after the absence delay                        |
| Absence delay      | 30m     | Time without motion before the room counts as empty     |
| Night start / end  | —       | Optional night window (may cross midnight)              |
| Night (°C)         | —       | Setpoint during the night window, whatever the presence |

## Development

```bash
npm install
npm run validate
```

Install on a Sowel instance through a personal source (core spec 136) until the recipe is in the registry.

## License

AGPL-3.0, like Sowel.
