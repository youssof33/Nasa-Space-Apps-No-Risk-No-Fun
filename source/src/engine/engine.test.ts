import { describe, expect, it } from "vitest";

import { catalogs, busComponents, orbits, scenarios } from "../data/catalogs";
import { validateCatalogs } from "../data/catalog-validation";
import { orbitalPeriodHours } from "../data/orbit-math";
import type { MissionDesign, PartQuantity, Scenario } from "../data/types";
import { enumerateDesigns, evaluateDesign, recommendedBus } from "./index";
import {
  effectiveDownlinkMbps,
  linkMarginDb,
  marginSeverity,
  parallelSurvivalProbability,
  resourceMarginFraction,
  rocketEquationDeltaVms,
  solarOrbitAveragePowerW,
  survivalProbabilityAfterYears,
} from "./physics";
import { getOrbit } from "./lookup";

const earthScenario = scenarios.find((scenario) => scenario.id === "earth-observation");

if (!earthScenario) {
  throw new Error("Earth observation test scenario is missing.");
}
const earthObservationScenario: Scenario = earthScenario;

const baselineDesign: MissionDesign = {
  scenarioId: earthObservationScenario.id,
  instruments: [{ id: "thermal-radiometer", qty: 1 }],
  busComponents: [
    "cubesat-structure",
    "deployable-solar-array",
    "lithium-battery",
    "basic-flight-computer",
    "basic-adcs",
    "low-gain-antenna",
    "solid-state-recorder",
    "cold-gas-propulsion",
  ].map((id) => ({ id, qty: 1 })),
  launcherId: "electron",
  orbitId: "SSO",
  operationsPlan: {
    dutyCyclePercent: 0.5,
    downlinkStrategy: "scheduled",
    missionDurationMonths: 12,
    operationsCostMPerMonth: 0.25,
  },
};

function scenarioForOutcomeCases(): Scenario {
  return {
    ...earthObservationScenario,
    threshold: {
      ...earthObservationScenario.threshold,
      minScienceScorePoints: 0.05,
      dataReturnGB: 0,
      minLifetimeMonths: 1,
    },
    baseline: {
      ...earthObservationScenario.baseline,
      minScienceScorePoints: 0.06,
      dataReturnGB: 0,
      minLifetimeMonths: 1,
    },
  };
}

function withDutyCycle(
  design: MissionDesign,
  dutyCyclePercent: number,
): MissionDesign {
  return {
    ...design,
    operationsPlan: { ...design.operationsPlan, dutyCyclePercent },
  };
}

describe("deterministic mission evaluation", () => {
  it("calculates the rocket equation for a hand-checkable case", () => {
    expect(rocketEquationDeltaVms(60, 2.5, 65)).toBeCloseTo(27.1, 1);
  });

  it("calculates exact mass margins and classifies hard-margin boundaries", () => {
    expect(resourceMarginFraction(135, 100)).toBeCloseTo(0.35, 12);
    expect(resourceMarginFraction(134, 100)).toBeCloseTo(0.34, 12);
    expect(marginSeverity(0.35, 0.35)).toBe("ok");
    expect(marginSeverity(0.34, 0.35)).toBe("warning");
    expect(marginSeverity(-0.01, 0.35)).toBe("fail");
  });

  it("calculates orbit-average power using eclipse and system losses", () => {
    expect(solarOrbitAveragePowerW(1361, 0.4, 0.29, 0.36, 0, 0)).toBeCloseTo(
      75.8,
      1,
    );
  });

  it("counts duplicate arrays and batteries from MissionDesign quantities", () => {
    const scenario = scenarioForOutcomeCases();
    const single = evaluateDesign(baselineDesign, scenario, { difficulty: "easy" });
    const doubled = evaluateDesign(
      {
        ...baselineDesign,
        busComponents: baselineDesign.busComponents.map((part) =>
          part.id === "deployable-solar-array" || part.id === "lithium-battery"
            ? { ...part, qty: 2 }
            : part,
        ),
      },
      scenario,
      { difficulty: "easy" },
    );
    expect(doubled.metrics.peakPowerGenerationW).toBeCloseTo(
      single.metrics.peakPowerGenerationW * 2,
      12,
    );
    expect(doubled.metrics.usableBatteryEnergyWh).toBeCloseTo(
      single.metrics.usableBatteryEnergyWh * 2,
      12,
    );
  });

  it("reports different resource margin targets for Easy and Hard", () => {
    const scenario = scenarioForOutcomeCases();
    const easy = evaluateDesign(baselineDesign, scenario, { difficulty: "easy" });
    const hard = evaluateDesign(baselineDesign, scenario, { difficulty: "hard" });
    expect(easy.findings.find((finding) => finding.id === "mass-wet-margin")?.limit).toBe(
      20,
    );
    expect(hard.findings.find((finding) => finding.id === "mass-wet-margin")?.limit).toBe(
      35,
    );
  });

  it("applies inverse-square link loss and the calibrated antenna-gain gap", () => {
    expect(
      linkMarginDb(3, 2000) - linkMarginDb(3, 1000),
    ).toBeCloseTo(-6.02, 2);
    expect(linkMarginDb(18, 1000) - linkMarginDb(3, 1000)).toBe(15);
    expect(effectiveDownlinkMbps(1, -10)).toBeCloseTo(0.1, 12);
  });

  it("models annual reliability over time and parallel redundancy", () => {
    expect(survivalProbabilityAfterYears(0.96, 2)).toBeCloseTo(0.9216, 12);
    expect(parallelSurvivalProbability(0.97, 2)).toBeCloseTo(0.9991, 4);
  });

  it("reports data loss and shows that more recorder capacity reduces it", () => {
    const scenario = scenarioForOutcomeCases();
    const compactRecorder = evaluateDesign(
      withDutyCycle(baselineDesign, 100),
      scenario,
      { difficulty: "easy" },
    );
    const largerRecorder = evaluateDesign(
      {
        ...withDutyCycle(baselineDesign, 100),
        busComponents: baselineDesign.busComponents.map((part) =>
          part.id === "solid-state-recorder" ? { ...part, qty: 2 } : part,
        ),
      },
      scenario,
      { difficulty: "easy" },
    );
    expect(compactRecorder.metrics.lostDataGB).toBeGreaterThan(0);
    expect(largerRecorder.metrics.lostDataGB).toBeLessThan(
      compactRecorder.metrics.lostDataGB,
    );
  });

  it("limits transfer data generation to encounter and downlink to remaining cruise", () => {
    const marsScenario = scenarios.find((scenario) => scenario.id === "mars-flyby");
    if (!marsScenario) throw new Error("Mars flyby scenario is missing.");
    const marsDesign: MissionDesign = {
      scenarioId: marsScenario.id,
      instruments: [{ id: "planetary-camera", qty: 1 }],
      busComponents: [
        "cubesat-structure",
        "deployable-solar-array",
        "lithium-battery",
        "basic-flight-computer",
        "basic-adcs",
        "high-gain-antenna",
        "solid-state-recorder",
      ].map((id) => ({ id, qty: 1 })),
      launcherId: "vega-class",
      orbitId: "MARS_TRANSFER",
      operationsPlan: {
        dutyCyclePercent: 100,
        downlinkStrategy: "scheduled",
        missionDurationMonths: 12,
        operationsCostMPerMonth: 0,
      },
    };
    const result = evaluateDesign(marsDesign, marsScenario, { difficulty: "easy" });
    expect(result.metrics.generatedDataGB).toBeCloseTo(25.92, 12);
    expect(result.metrics.downlinkCapacityGB).toBeCloseTo(651.9846, 3);
    expect(result.metrics.returnedDataGB).toBeCloseTo(25.92, 12);
    expect(
      result.findings.some((finding) => finding.severity === "fail"),
    ).toBe(true);
    expect(result.outcome).toBe("failure");

    const deepSpaceDesign: MissionDesign = {
      ...marsDesign,
      busComponents: marsDesign.busComponents.map((part) =>
        part.id === "high-gain-antenna"
          ? { ...part, id: "deep-space-antenna" }
          : part,
      ),
    };
    const deepSpaceResult = evaluateDesign(deepSpaceDesign, marsScenario, {
      difficulty: "easy",
    });
    expect(deepSpaceResult.metrics.linkMarginDb).toBeCloseTo(3, 12);
    expect(deepSpaceResult.findings.every((finding) => finding.severity !== "fail")).toBe(
      true,
    );
  });

  it("distinguishes failure, partial, and success against the same scenario", () => {
    const scenario = scenarioForOutcomeCases();
    const precisePointingDesign: MissionDesign = {
      ...baselineDesign,
      busComponents: baselineDesign.busComponents.map((part) =>
        part.id === "basic-adcs" ? { ...part, id: "precision-adcs" } : part,
      ),
    };
    const failure = evaluateDesign(
      withDutyCycle(precisePointingDesign, 0.01),
      scenario,
      { difficulty: "easy" },
    );
    const partial = evaluateDesign(
      withDutyCycle(precisePointingDesign, 0.08),
      scenario,
      { difficulty: "easy" },
    );
    const success = evaluateDesign(
      withDutyCycle(precisePointingDesign, 0.1),
      scenario,
      { difficulty: "easy" },
    );
    expect(failure.outcome).toBe("failure");
    expect(partial.outcome).toBe("partial");
    expect(success.outcome).toBe("success");
    expect(partial.findings.every((finding) => finding.severity !== "fail")).toBe(true);
    expect(success.findings.every((finding) => finding.severity !== "fail")).toBe(true);
    expect(partial.thresholdCriteria.every((criterion) => criterion.passed)).toBe(true);
    expect(partial.baselineCriteria.some((criterion) => !criterion.passed)).toBe(true);
  });

  it("returns an identical result object for identical inputs", () => {
    const scenario = scenarioForOutcomeCases();
    const first = evaluateDesign(baselineDesign, scenario, { difficulty: "easy" });
    const second = evaluateDesign(baselineDesign, scenario, { difficulty: "easy" });
    expect(second).toEqual(first);
  });

  it("keeps the previous bound-orbit period estimates within ten percent", () => {
    const previousPeriodsHours: Record<string, number> = {
      LEO: 1.6,
      SSO: 1.6,
      MEO: 6.5,
      GEO: 23.93,
      HEO: 12,
      LUNAR: 2,
    };
    for (const [orbitId, previousPeriodHours] of Object.entries(previousPeriodsHours)) {
      const orbit = orbits.find((candidate) => candidate.id === orbitId);
      if (!orbit) throw new Error(`Missing orbit fixture: ${orbitId}`);
      expect(
        Math.abs(orbitalPeriodHours(orbit) - previousPeriodHours) / previousPeriodHours,
      ).toBeLessThan(0.1);
    }
    expect(() => orbitalPeriodHours(getOrbit("MARS_TRANSFER"))).toThrow(RangeError);
  });

  it("provides quantity-capped design enumeration and a recommended bus", () => {
    const designs = enumerateDesigns(earthObservationScenario);
    const first = designs.next();
    expect(first.done).toBe(false);
    if (!first.value) throw new Error("Design enumeration produced no designs.");
    expect(
      first.value.busComponents.every(
        (part: PartQuantity) => part.qty > 0 && part.qty <= 2,
      ),
    ).toBe(true);
    expect(
      recommendedBus(earthObservationScenario).some(
        (part) => part.id === "solid-state-recorder",
      ),
    ).toBe(true);
    expect(first.value.operationsPlan.operationsCostMPerMonth).toBe(
      earthObservationScenario.defaultOperationsCostMPerMonth,
    );
    const recommendedCategories = new Set(
      recommendedBus(earthObservationScenario).map(
        ({ id }) => busComponents.find((component) => component.id === id)?.category,
      ),
    );
    expect(recommendedCategories.size).toBe(8);
    expect(busComponents.some((component) => component.category === "dataStorage")).toBe(
      true,
    );
  });

  it("validates evaluator-confirmed success and partial coverage for every scenario", () => {
    expect(scenarios).toHaveLength(4);
    expect(() => validateCatalogs(catalogs)).not.toThrow();
  }, 30_000);

});
