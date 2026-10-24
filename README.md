# Sowel recipe: Socket Heating (Chauffage sur prise)

Recipe id `smart-socket-heating`.

Heats a room through a smart socket for [Sowel](https://docs.sowel.org): an electric radiator plugged into a socket (core `switch`). Everything comes from the room (the recipe's zone): the presence its motion sensors give, the temperature its sensors read, the sockets and buttons it holds.

- **Comfort** while someone is in the room, **eco** after a time without motion, an optional **night** setpoint over a time window.
- **Cocoon**: a warmer setpoint switched on by a tap on the tile or a press on a button, and off by the next press, an absence, the start of the night window or another mode.
- **On/off regulation** from the room's temperature (the average of its sensors), ±0.2 °C around the setpoint, at least 5 minutes between two switches.
- **Safety**: the sockets are cut at 25 °C, and when no sensor of the room has reported for 90 minutes.
- A socket switched by hand is left alone until the room has been empty for the absence delay.
- A **Dashboard tile** shows the setpoint, the temperature and whether the radiator heats, with an auto / cocoon / comfort / eco / off control. From auto, one tap starts cocoon.

## Before you start

- **Set the radiator's own thermostat above the comfort setpoint** (or at its maximum). The recipe can only cut the power; below the radiator's own setting the socket stays on and the tile reads "radiateur au repos".
- **The sensor's reporting sets how closely the room is followed.** A sensor that reports every 30 minutes lets the room overshoot; configure it to report on a 0.2 °C change where it allows (Zigbee2MQTT: device → Reporting, `msTemperatureMeasurement`).

## Parameters

| Parameter         | Default | Meaning                                                 |
| ----------------- | ------- | ------------------------------------------------------- |
| Zone              | current | The room: its motion and temperature sensors are used   |
| Heaters           | —       | The room's sockets feeding the radiators                |
| Comfort (°C)      | 20      | Setpoint while someone is there                         |
| Eco (°C)          | 17      | Setpoint after the absence delay                        |
| Absence delay     | 30m     | Time without motion before the room counts as empty     |
| Night start / end | —       | Optional night window (may cross midnight)              |
| Night (°C)        | —       | Setpoint during the night window, whatever the presence |
| Cocoon (°C)       | —       | Cocoon setpoint; without it, cocoon is not offered      |
| Cocoon buttons    | —       | The room's buttons switching cocoon on and off          |

## Development

```bash
npm install
npm run validate
```

Install on a Sowel instance through a personal source (core spec 136) until the recipe is in the registry.

## License

AGPL-3.0, like Sowel.
