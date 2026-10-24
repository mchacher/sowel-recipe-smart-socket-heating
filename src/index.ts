/**
 * Sowel recipe: smart-socket-heating
 *
 * Skeleton: it declares the recipe. The decision logic, the socket actions
 * and the lifecycle arrive with spec 001.
 */

export const RECIPE_ID = "smart-socket-heating";

interface RecipeInstanceHandle {
  stop(): void;
}

export interface RecipeDefinitionLike {
  id: string;
  name: string;
  description: string;
  slots: unknown[];
  validate(params: Record<string, unknown>, ctx: unknown): void;
  createInstance(params: Record<string, unknown>, ctx: unknown): RecipeInstanceHandle;
}

export function createRecipe(): RecipeDefinitionLike {
  return {
    id: RECIPE_ID,
    name: "Smart Socket Heating",
    description: "Heats a room through a smart socket from a temperature sensor.",
    slots: [],
    validate() {
      throw new Error("smart-socket-heating is not implemented yet (spec 001)");
    },
    createInstance() {
      return { stop() {} };
    },
  };
}
