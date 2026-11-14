import { enumerateDesigns, evaluateDesign } from "../engine/evaluation";
import {
  effectiveDownlinkMbps,
  linkMarginDb,
} from "../engine/physics";
import {
  MAXIMUM_ENUMERATED_INSTRUMENT_COUNT,
  SECONDS_PER_DAY,
  SECONDS_PER_MINUTE,
} from "../engine/constants";
import type {
  BodyId,
  BusComponent,
  Instrument,
  Launcher,
  MissionEvent,
  Orbit,
  Scenario,
  ScienceTag,
} from "./types";

export interface MissionCatalogs {
  instruments: Instrument[];
  busComponents: BusComponent[];
  launchers: Launcher[];
  orbits: Orbit[];
  scenarios: Scenario[];
  events: MissionEvent[];
}

export function validateCatalogs(catalogs: MissionCatalogs): void {
  assertUniqueIds(catalogs.instruments, "instrument");
  assertUniqueIds(catalogs.busComponents, "bus component");
  assertUniqueIds(catalogs.launchers, "launcher");
  assertUniqueIds(catalogs.orbits, "orbit");
  assertUniqueIds(catalogs.scenarios, "scenario");
  assertUniqueIds(catalogs.events, "event");
  validatePositiveCatalogValues(catalogs);
  validateCrossReferences(catalogs);
  validatePartDominance(catalogs);
  validateScenarioFeasibility(catalogs);
}

function assertUniqueIds(items: Array<{ id: string }>, label: string): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) {
      throw new Error(`Duplicate ${label} id: ${item.id}`);
    }
    seen.add(item.id);
  }
}

function validatePositiveCatalogValues(catalogs: MissionCatalogs): void {
  for (const instrument of catalogs.instruments) {
    assertPositive(instrument.massKg, `${instrument.id}.massKg`);
    assertPositive(instrument.costM, `${instrument.id}.costM`);
    assertNonNegative(instrument.powerW, `${instrument.id}.powerW`);
    assertPositive(instrument.dataRateMbps, `${instrument.id}.dataRateMbps`);
    assertPositive(instrument.scienceValuePoints, `${instrument.id}.scienceValuePoints`);
    assertFraction(
      instrument.reliabilityProbability,
      `${instrument.id}.reliabilityProbability`,
    );
    assertPositive(instrument.requiredPointingArcsec, `${instrument.id}.requiredPointingArcsec`);
  }
  for (const component of catalogs.busComponents) {
    assertPositive(component.massKg, `${component.id}.massKg`);
    assertPositive(component.costM, `${component.id}.costM`);
    assertNonNegative(component.powerW, `${component.id}.powerW`);
    const performance = component.performance;
    for (const [field, value] of Object.entries(performance)) {
      if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
        throw new RangeError(`${component.id}.performance.${field} must be finite and non-negative.`);
      }
    }
    assertFraction(performance.solarEfficiencyFraction, `${component.id}.solarEfficiencyFraction`);
    assertFraction(
      performance.maxDepthOfDischargeFraction,
      `${component.id}.maxDepthOfDischargeFraction`,
    );
    assertFraction(performance.reliabilityProbability, `${component.id}.reliabilityProbability`);
    assertFraction(
      performance.radiationHardeningFraction,
      `${component.id}.radiationHardeningFraction`,
    );
  }
  for (const launcher of catalogs.launchers) {
    assertPositive(launcher.costM, `${launcher.id}.costM`);
    assertFraction(launcher.reliabilityProbability, `${launcher.id}.reliabilityProbability`);
    assertPositive(launcher.fairingDiameterM, `${launcher.id}.fairingDiameterM`);
    assertPositive(launcher.fairingHeightM, `${launcher.id}.fairingHeightM`);
    assertFraction(launcher.fixedOrbitRiskProbability, `${launcher.id}.fixedOrbitRiskProbability`);
    assertFraction(
      launcher.scheduleDelayRiskProbability,
      `${launcher.id}.scheduleDelayRiskProbability`,
    );
    for (const insertionClass of ["LEO", "SSO", "GTO", "TLI"] as const) {
      assertNonNegative(
        launcher.payloadKgByClass[insertionClass],
        `${launcher.id}.payloadKgByClass.${insertionClass}`,
      );
    }
  }
  for (const orbit of catalogs.orbits) {
    assertPositive(orbit.solarFluxWPerM2, `${orbit.id}.solarFluxWPerM2`);
    assertPositive(orbit.typicalLinkDistanceKm, `${orbit.id}.typicalLinkDistanceKm`);
    assertNonNegative(orbit.insertionDeltaVms, `${orbit.id}.insertionDeltaVms`);
    assertNonNegative(
      orbit.stationkeepingDeltaVmsPerYear,
      `${orbit.id}.stationkeepingDeltaVmsPerYear`,
    );
    assertNonNegative(orbit.deorbitDeltaVms, `${orbit.id}.deorbitDeltaVms`);
    assertFraction(orbit.eclipseFractionOfOrbit, `${orbit.id}.eclipseFractionOfOrbit`);
    assertNonNegative(orbit.contactMinutesPerDay, `${orbit.id}.contactMinutesPerDay`);
    if (orbit.kind === "bound") {
      assertPositive(orbit.perigeeAltKm ?? 0, `${orbit.id}.perigeeAltKm`);
      assertPositive(orbit.apogeeAltKm ?? 0, `${orbit.id}.apogeeAltKm`);
    } else {
      assertPositive(orbit.encounterWindowDays ?? 0, `${orbit.id}.encounterWindowDays`);
      assertPositive(orbit.closestApproachDistanceKm ?? 0, `${orbit.id}.closestApproachDistanceKm`);
      assertPositive(orbit.cruiseDurationDays ?? 0, `${orbit.id}.cruiseDurationDays`);
    }
  }
  for (const scenario of catalogs.scenarios) {
    assertPositive(scenario.availableBudgetM, `${scenario.id}.availableBudgetM`);
    assertNonNegative(
      scenario.defaultOperationsCostMPerMonth,
      `${scenario.id}.defaultOperationsCostMPerMonth`,
    );
    if (scenario.allowedOrbits.length === 0) {
      throw new RangeError(`${scenario.id}.allowedOrbits must not be empty.`);
    }
    for (const level of ["threshold", "baseline"] as const) {
      const requirements = scenario[level];
      assertPositive(
        requirements.minScienceScorePoints,
        `${scenario.id}.${level}.minScienceScorePoints`,
      );
      assertNonNegative(requirements.dataReturnGB, `${scenario.id}.${level}.dataReturnGB`);
      assertPositive(requirements.minLifetimeMonths, `${scenario.id}.${level}.minLifetimeMonths`);
    }
  }
}

function validateCrossReferences(catalogs: MissionCatalogs): void {
  const orbitIds = new Set(catalogs.orbits.map((orbit) => orbit.id));
  const eventIds = new Set(catalogs.events.map((event) => event.id));
  const bodies: BodyId[] = ["earth", "moon", "sun-transfer"];
  const scienceTags: ScienceTag[] = [
    "earth-imaging",
    "climate",
    "land",
    "magnetic-fields",
    "space-weather",
    "planetary-science",
    "minerals",
    "atmosphere",
    "temperature",
    "astronomy",
    "imaging",
    "radiation",
    "solar-wind",
    "lunar-surface",
  ];

  for (const instrument of catalogs.instruments) {
    for (const body of instrument.compatibleBodies) {
      if (!bodies.includes(body)) {
        throw new Error(`${instrument.id} references unknown body ${body}.`);
      }
    }
    for (const tag of instrument.scienceTags) {
      if (!scienceTags.includes(tag)) {
        throw new Error(`${instrument.id} references unknown science tag ${tag}.`);
      }
    }
  }
  for (const scenario of catalogs.scenarios) {
    for (const orbitId of scenario.allowedOrbits) {
      if (!orbitIds.has(orbitId)) {
        throw new Error(`${scenario.id} references unknown orbit ${orbitId}.`);
      }
    }
    for (const eventId of scenario.hiddenEventsPool) {
      if (!eventIds.has(eventId)) {
        throw new Error(`${scenario.id} references unknown event ${eventId}.`);
      }
    }
    for (const level of [scenario.threshold, scenario.baseline]) {
      for (const tag of level.requiredScienceTags) {
        if (!scienceTags.includes(tag)) {
          throw new Error(`${scenario.id} references unknown science tag ${tag}.`);
        }
      }
    }
  }
  for (const launcher of catalogs.launchers) {
    if (launcher.fixedOrbitId && !orbitIds.has(launcher.fixedOrbitId)) {
      throw new Error(
        `${launcher.id} references unknown fixed orbit ${launcher.fixedOrbitId}.`,
      );
    }
  }

  const usedOrbitIds = new Set(catalogs.scenarios.flatMap((scenario) => scenario.allowedOrbits));
  for (const orbit of catalogs.orbits) {
    if (!usedOrbitIds.has(orbit.id)) {
      throw new Error(`Orbit ${orbit.id} is not used by any scenario.`);
    }
  }
}

function validatePartDominance(catalogs: MissionCatalogs): void {
  for (let firstIndex = 0; firstIndex < catalogs.busComponents.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < catalogs.busComponents.length; secondIndex += 1) {
      const first = catalogs.busComponents[firstIndex];
      const second = catalogs.busComponents[secondIndex];
      if (first && second && first.category === second.category) {
        assertNotDominated(first, second);
      }
    }
  }
  for (let firstIndex = 0; firstIndex < catalogs.instruments.length; firstIndex += 1) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < catalogs.instruments.length;
      secondIndex += 1
    ) {
      const first = catalogs.instruments[firstIndex];
      const second = catalogs.instruments[secondIndex];
      if (
        first &&
        second &&
        first.scienceTags.join("|") === second.scienceTags.join("|") &&
        first.compatibleBodies.join("|") === second.compatibleBodies.join("|")
      ) {
        assertNotDominated(first, second);
      }
    }
  }
  for (let firstIndex = 0; firstIndex < catalogs.launchers.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < catalogs.launchers.length; secondIndex += 1) {
      const first = catalogs.launchers[firstIndex];
      const second = catalogs.launchers[secondIndex];
      if (first && second) assertNotDominated(first, second);
    }
  }
}

function assertNotDominated(
  first: BusComponent | Instrument | Launcher,
  second: BusComponent | Instrument | Launcher,
): void {
  if ("payloadKgByClass" in first) {
    if (!("payloadKgByClass" in second)) return;
    const firstBurden = [first.costM, 1 - first.reliabilityProbability, first.fixedOrbitRiskProbability, first.scheduleDelayRiskProbability];
    const secondBurden = [second.costM, 1 - second.reliabilityProbability, second.fixedOrbitRiskProbability, second.scheduleDelayRiskProbability];
    const firstBenefit = [
      first.payloadKgByClass.LEO,
      first.payloadKgByClass.SSO,
      first.payloadKgByClass.GTO,
      first.payloadKgByClass.TLI,
      first.fairingDiameterM,
      first.fairingHeightM,
    ];
    const secondBenefit = [
      second.payloadKgByClass.LEO,
      second.payloadKgByClass.SSO,
      second.payloadKgByClass.GTO,
      second.payloadKgByClass.TLI,
      second.fairingDiameterM,
      second.fairingHeightM,
    ];
    if (dominates(firstBurden, secondBurden, firstBenefit, secondBenefit)) {
      throw new Error(`Launcher ${second.id} is strictly dominated by ${first.id}.`);
    }
    if (dominates(secondBurden, firstBurden, secondBenefit, firstBenefit)) {
      throw new Error(`Launcher ${first.id} is strictly dominated by ${second.id}.`);
    }
    return;
  }
  if ("payloadKgByClass" in second) return;

  const firstMass = first.massKg;
  const secondMass = second.massKg;
  const firstBurden = [firstMass, first.costM, first.powerW];
  const secondBurden = [secondMass, second.costM, second.powerW];
  const firstBenefit = partBenefits(first);
  const secondBenefit = partBenefits(second);
  if (dominates(firstBurden, secondBurden, firstBenefit, secondBenefit)) {
    throw new Error(`Part ${second.id} is strictly dominated by ${first.id}.`);
  }
  if (dominates(secondBurden, firstBurden, secondBenefit, firstBenefit)) {
    throw new Error(`Part ${first.id} is strictly dominated by ${second.id}.`);
  }
}

function partBenefits(part: BusComponent | Instrument): number[] {
  if ("performance" in part) {
    const p = part.performance;
    return [
      p.solarAreaM2 ?? 0,
      p.solarEfficiencyFraction ?? 0,
      p.batteryCapacityWh ?? 0,
      p.storageGB ?? 0,
      p.downlinkMbps ?? 0,
      p.antennaGainDb ?? 0,
      p.baseLinkMarginDb ?? 0,
      p.propellantKg ?? 0,
      p.specificImpulseSec ?? 0,
      p.radiationHardeningFraction ?? 0,
      p.reliabilityProbability ?? 0,
      p.pointingAccuracyArcsec === undefined ? 0 : 1 / p.pointingAccuracyArcsec,
    ];
  }
  return [
    part.scienceValuePoints,
    part.requiredPointingArcsec === 0 ? 0 : 1 / part.requiredPointingArcsec,
  ];
}

function dominates(
  firstBurden: number[],
  secondBurden: number[],
  firstBenefit: number[],
  secondBenefit: number[],
): boolean {
  if (
    firstBurden.length !== secondBurden.length ||
    firstBenefit.length !== secondBenefit.length
  ) {
    return false;
  }
  const noWorse =
    firstBurden.every((value, index) => value <= (secondBurden[index] ?? Number.NEGATIVE_INFINITY)) &&
    firstBenefit.every((value, index) => value >= (secondBenefit[index] ?? Number.POSITIVE_INFINITY));
  const strictlyBetter =
    firstBurden.some((value, index) => value < (secondBurden[index] ?? Number.NEGATIVE_INFINITY)) ||
    firstBenefit.some((value, index) => value > (secondBenefit[index] ?? Number.POSITIVE_INFINITY));
  return noWorse && strictlyBetter;
}

function validateScenarioFeasibility(catalogs: MissionCatalogs): void {
  for (const scenario of catalogs.scenarios) {
    const bestThresholdScoreUpperBound = Math.max(
      ...scenario.allowedOrbits.map((orbitId) => {
        const orbit = catalogs.orbits.find((candidate) => candidate.id === orbitId);
        if (!orbit) return 0;
        return scienceScoreUpperBound(scenario, scenario.threshold, orbit, catalogs);
      }),
    );
    if (bestThresholdScoreUpperBound < scenario.threshold.minScienceScorePoints) {
      throw new Error(
        `Scenario ${scenario.id} lacks evaluator-confirmed coverage: success=false, partial=false. Its science score upper bound is ${bestThresholdScoreUpperBound.toFixed(2)} points, below the threshold of ${scenario.threshold.minScienceScorePoints}; data-return limits are ignored in this optimistic bound.`,
      );
    }
    const bestBaselineScoreUpperBound = Math.max(
      ...scenario.allowedOrbits.map((orbitId) => {
        const orbit = catalogs.orbits.find((candidate) => candidate.id === orbitId);
        if (!orbit) return 0;
        return scienceScoreUpperBound(scenario, scenario.baseline, orbit, catalogs);
      }),
    );
    if (bestBaselineScoreUpperBound < scenario.baseline.minScienceScorePoints) {
      throw new Error(
        `Scenario ${scenario.id} cannot reach Success: its science score upper bound is ${bestBaselineScoreUpperBound.toFixed(2)} points, below the baseline of ${scenario.baseline.minScienceScorePoints}; data-return limits are ignored in this optimistic bound.`,
      );
    }
    let hasSuccess = false;
    let hasPartial = false;
    const feasibleLauncherIds = new Set<string>();
    for (const design of enumerateDesigns(scenario)) {
      const result = evaluateDesign(design, scenario, { difficulty: "easy" });
      if (result.outcome === "success") hasSuccess = true;
      if (result.outcome === "partial") hasPartial = true;
      const launchCompatible =
        result.findings.find((finding) => finding.id === "mass-total")?.severity !== "fail" &&
        result.findings.find((finding) => finding.id === "launch-fixed-orbit")?.severity !== "fail";
      if (launchCompatible) feasibleLauncherIds.add(design.launcherId);
      if (hasSuccess && hasPartial && feasibleLauncherIds.size >= 2) break;
    }
    if (!hasSuccess || !hasPartial) {
      throw new Error(
        `Scenario ${scenario.id} lacks evaluator-confirmed coverage: success=${hasSuccess}, partial=${hasPartial}.`,
      );
    }
    if (feasibleLauncherIds.size < 2) {
      throw new Error(
        `Scenario ${scenario.id} has only ${feasibleLauncherIds.size} evaluator-confirmed feasible launcher option(s); at least two are required.`,
      );
    }
  }

  function scienceScoreUpperBound(
    scenario: Scenario,
    requirements: Scenario["threshold"],
    orbit: NonNullable<MissionCatalogs["orbits"][number]>,
    catalogs: MissionCatalogs,
  ): number {
    const bestAntennaRateMbps = Math.max(
      0,
      ...catalogs.busComponents
        .filter((component) => component.category === "antenna")
        .map((antenna) =>
          effectiveDownlinkMbps(
            antenna.performance.downlinkMbps ?? 0,
            linkMarginDb(
              antenna.performance.antennaGainDb ?? 0,
              orbit.typicalLinkDistanceKm,
            ),
          ),
        ),
    );
    const contactFractionOfDay =
      orbit.contactMinutesPerDay /
      (SECONDS_PER_DAY / SECONDS_PER_MINUTE);
    const transferDownlinkDays =
      orbit.kind === "transfer"
        ? Math.max(
            0,
            (orbit.cruiseDurationDays ?? 0) - (orbit.encounterWindowDays ?? 0),
          )
        : 0;
    const transferEncounterDays =
      orbit.kind === "transfer" ? orbit.encounterWindowDays ?? 0 : 1;
    const maxDownlinkToGenerationRate =
      orbit.kind === "transfer"
        ? bestAntennaRateMbps *
          contactFractionOfDay *
          transferDownlinkDays /
          transferEncounterDays
        : bestAntennaRateMbps * contactFractionOfDay;
    const candidates = catalogs.instruments.filter((instrument) =>
      instrument.compatibleBodies.includes(orbit.centralBody),
    );
    let maximumScore = 0;
    const selected: Instrument[] = [];
    const visit = (nextIndex: number): void => {
      if (selected.length > 0) {
        const observedTags = new Set(selected.flatMap((instrument) => instrument.scienceTags));
        const tagsSatisfied =
          scenario.requiredScienceTagMode === "all"
            ? requirements.requiredScienceTags.every((tag) => observedTags.has(tag))
            : requirements.requiredScienceTags.length === 0 ||
              requirements.requiredScienceTags.some((tag) => observedTags.has(tag));
        const totalSciencePoints = selected.reduce(
          (sum, instrument) => sum + instrument.scienceValuePoints,
          0,
        );
        const totalDataRateMbps = selected.reduce(
          (sum, instrument) => sum + instrument.dataRateMbps,
          0,
        );
        if (tagsSatisfied && totalSciencePoints >= requirements.minScienceScorePoints) {
          const maximumReturnedDutyFraction =
            totalDataRateMbps > 0
              ? Math.min(1, maxDownlinkToGenerationRate / totalDataRateMbps)
              : 1;
          maximumScore = Math.max(
            maximumScore,
            totalSciencePoints * maximumReturnedDutyFraction,
          );
        }
      }
      if (selected.length >= MAXIMUM_ENUMERATED_INSTRUMENT_COUNT) return;
      for (let index = nextIndex; index < candidates.length; index += 1) {
        const instrument = candidates[index];
        if (!instrument) continue;
        selected.push(instrument);
        visit(index + 1);
        selected.pop();
      }
    };
    visit(0);
    return maximumScore;
  }
}

function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive finite number.`);
  }
}

function assertNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative finite number.`);
  }
}

function assertFraction(value: number | undefined, label: string): void {
  if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > 1)) {
    throw new RangeError(`${label} must be between 0 and 1.`);
  }
}

