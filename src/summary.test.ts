import { describe, expect, it } from "vitest";
import type { Decision } from "./decide.js";
import { heatOf, type SocketView } from "./inputs.js";
import { summaryOf } from "./summary.js";

const comfort: Decision = { status: "comfort", setpoint: 20, want: "leave", immediate: false };

function socket(over: Partial<SocketView>): SocketView {
  return { id: "s", state: true, power: 0, hasPower: true, ...over };
}

describe("summaryOf (FR11)", () => {
  it("says the radiator heats when the socket draws power", () => {
    expect(summaryOf(comfort, 19.4, heatOf([socket({ power: 1200 })]))).toBe(
      "Confort 20° · 19,4° · chauffe",
    );
  });

  it("says the radiator rests when the socket is on but draws nothing", () => {
    expect(summaryOf(comfort, 19.4, heatOf([socket({ power: 0 })]))).toBe(
      "Confort 20° · 19,4° · radiateur au repos",
    );
  });

  it("counts a socket without a power binding as heating", () => {
    expect(heatOf([socket({ hasPower: false, power: null })])).toBe("heating");
  });

  it("shows nothing more when the sockets are off", () => {
    const eco: Decision = { status: "eco", setpoint: 17, want: "off", immediate: false };
    expect(summaryOf(eco, 18.2, heatOf([socket({ state: false })]))).toBe("Eco 17° · 18,2°");
  });

  it("shows a half-degree setpoint and the night label", () => {
    const night: Decision = { status: "night", setpoint: 15.5, want: "leave", immediate: false };
    expect(summaryOf(night, 16, "off")).toBe("Nuit 15,5° · 16°");
  });

  it("shows the cocoon label", () => {
    const cocoon: Decision = { status: "cocoon", setpoint: 23, want: "on", immediate: false };
    expect(summaryOf(cocoon, 21.4, "heating")).toBe("Cocoon 23° · 21,4° · chauffe");
  });

  it("covers manual, off, safety and silent", () => {
    const d = (status: Decision["status"]): Decision => ({
      status,
      setpoint: null,
      want: "off",
      immediate: true,
    });
    expect(summaryOf(d("manual"), 19.4, "heating")).toBe("Manuel · 19,4°");
    expect(summaryOf(d("off"), 19.4, "off")).toBe("Arrêt");
    expect(summaryOf(d("safety"), 25.3, "off")).toBe("Sécurité · 25,3°");
    expect(summaryOf(d("silent"), null, "off")).toBe("Capteur muet");
  });
});
