/**
 * The slice of Sowel's recipe API this recipe uses, mirrored by hand from
 * `src/shared/types.ts` and `src/recipes/engine/recipe.ts` in mchacher/sowel.
 * Recipes never import the core. Extend when a new member is needed; never
 * widen a type to make something compile.
 */

export interface RecipeSlotDef {
  id: string;
  name: string;
  description: string;
  type: "zone" | "equipment" | "number" | "duration" | "time" | "boolean" | "text" | "select";
  required: boolean;
  list?: boolean;
  defaultValue?: unknown;
  constraints?: {
    equipmentType?: string | string[];
    min?: number;
    max?: number;
    crossZone?: boolean;
  };
  group?: string;
}

export interface RecipeLangPack {
  name: string;
  description: string;
  slots?: Record<string, { name: string; description: string }>;
  groups?: Record<string, string>;
}

export interface RecipeActionDef {
  id: string;
  type: "cycle";
  stateKey: string;
  options: { value: string; label: string }[];
}

export interface RecipeTile {
  icon: string;
  summaryKey?: string;
  countdownKey?: string;
  actions?: string[];
}

export interface RecipeInstanceHandle {
  stop(): void;
  onAction?(action: string, payload?: Record<string, unknown>): void;
}

export interface RecipeDefinition {
  id: string;
  name: string;
  description: string;
  slots: RecipeSlotDef[];
  actions?: RecipeActionDef[];
  tile?: RecipeTile;
  i18n?: Record<string, RecipeLangPack>;
  validate(params: Record<string, unknown>, ctx: RecipeContext): void;
  createInstance(params: Record<string, unknown>, ctx: RecipeContext): RecipeInstanceHandle;
}

export interface Equipment {
  id: string;
  name: string;
  type: string;
}

export interface DataBindingValue {
  alias: string;
  value: unknown;
  /** ISO instant of the last report, changed or not; null when never reported. */
  lastUpdated?: string | null;
}

export interface OrderBindingLike {
  alias: string;
  enumValues?: string[];
}

export interface EquipmentManager {
  getById(id: string): Equipment | null;
  getDataBindingsWithValues(id: string): DataBindingValue[];
  getOrderBindingsWithDetails(id: string): OrderBindingLike[];
}

export interface ZoneAggregatedData {
  motion: boolean;
  motionSensors: number;
}

export interface DispatchResult {
  success: boolean;
  error?: string;
}

export interface DataChangedEvent {
  type: "equipment.data.changed";
  equipmentId: string;
  alias: string;
  value: unknown;
  previous: unknown;
}

export interface ZoneChangedEvent {
  type: "zone.data.changed";
  zoneId: string;
  aggregatedData: ZoneAggregatedData;
}

export interface RecipeLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
  debug(obj: Record<string, unknown>, msg: string): void;
}

export interface RecipeContext {
  eventBus: { onType(type: string, handler: (event: unknown) => void): () => void };
  equipmentManager: EquipmentManager;
  zoneAggregator: { getByZoneId(zoneId: string): ZoneAggregatedData | null };
  logger: RecipeLogger;
  state: {
    get(key: string): unknown;
    set(key: string, value: unknown): void;
    delete(key: string): void;
  };
  log(message: string, level?: "info" | "warn" | "error"): void;
  dispatchOrder(equipmentId: string, alias: string, value: unknown): Promise<DispatchResult>;
}
