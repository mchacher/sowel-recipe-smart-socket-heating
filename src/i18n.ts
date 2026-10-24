import type { RecipeActionDef, RecipeLangPack, RecipeSlotDef } from "./sowel-types.js";

export const SLOTS: RecipeSlotDef[] = [
  // Every recipe declares its zone: the form fills it with the current zone,
  // and a zone's Behaviours list shows the instances whose `zone` is that zone.
  {
    id: "zone",
    name: "Zone",
    description: "The zone whose motion sensors give the presence",
    type: "zone",
    required: true,
  },
  {
    id: "temperatureSensor",
    name: "Temperature sensor",
    description: "The room's temperature",
    type: "equipment",
    required: true,
    constraints: { crossZone: true },
  },
  {
    id: "heaters",
    name: "Heaters",
    description: "The smart sockets feeding the radiators",
    type: "equipment",
    required: true,
    list: true,
    constraints: { equipmentType: "switch", crossZone: true },
  },
  {
    id: "comfortTemp",
    name: "Comfort (°C)",
    description: "Setpoint while someone is there",
    type: "number",
    required: true,
    defaultValue: 20,
    constraints: { min: 5, max: 24 },
  },
  {
    id: "ecoTemp",
    name: "Eco (°C)",
    description: "Setpoint after the absence delay",
    type: "number",
    required: true,
    defaultValue: 17,
    constraints: { min: 5, max: 24 },
  },
  {
    id: "timeout",
    name: "Absence delay",
    description: "Time without motion before the room counts as empty",
    type: "duration",
    required: true,
    defaultValue: "30m",
  },
  {
    id: "nightStart",
    name: "Night start",
    description: "Start of the night window (HH:MM)",
    type: "time",
    required: false,
    group: "night",
  },
  {
    id: "nightEnd",
    name: "Night end",
    description: "End of the night window (HH:MM), may cross midnight",
    type: "time",
    required: false,
    group: "night",
  },
  {
    id: "nightTemp",
    name: "Night (°C)",
    description: "Setpoint during the night window, whatever the presence",
    type: "number",
    required: false,
    group: "night",
    constraints: { min: 5, max: 24 },
  },
];

/** FR2 — the mode the tile and the zone page cycle through. */
export const ACTIONS: RecipeActionDef[] = [
  {
    id: "set_mode",
    type: "cycle",
    stateKey: "mode",
    options: [
      { value: "auto", label: "Auto" },
      { value: "comfort", label: "Comfort" },
      { value: "eco", label: "Eco" },
      { value: "off", label: "Off" },
    ],
  },
];

export const NAME = "Smart Socket Heating";
export const DESCRIPTION =
  "Heats a room through a smart socket from a temperature sensor: comfort when someone is there, eco after an absence, an optional night setpoint. Cuts at 25 °C and when the sensor goes silent.";

export const I18N: Record<string, RecipeLangPack> = {
  en: { name: NAME, description: DESCRIPTION, groups: { night: "Night" } },
  fr: {
    name: "Chauffage malin sur prise",
    description:
      "Chauffe une pièce par une prise connectée à partir d'un capteur de température : confort quand quelqu'un est là, eco après une absence, une consigne de nuit en option. Coupe à 25 °C et quand le capteur se tait.",
    slots: {
      zone: { name: "Zone", description: "La zone dont les détecteurs donnent la présence" },
      temperatureSensor: {
        name: "Capteur de température",
        description: "La température de la pièce",
      },
      heaters: { name: "Radiateurs", description: "Les prises connectées des radiateurs" },
      comfortTemp: { name: "Confort (°C)", description: "Consigne quand quelqu'un est là" },
      ecoTemp: { name: "Eco (°C)", description: "Consigne après le délai d'absence" },
      timeout: {
        name: "Délai d'absence",
        description: "Temps sans mouvement avant que la pièce soit considérée vide",
      },
      nightStart: { name: "Début de nuit", description: "Début de la plage de nuit (HH:MM)" },
      nightEnd: {
        name: "Fin de nuit",
        description: "Fin de la plage de nuit (HH:MM), peut passer minuit",
      },
      nightTemp: {
        name: "Nuit (°C)",
        description: "Consigne pendant la plage de nuit, présence ou pas",
      },
    },
    groups: { night: "Nuit" },
  },
};
