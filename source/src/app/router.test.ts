import { describe, expect, it } from "vitest";
import { parseRoute, routeToHash } from "./router";

describe("parseRoute", () => {
  it("maps the empty hash and root to mission select", () => {
    expect(parseRoute("")).toEqual({ name: "select" });
    expect(parseRoute("#/")).toEqual({ name: "select" });
  });

  it("parses and decodes briefing routes", () => {
    expect(parseRoute("#/briefing/earth-observation")).toEqual({
      name: "briefing",
      scenarioId: "earth-observation",
    });
    expect(parseRoute("#/briefing/earth%20observation")).toEqual({
      name: "briefing",
      scenarioId: "earth observation",
    });
  });

  it("parses and decodes workbench routes", () => {
    expect(parseRoute("#/workbench/earth-observation")).toEqual({
      name: "workbench",
      scenarioId: "earth-observation",
    });
    expect(parseRoute("#/workbench/mars%20flyby")).toEqual({
      name: "workbench",
      scenarioId: "mars flyby",
    });
  });

  it("returns not-found for unknown paths", () => {
    expect(parseRoute("#/workbench")).toEqual({ name: "not-found" });
    expect(parseRoute("#/briefing/")).toEqual({ name: "not-found" });
    expect(parseRoute("#/briefing/a/b")).toEqual({ name: "not-found" });
  });
});

describe("routeToHash", () => {
  it("round-trips routes", () => {
    for (const hash of [
      "#/",
      "#/briefing/earth-observation",
      "#/briefing/mars-flyby",
      "#/workbench/earth-observation",
      "#/workbench/mars-flyby",
    ]) {
      expect(routeToHash(parseRoute(hash))).toBe(hash);
    }
  });
});
