import { describe, expect, it } from "vitest";
import { createRecipe, RECIPE_ID } from "./index.js";

describe("createRecipe", () => {
  it("declares the smart-socket-heating identity", () => {
    expect(createRecipe().id).toBe(RECIPE_ID);
  });
});
