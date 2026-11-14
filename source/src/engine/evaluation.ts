import { busComponents, instruments, launchers } from "../data/catalogs";
import type {
  BusCategory,
  BusComponent,
  Finding,
  MissionDesign,
  Orbit,
  PartQuantity,
  Scenario,
  ScienceRequirements,
} from "../data/types";
import {
  BASE_COST_RESERVE_FRACTION,
  COST_SCORE_WEIGHT_FRACTION,
  DAYS_PER_MONTH,
  DEFAULT_BATTERY_USABLE_ENERGY_FRACTION,
  DEFAULT_COMPONENT_RELIABILITY_PROBABILITY,
  DEFAULT_INSTRUMENT_RELIABILITY_PROBABILITY,
  ENUMERATED_DUTY_CYCLE_PERCENT,
  ENUMERATED_MINIMUM_DURATION_MONTHS,
  EFFICIENCY_SCORE_WEIGHT_FRACTION,
  EASY_RESOURCE_MARGIN_FRACTION,
  HARD_RESOURCE_MARGIN_FRACTION,
  INCOMPATIBLE_BODY_FIT_FRACTION,
  MAXIMUM_BATTERY_COUNT_PER_DESIGN,
  MAX_COST_RESERVE_FRACTION,
  MAXIMUM_DATA_STORAGE_COUNT_PER_DESIGN,
  MAXIMUM_ENUMERATED_INSTRUMENT_COUNT,
  MAXIMUM_SCORE_POINTS,
  MAXIMUM_PANEL_COUNT_PER_DESIGN,
  MAXIMUM_PROPULSION_COUNT_PER_DESIGN,
  MINIMUM_MISSION_DAYS,
  MINIMUM_SCIENCE_REDUNDANCY_FRACTION,
  MBITS_PER_GIGABYTE,
  MAXIMUM_PROBABILITY_FRACTION,
  MINIMUM_PROBABILITY_FRACTION,
  MONTHS_PER_YEAR,
  NO_LINK_MARGIN_DB,
  OPPORTUNISTIC_DOWNLINK_FRACTION,
  PANEL_DEGRADATION_FRACTION_PER_YEAR,
  RADIATION_HAZARD_MULTIPLIER_FACTOR,
  RELIABILITY_WARNING_THRESHOLD_FRACTION,
  RISK_RESERVE_FRACTION_PER_FAILURE_PROBABILITY,
  SCIENCE_SCORE_WEIGHT_FRACTION,
  SCIENCE_TAG_FIT_FLOOR_FRACTION,
  SCIENCE_TAG_FIT_MATCH_SCALE_FRACTION,
  SCHEDULED_DOWNLINK_FRACTION,
  SCIENCE_REDUNDANCY_WEIGHT_FRACTIONS,
  SECONDS_PER_DAY,
  SECONDS_PER_MINUTE,
  PARTIAL_OUTCOME_BONUS_POINTS,
  RESILIENCE_SCORE_WEIGHT_FRACTION,
  SUCCESS_OUTCOME_BONUS_POINTS,
  SYSTEM_LOSS_FRACTION,
  PERCENT_UNITS_PER_FRACTION,
} from "./constants";
import {
  effectiveDownlinkMbps,
  linkMarginDb,
  marginSeverity,
  requiredLinkMarginDb,
  resourceMarginFraction,
  rocketEquationDeltaVms,
  solarOrbitAveragePowerW,
} from "./physics";
import {
  getDesignParts,
  getInstrument,
  getLauncher,
  getOrbit,
} from "./lookup";
import { orbitalPeriodHours } from "../data/orbit-math";

export interface EvaluationPolicy {
  difficulty: "easy" | "hard";
}

export interface EvaluationMetrics {
  dryMassKg: number;
  wetMassKg: number;
  launchCapacityKg: number;
  dryMassMarginFraction: number;
  wetMassMarginFraction: number;
  peakPowerGenerationW: number;
  orbitAveragePowerGenerationW: number;
  averagePowerLoadW: number;
  powerMarginFraction: number;
  usableBatteryEnergyWh: number;
  eclipseEnergyRequiredWh: number;
  energyMarginFraction: number;
  generatedDataGB: number;
  recorderCapacityGB: number;
  downlinkCapacityGB: number;
  downlinkedDataGB: number;
  lostDataGB: number;
  returnedDataGB: number;
  linkMarginDb: number;
  requiredLinkMarginDb: number;
  effectiveDownlinkMbps: number;
  availableDeltaVms: number;
  requiredDeltaVms: number;
  achievableLifetimeMonths: number;
  missionSuccessProbability: number;
  weakestSubsystem: string;
  rawMissionCostM: number;
  reserveFraction: number;
  reserveCostM: number;
  totalCostM: number;
  budgetCapM: number;
  scienceScorePoints: number;
  scienceScoreFactors: ScienceScoreFactors;
}

export interface ScienceScoreFactors {
  instrumentValuePoints: number;
  tagFitFraction: number;
  pointingFactorFraction: number;
  uptimeFraction: number;
  dataReturnedFraction: number;
  overlapWeightFraction: number;
  preUptimeDataPoints: number;
  scienceScorePoints: number;
  instruments: Array<{
    id: string;
    instrumentValuePoints: number;
    tagFitFraction: number;
    pointingFactorFraction: number;
    overlapWeightFraction: number;
    adjustedPoints: number;
  }>;
}

export interface CriterionResult {
  id: string;
  label: string;
  passed: boolean;
  actual: number | boolean;
  required: number | string;
}

export interface EvaluationScore {
  sciencePoints: number;
  efficiencyPoints: number;
  resiliencePoints: number;
  costPoints: number;
  totalPoints: number;
}

export interface ResourceShortfall {
  id: string;
  actualMargin: number;
  requiredMargin: number;
  shortfall: number;
}

export interface EvaluationResult {
  metrics: EvaluationMetrics;
  findings: Finding[];
  outcome: "success" | "partial" | "failure";
  score: EvaluationScore;
  shortfalls: ResourceShortfall[];
  thresholdCriteria: CriterionResult[];
  baselineCriteria: CriterionResult[];
}

interface DataMetrics {
  generatedGB: number;
  recorderCapacityGB: number;
  downlinkCapacityGB: number;
  downlinkedDataGB: number;
  lostDataGB: number;
  returnedDataGB: number;
}

interface ReliabilityMetrics {
  missionSuccessProbability: number;
  weakestSubsystem: string;
  weakestSubsystemProbability: number;
}

const REQUIRED_BUS_CATEGORIES: BusCategory[] = [
  "structure",
  "solarPanel",
  "battery",
  "computer",
  "adcs",
  "antenna",
  "dataStorage",
];

export function evaluateDesign(
  design: MissionDesign,
  scenario: Scenario,
  policy: EvaluationPolicy,
): EvaluationResult {
  validateDesign(design, scenario);
  const { instruments: selectedInstruments, busComponents: selectedBus } = getDesignParts(design);
  const launcher = getLauncher(design.launcherId);
  const orbit = getOrbit(design.orbitId);
  const minMarginFraction =
    policy.difficulty === "easy"
      ? EASY_RESOURCE_MARGIN_FRACTION
      : HARD_RESOURCE_MARGIN_FRACTION;

  const mass = calculateMass(selectedInstruments, selectedBus, launcher, orbit);
  const power = calculatePower(design, selectedInstruments, selectedBus, orbit);
  const missingBusCategories = REQUIRED_BUS_CATEGORIES.filter(
    (category) => !selectedBus.some((component) => component.category === category),
  );
  const communications = calculateCommunications(
    selectedBus,
    orbit,
    design.operationsPlan.downlinkStrategy,
  );
  const data = calculateData(
    design,
    selectedInstruments,
    selectedBus,
    orbit,
    communications,
  );
  const deltaV = calculateDeltaV(design, selectedBus, mass.wetMassKg, orbit);
  const reliability = calculateReliability(
    design,
    selectedBus,
    launcher,
    orbit,
  );
  const cost = calculateCost(
    design,
    scenario,
    selectedInstruments,
    selectedBus,
    launcher,
    reliability,
  );
  const scienceScoreFactors = calculateScienceScoreFactors(
    scenario,
    orbit,
    selectedInstruments,
    selectedBus,
    design.operationsPlan.dutyCyclePercent,
    data,
  );
  const scienceScorePoints = scienceScoreFactors.scienceScorePoints;
  const thresholdCriteria = evaluateCriteria(
    scenario.threshold,
    scenario.requiredScienceTagMode,
    selectedInstruments,
    scienceScorePoints,
    data.returnedDataGB,
    deltaV.achievableLifetimeMonths,
  );
  const baselineCriteria = evaluateCriteria(
    scenario.baseline,
    scenario.requiredScienceTagMode,
    selectedInstruments,
    scienceScorePoints,
    data.returnedDataGB,
    deltaV.achievableLifetimeMonths,
  );
  const findings = buildFindings(
    design,
    scenario,
    orbit,
    launcher,
    minMarginFraction,
    mass,
    power,
    communications,
    data,
    deltaV,
    reliability,
    cost,
    scienceScorePoints,
    thresholdCriteria,
    baselineCriteria,
    missingBusCategories,
  );
  const criticalFindingIds = new Set([
    "bus-core-components",
    "launch-payload-capacity",
    "launch-fixed-orbit",
    "propulsion-delta-v",
    "power-generation",
    "power-eclipse-battery",
    "mission-cost",
  ]);
  const hasAnyFailureFinding = findings.some((finding) => finding.severity === "fail");
  const hasCriticalFailure = findings.some(
    (finding) => finding.severity === "fail" && criticalFindingIds.has(finding.id),
  );
  const thresholdPassed =
    thresholdCriteria.every((criterion) => criterion.passed) && !hasCriticalFailure;
  const baselinePassed = baselineCriteria.every((criterion) => criterion.passed);
  const outcome =
    hasAnyFailureFinding || !thresholdPassed
      ? "failure"
      : baselinePassed
        ? "success"
        : "partial";
  const metrics: EvaluationMetrics = {
    dryMassKg: mass.dryMassKg,
    wetMassKg: mass.wetMassKg,
    launchCapacityKg: mass.launchCapacityKg,
    dryMassMarginFraction: mass.dryMassMarginFraction,
    wetMassMarginFraction: mass.wetMassMarginFraction,
    peakPowerGenerationW: power.peakPowerGenerationW,
    orbitAveragePowerGenerationW: power.orbitAveragePowerGenerationW,
    averagePowerLoadW: power.averagePowerLoadW,
    powerMarginFraction: power.powerMarginFraction,
    usableBatteryEnergyWh: power.usableBatteryEnergyWh,
    eclipseEnergyRequiredWh: power.eclipseEnergyRequiredWh,
    energyMarginFraction: power.energyMarginFraction,
    generatedDataGB: data.generatedGB,
    recorderCapacityGB: data.recorderCapacityGB,
    downlinkCapacityGB: data.downlinkCapacityGB,
    downlinkedDataGB: data.downlinkedDataGB,
    lostDataGB: data.lostDataGB,
    returnedDataGB: data.returnedDataGB,
    linkMarginDb: communications.linkMarginDb,
    requiredLinkMarginDb: communications.requiredLinkMarginDb,
    effectiveDownlinkMbps: communications.effectiveDownlinkMbps,
    availableDeltaVms: deltaV.availableDeltaVms,
    requiredDeltaVms: deltaV.requiredDeltaVms,
    achievableLifetimeMonths: deltaV.achievableLifetimeMonths,
    missionSuccessProbability: reliability.missionSuccessProbability,
    weakestSubsystem: reliability.weakestSubsystem,
    rawMissionCostM: cost.rawMissionCostM,
    reserveFraction: cost.reserveFraction,
    reserveCostM: cost.reserveCostM,
    totalCostM: cost.totalCostM,
    budgetCapM: scenario.availableBudgetM,
    scienceScorePoints,
    scienceScoreFactors,
  };
  const score = calculateScore(metrics, scenario, outcome);

  return {
    metrics,
    findings,
    outcome,
    score,
    shortfalls: buildShortfalls(
      minMarginFraction,
      mass,
      power,
      communications.linkMarginDb,
      communications.requiredLinkMarginDb,
    ),
    thresholdCriteria,
    baselineCriteria,
  };
}

export function recommendedBus(scenario: Scenario): PartQuantity[] {
  const orbit = scenario.allowedOrbits.map(getOrbit)[0];
  if (!orbit) return [];
  const ids = [
    "cubesat-structure",
    "deployable-solar-array",
    "lithium-battery",
    "basic-flight-computer",
    "basic-adcs",
    orbit.centralBody === "sun-transfer" ? "deep-space-antenna" : "mid-gain-antenna",
    "solid-state-recorder",
  ];
  if (
    orbit.insertionDeltaVms > 0 ||
    orbit.stationkeepingDeltaVmsPerYear > 0 ||
    orbit.deorbitDeltaVms > 0
  ) {
    ids.push(
      orbit.insertionDeltaVms > 0 || orbit.deorbitDeltaVms > 0
        ? "chemical-propulsion"
        : "cold-gas-propulsion",
    );
  }
  return ids.map((id) => ({ id, qty: 1 }));
}

export function* enumerateDesigns(scenario: Scenario): Generator<MissionDesign> {
  const busSets = busSelections();
  for (const orbitId of scenario.allowedOrbits) {
    const orbit = getOrbit(orbitId);
    const instrumentSets = instrumentSelections(scenario, orbit);
    for (const launcher of launchers) {
      if (launcher.payloadKgByClass[orbit.insertionClass] <= 0) continue;
      if (launcher.fixedOrbitId && launcher.fixedOrbitId !== orbit.id) continue;
      for (const instrumentsPicked of instrumentSets) {
        for (const busPicked of busSets) {
          yield {
            scenarioId: scenario.id,
            instruments: instrumentsPicked,
            busComponents: busPicked,
            launcherId: launcher.id,
            orbitId: orbit.id,
            operationsPlan: {
              dutyCyclePercent: ENUMERATED_DUTY_CYCLE_PERCENT,
              downlinkStrategy: "scheduled",
              missionDurationMonths: Math.max(
                scenario.baseline.minLifetimeMonths,
                ENUMERATED_MINIMUM_DURATION_MONTHS,
              ),
              operationsCostMPerMonth: scenario.defaultOperationsCostMPerMonth,
            },
          };
        }
      }
    }
  }
}

function validateDesign(design: MissionDesign, scenario: Scenario): void {
  if (design.scenarioId !== scenario.id) {
    throw new RangeError(
      `Design scenario ${design.scenarioId} does not match evaluation scenario ${scenario.id}.`,
    );
  }
  const { instruments: selectedInstruments } = getDesignParts(design);
  const orbit = getOrbit(design.orbitId);
  if (!scenario.allowedOrbits.includes(orbit.id)) {
    throw new RangeError(`Orbit ${orbit.id} is not allowed for scenario ${scenario.id}.`);
  }
  for (const instrument of selectedInstruments) {
    if (!instrument.compatibleBodies.includes(orbit.centralBody)) {
      throw new RangeError(
        `${instrument.name} is not compatible with ${orbit.centralBody}; use a compatible instrument.`,
      );
    }
  }
  if (
    !Number.isFinite(design.operationsPlan.dutyCyclePercent) ||
    design.operationsPlan.dutyCyclePercent < 0 ||
    design.operationsPlan.dutyCyclePercent > PERCENT_UNITS_PER_FRACTION
  ) {
    throw new RangeError(
      `Instrument duty cycle must be between 0 and ${PERCENT_UNITS_PER_FRACTION} percent.`,
    );
  }
  if (
    !Number.isFinite(design.operationsPlan.missionDurationMonths) ||
    design.operationsPlan.missionDurationMonths <= 0 ||
    !Number.isFinite(design.operationsPlan.operationsCostMPerMonth) ||
    design.operationsPlan.operationsCostMPerMonth < 0
  ) {
    throw new RangeError("Mission duration must be positive and operations cost non-negative.");
  }
}

function calculateMass(
  selectedInstruments: ReturnType<typeof getDesignParts>["instruments"],
  selectedBus: ReturnType<typeof getDesignParts>["busComponents"],
  launcher: ReturnType<typeof getLauncher>,
  orbit: Orbit,
) {
  const dryMassKg =
    selectedInstruments.reduce((sum, instrument) => sum + instrument.massKg, 0) +
    selectedBus.reduce((sum, component) => sum + component.massKg, 0);
  const propellantKg = selectedBus.reduce(
    (sum, component) => sum + (component.performance.propellantKg ?? 0),
    0,
  );
  const wetMassKg = dryMassKg + propellantKg;
  const launchCapacityKg = launcher.payloadKgByClass[orbit.insertionClass];
  return {
    dryMassKg,
    wetMassKg,
    propellantKg,
    launchCapacityKg,
    dryMassMarginFraction: resourceMarginFraction(launchCapacityKg, dryMassKg),
    wetMassMarginFraction: resourceMarginFraction(launchCapacityKg, wetMassKg),
  };
}

function calculatePower(
  design: MissionDesign,
  selectedInstruments: ReturnType<typeof getDesignParts>["instruments"],
  selectedBus: ReturnType<typeof getDesignParts>["busComponents"],
  orbit: Orbit,
) {
  const missionYears = design.operationsPlan.missionDurationMonths / MONTHS_PER_YEAR;
  const eclipseFraction = orbit.kind === "transfer" ? 0 : orbit.eclipseFractionOfOrbit;
  const peakPowerGenerationW = selectedBus
    .filter((component) => component.category === "solarPanel")
    .reduce(
      (sum, panel) =>
        sum +
          orbit.solarFluxWPerM2 *
            (panel.performance.solarAreaM2 ?? 0) *
            (panel.performance.solarEfficiencyFraction ?? 0) *
            SYSTEM_LOSS_FRACTION,
      0,
    );
  const orbitAveragePowerGenerationW = selectedBus
    .filter((component) => component.category === "solarPanel")
    .reduce(
      (sum, panel) =>
        sum +
        solarOrbitAveragePowerW(
          orbit.solarFluxWPerM2,
          panel.performance.solarAreaM2 ?? 0,
          panel.performance.solarEfficiencyFraction ?? 0,
          eclipseFraction,
          missionYears,
          PANEL_DEGRADATION_FRACTION_PER_YEAR,
        ),
      0,
    );
  const busPowerW = selectedBus
    .filter((component) => component.category !== "solarPanel")
    .reduce((sum, component) => sum + component.powerW, 0);
  const instrumentPowerW = selectedInstruments.reduce(
    (sum, instrument) => sum + instrument.powerW,
    0,
  );
  const averagePowerLoadW =
    busPowerW +
    instrumentPowerW *
    (design.operationsPlan.dutyCyclePercent / PERCENT_UNITS_PER_FRACTION);
  const usableBatteryEnergyWh = selectedBus
    .filter((component) => component.category === "battery")
    .reduce(
      (sum, battery) =>
        sum +
        (battery.performance.batteryCapacityWh ?? 0) *
          (battery.performance.maxDepthOfDischargeFraction ??
            DEFAULT_BATTERY_USABLE_ENERGY_FRACTION),
      0,
    );
  const periodHours = orbit.kind === "bound" ? orbitalPeriodHours(orbit) : 0;
  const eclipseEnergyRequiredWh =
    averagePowerLoadW * periodHours * eclipseFraction;
  return {
    peakPowerGenerationW,
    orbitAveragePowerGenerationW,
    averagePowerLoadW,
    usableBatteryEnergyWh,
    eclipseEnergyRequiredWh,
    powerMarginFraction: resourceMarginFraction(
      orbitAveragePowerGenerationW,
      averagePowerLoadW,
    ),
    energyMarginFraction:
      eclipseEnergyRequiredWh === 0
        ? 1
        : resourceMarginFraction(usableBatteryEnergyWh, eclipseEnergyRequiredWh),
  };
}

function calculateCommunications(
  selectedBus: BusComponent[],
  orbit: Orbit,
  downlinkStrategy: MissionDesign["operationsPlan"]["downlinkStrategy"],
) {
  const antennas = selectedBus.filter((component) => component.category === "antenna");
  const links = antennas.map((antenna) => {
    const gainDb = antenna.performance.antennaGainDb ?? 0;
    const marginDb = linkMarginDb(gainDb, orbit.typicalLinkDistanceKm);
    const effectiveRateMbps = effectiveDownlinkMbps(
      antenna.performance.downlinkMbps ?? 0,
      marginDb,
    );
    return { marginDb, effectiveRateMbps };
  });
  const bestLink = links.reduce(
    (best, link) =>
      link.effectiveRateMbps > best.effectiveRateMbps ||
      (link.effectiveRateMbps === best.effectiveRateMbps && link.marginDb > best.marginDb)
        ? link
        : best,
    { marginDb: NO_LINK_MARGIN_DB, effectiveRateMbps: 0 },
  );
  const strategyFactor =
    downlinkStrategy === "scheduled"
      ? SCHEDULED_DOWNLINK_FRACTION
      : OPPORTUNISTIC_DOWNLINK_FRACTION;
  return {
    linkMarginDb: bestLink.marginDb,
    requiredLinkMarginDb: requiredLinkMarginDb(orbit),
    effectiveDownlinkMbps: bestLink.effectiveRateMbps * strategyFactor,
  };
}

function calculateData(
  design: MissionDesign,
  selectedInstruments: ReturnType<typeof getDesignParts>["instruments"],
  selectedBus: BusComponent[],
  orbit: Orbit,
  communications: ReturnType<typeof calculateCommunications>,
): DataMetrics {
  const generatedMbps =
    selectedInstruments.reduce((sum, instrument) => sum + instrument.dataRateMbps, 0) *
    (design.operationsPlan.dutyCyclePercent / PERCENT_UNITS_PER_FRACTION);
  const generatedGBPerDay = (generatedMbps * SECONDS_PER_DAY) / MBITS_PER_GIGABYTE;
  const downlinkGBPerDay =
    (communications.effectiveDownlinkMbps *
      orbit.contactMinutesPerDay *
      SECONDS_PER_MINUTE) /
    MBITS_PER_GIGABYTE;
  const storageGB = selectedBus.reduce(
    (sum, component) =>
      sum + (component.performance.storageGB ?? 0),
    0,
  );
  const totalDays =
    orbit.kind === "transfer"
      ? orbit.cruiseDurationDays ?? 0
      : Math.max(
          MINIMUM_MISSION_DAYS,
          design.operationsPlan.missionDurationMonths * DAYS_PER_MONTH,
        );
  const generatedGB =
    orbit.kind === "transfer"
      ? generatedGBPerDay * Math.min(totalDays, orbit.encounterWindowDays ?? 0)
      : generatedGBPerDay * totalDays;
  const downlinkDays =
    orbit.kind === "transfer"
      ? Math.max(0, totalDays - (orbit.encounterWindowDays ?? 0))
      : totalDays;
  const downlinkCapacityGB = downlinkGBPerDay * downlinkDays;
  const retainedGB =
    orbit.kind === "transfer" ? Math.min(generatedGB, storageGB) : generatedGB;
  const returnedDataGB = Math.min(retainedGB, downlinkCapacityGB);
  const downlinkedDataGB = returnedDataGB;
  const boundDailyBacklogGB = Math.max(0, generatedGBPerDay - downlinkGBPerDay);
  const finalBufferGB =
    orbit.kind === "transfer"
      ? Math.max(0, retainedGB - returnedDataGB)
      : Math.min(storageGB, boundDailyBacklogGB * totalDays);
  const lostDataGB = Math.max(0, generatedGB - returnedDataGB - finalBufferGB);
  return {
    generatedGB,
    recorderCapacityGB: storageGB,
    downlinkCapacityGB,
    downlinkedDataGB,
    lostDataGB,
    returnedDataGB,
  };
}

function calculateDeltaV(
  design: MissionDesign,
  selectedBus: BusComponent[],
  wetMassKg: number,
  orbit: Orbit,
) {
  const propulsionParts = selectedBus.filter((component) => component.category === "propulsion");
  const propellantKg = propulsionParts.reduce(
    (sum, component) => sum + (component.performance.propellantKg ?? 0),
    0,
  );
  const weightedIspNumerator = propulsionParts.reduce(
    (sum, component) =>
      sum +
      (component.performance.propellantKg ?? 0) *
        (component.performance.specificImpulseSec ?? 0),
    0,
  );
  const weightedIspSec = propellantKg > 0 ? weightedIspNumerator / propellantKg : 0;
  const availableDeltaVms = rocketEquationDeltaVms(wetMassKg, propellantKg, weightedIspSec);
  const missionYears = design.operationsPlan.missionDurationMonths / MONTHS_PER_YEAR;
  const requiredDeltaVms =
    orbit.insertionDeltaVms +
    orbit.stationkeepingDeltaVmsPerYear * missionYears +
    orbit.deorbitDeltaVms;
  const insertionCovered = availableDeltaVms >= orbit.insertionDeltaVms;
  const totalDeltaVCovered = availableDeltaVms >= requiredDeltaVms;
  const lifetimeByPropellantMonths =
    orbit.stationkeepingDeltaVmsPerYear > 0 && insertionCovered
      ? Math.max(
          0,
          ((availableDeltaVms - orbit.insertionDeltaVms - orbit.deorbitDeltaVms) /
            orbit.stationkeepingDeltaVmsPerYear) *
            MONTHS_PER_YEAR,
        )
      : insertionCovered
        ? design.operationsPlan.missionDurationMonths
        : 0;
  const achievableLifetimeMonths = Math.min(
    design.operationsPlan.missionDurationMonths,
    lifetimeByPropellantMonths,
    orbit.stationkeepingDeltaVmsPerYear === 0
      ? orbit.naturalOrbitLifetimeMonths
      : design.operationsPlan.missionDurationMonths,
  );
  return {
    availableDeltaVms,
    requiredDeltaVms,
    insertionCovered,
    totalDeltaVCovered,
    achievableLifetimeMonths,
  };
}

function calculateReliability(
  design: MissionDesign,
  selectedBus: BusComponent[],
  launcher: ReturnType<typeof getLauncher>,
  orbit: Orbit,
): ReliabilityMetrics {
  const missionYears = design.operationsPlan.missionDurationMonths / MONTHS_PER_YEAR;
  const computerHardeningFraction = selectedBus
    .filter((component) => component.category === "computer")
    .reduce(
      (maximum, computer) =>
        Math.max(maximum, computer.performance.radiationHardeningFraction ?? 0),
      0,
    );
  const categories = new Map<string, number[]>();
  for (const component of selectedBus) {
    const annualReliability =
      component.performance.reliabilityProbability ??
      DEFAULT_COMPONENT_RELIABILITY_PROBABILITY;
    addReliability(categories, component.category, annualReliability);
  }
  for (const requiredCategory of REQUIRED_BUS_CATEGORIES) {
    if (!categories.has(requiredCategory)) {
      categories.set(requiredCategory, [MINIMUM_PROBABILITY_FRACTION]);
    }
  }
  const instrumentReliabilities = new Map<string, number[]>();
  const selectedIds = design.instruments;
  for (const selected of selectedIds) {
    const instrument = getInstrument(selected.id);
    const annualReliability =
      instrument.reliabilityProbability ?? DEFAULT_INSTRUMENT_RELIABILITY_PROBABILITY;
    addReliability(instrumentReliabilities, `instrument:${instrument.id}`, annualReliability, selected.qty);
  }

  const subsystemSurvivals: Array<{ name: string; survival: number }> = [];
  for (const [category, probabilities] of categories) {
    subsystemSurvivals.push({
      name: category,
      survival: groupSurvival(probabilities, missionYears, orbit.radiationLevelIndex, computerHardeningFraction),
    });
  }
  for (const [name, probabilities] of instrumentReliabilities) {
    subsystemSurvivals.push({
      name,
      survival: groupSurvival(probabilities, missionYears, orbit.radiationLevelIndex, computerHardeningFraction),
    });
  }
  const subsystemSurvival = subsystemSurvivals.reduce(
    (product, subsystem) => product * subsystem.survival,
    1,
  );
  const launchRiskFactor =
    (1 - launcher.fixedOrbitRiskProbability) *
    (1 - launcher.scheduleDelayRiskProbability);
  const missionSuccessProbability = clampProbability(
    launcher.reliabilityProbability * launchRiskFactor * subsystemSurvival,
  );
  const weakest = subsystemSurvivals.reduce(
    (current, candidate) =>
      candidate.survival < current.survival ? candidate : current,
    { name: "launch vehicle", survival: launcher.reliabilityProbability * launchRiskFactor },
  );
  return {
    missionSuccessProbability,
    weakestSubsystem: weakest.name,
    weakestSubsystemProbability: weakest.survival,
  };
}

function addReliability(
  groups: Map<string, number[]>,
  key: string,
  annualReliability: number,
  quantity = 1,
): void {
  const items = groups.get(key) ?? [];
  for (let index = 0; index < quantity; index += 1) items.push(annualReliability);
  groups.set(key, items);
}

function groupSurvival(
  annualProbabilities: number[],
  years: number,
  radiationLevelIndex: number,
  computerHardeningFraction: number,
): number {
  const annualSurvivals = annualProbabilities.map((annualProbability) => {
    const annualHazard =
      -Math.log(Math.max(Number.EPSILON, annualProbability)) *
      (1 +
        RADIATION_HAZARD_MULTIPLIER_FACTOR *
          radiationLevelIndex *
          (1 - computerHardeningFraction));
    return clampProbability(Math.exp(-annualHazard * years));
  });
  return clampProbability(
    1 - annualSurvivals.reduce((failureProduct, survival) => failureProduct * (1 - survival), 1),
  );
}

function calculateCost(
  design: MissionDesign,
  scenario: Scenario,
  selectedInstruments: ReturnType<typeof getDesignParts>["instruments"],
  selectedBus: BusComponent[],
  launcher: ReturnType<typeof getLauncher>,
  reliability: ReliabilityMetrics,
) {
  const instrumentCostM = selectedInstruments.reduce((sum, instrument) => sum + instrument.costM, 0);
  const busCostM = selectedBus.reduce((sum, component) => sum + component.costM, 0);
  const operationsCostM =
    design.operationsPlan.operationsCostMPerMonth *
    design.operationsPlan.missionDurationMonths;
  const rawMissionCostM =
    instrumentCostM + busCostM + launcher.costM + operationsCostM;
  const reserveFraction = Math.min(
    MAX_COST_RESERVE_FRACTION,
    Math.max(
      BASE_COST_RESERVE_FRACTION,
      BASE_COST_RESERVE_FRACTION +
        RISK_RESERVE_FRACTION_PER_FAILURE_PROBABILITY *
          (1 - reliability.missionSuccessProbability),
    ),
  );
  const reserveCostM = rawMissionCostM * reserveFraction;
  return {
    rawMissionCostM,
    reserveFraction,
    reserveCostM,
    totalCostM: rawMissionCostM + reserveCostM,
    budgetCapM: scenario.availableBudgetM,
  };
}

function calculateScienceScoreFactors(
  scenario: Scenario,
  orbit: Orbit,
  selectedInstruments: ReturnType<typeof getDesignParts>["instruments"],
  selectedBus: BusComponent[],
  dutyCyclePercent: number,
  data: DataMetrics,
): ScienceScoreFactors {
  const targetTags = scenario.threshold.requiredScienceTags;
  const adcsAccuracyArcsec = selectedBus
    .filter((component) => component.category === "adcs")
    .reduce(
      (best, component) =>
        Math.min(best, component.performance.pointingAccuracyArcsec ?? Number.POSITIVE_INFINITY),
      Number.POSITIVE_INFINITY,
    );
  const sortedByFit = [...selectedInstruments].sort(
    (left, right) =>
      instrumentScenarioFit(right, targetTags, orbit.centralBody) -
      instrumentScenarioFit(left, targetTags, orbit.centralBody),
  );
  const instrumentScores = sortedByFit.reduce(
    (result, instrument) => {
      const overlapCount = instrument.scienceTags.filter((tag) =>
        result.coveredTags.has(tag),
      ).length;
      const redundancyWeight =
        SCIENCE_REDUNDANCY_WEIGHT_FRACTIONS[
          Math.min(
            overlapCount,
            SCIENCE_REDUNDANCY_WEIGHT_FRACTIONS.length - 1,
          )
        ] ?? MINIMUM_SCIENCE_REDUNDANCY_FRACTION;
      const pointingFactor =
        instrument.requiredPointingArcsec > 0
          ? Math.min(1, instrument.requiredPointingArcsec / adcsAccuracyArcsec)
          : 1;
      const tagFit = instrumentScenarioFit(instrument, targetTags, orbit.centralBody);
      const contribution =
        instrument.scienceValuePoints * tagFit * pointingFactor * redundancyWeight;
      for (const tag of instrument.scienceTags) result.coveredTags.add(tag);
      result.instruments.push({
        id: instrument.id,
        instrumentValuePoints: instrument.scienceValuePoints,
        tagFitFraction: tagFit,
        pointingFactorFraction: pointingFactor,
        overlapWeightFraction: redundancyWeight,
        adjustedPoints: contribution,
      });
      return result;
    },
    {
      instruments: [] as ScienceScoreFactors["instruments"],
      coveredTags: new Set<string>(),
    },
  );
  const instrumentValuePoints = instrumentScores.instruments.reduce(
    (sum, instrument) => sum + instrument.instrumentValuePoints,
    0,
  );
  const weightedFactor = (
    factor: (instrument: ScienceScoreFactors["instruments"][number]) => number,
  ): number =>
    instrumentValuePoints > 0
      ? instrumentScores.instruments.reduce(
          (sum, instrument) =>
            sum + instrument.instrumentValuePoints * factor(instrument),
          0,
        ) / instrumentValuePoints
      : 0;
  const preUptimeDataPoints = instrumentScores.instruments.reduce(
    (sum, instrument) => sum + instrument.adjustedPoints,
    0,
  );
  const uptimeFraction = dutyCyclePercent / PERCENT_UNITS_PER_FRACTION;
  const dataReturnedFraction =
    data.generatedGB > 0 ? data.returnedDataGB / data.generatedGB : 0;
  const scienceScorePoints =
    preUptimeDataPoints *
    uptimeFraction *
    clampProbability(dataReturnedFraction);
  return {
    instrumentValuePoints,
    tagFitFraction: weightedFactor((instrument) => instrument.tagFitFraction),
    pointingFactorFraction: weightedFactor(
      (instrument) => instrument.pointingFactorFraction,
    ),
    uptimeFraction,
    dataReturnedFraction: clampProbability(dataReturnedFraction),
    overlapWeightFraction: weightedFactor(
      (instrument) => instrument.overlapWeightFraction,
    ),
    preUptimeDataPoints,
    scienceScorePoints,
    instruments: instrumentScores.instruments,
  };
}

function instrumentScenarioFit(
  instrument: ReturnType<typeof getInstrument>,
  targetTags: Scenario["threshold"]["requiredScienceTags"],
  bodyId: Orbit["centralBody"],
): number {
  const matches = instrument.scienceTags.filter((tag) => targetTags.includes(tag)).length;
  const tagFit =
    targetTags.length === 0
      ? 1
      : SCIENCE_TAG_FIT_FLOOR_FRACTION +
        SCIENCE_TAG_FIT_MATCH_SCALE_FRACTION * (matches / targetTags.length);
  const bodyFit = instrument.compatibleBodies.includes(bodyId)
    ? 1
    : INCOMPATIBLE_BODY_FIT_FRACTION;
  return tagFit * bodyFit;
}

function evaluateCriteria(
  requirements: ScienceRequirements,
  tagMode: Scenario["requiredScienceTagMode"],
  selectedInstruments: ReturnType<typeof getDesignParts>["instruments"],
  scienceScorePoints: number,
  returnedDataGB: number,
  achievableLifetimeMonths: number,
): CriterionResult[] {
  const observedTags = new Set(selectedInstruments.flatMap((instrument) => instrument.scienceTags));
  const tagPass =
    tagMode === "all"
      ? requirements.requiredScienceTags.every((tag) => observedTags.has(tag))
      : requirements.requiredScienceTags.length === 0 ||
        requirements.requiredScienceTags.some((tag) => observedTags.has(tag));
  return [
    {
      id: "science-score",
      label: "Science score",
      passed: scienceScorePoints >= requirements.minScienceScorePoints,
      actual: round(scienceScorePoints, 2),
      required: requirements.minScienceScorePoints,
    },
    {
      id: "science-tags",
      label: tagMode === "all" ? "All required science tags" : "At least one required science tag",
      passed: tagPass,
      actual: tagPass,
      required: tagMode,
    },
    {
      id: "returned-data",
      label: "Returned science data (GB)",
      passed: returnedDataGB >= requirements.dataReturnGB,
      actual: round(returnedDataGB, 3),
      required: requirements.dataReturnGB,
    },
    {
      id: "mission-lifetime",
      label: "Achievable mission lifetime (months)",
      passed: achievableLifetimeMonths >= requirements.minLifetimeMonths,
      actual: round(achievableLifetimeMonths, 1),
      required: requirements.minLifetimeMonths,
    },
  ];
}

function buildFindings(
  design: MissionDesign,
  scenario: Scenario,
  orbit: Orbit,
  launcher: ReturnType<typeof getLauncher>,
  requiredMarginFraction: number,
  mass: ReturnType<typeof calculateMass>,
  power: ReturnType<typeof calculatePower>,
  communications: ReturnType<typeof calculateCommunications>,
  data: DataMetrics,
  deltaV: ReturnType<typeof calculateDeltaV>,
  reliability: ReliabilityMetrics,
  cost: ReturnType<typeof calculateCost>,
  scienceScorePoints: number,
  thresholdCriteria: CriterionResult[],
  baselineCriteria: CriterionResult[],
  missingBusCategories: BusCategory[],
): Finding[] {
  const findings: Finding[] = [];
  findings.push(
    standardFinding(
      "bus-core-components",
      "launch",
      missingBusCategories.length === 0 ? "ok" : "fail",
      "Required spacecraft bus categories",
      missingBusCategories.length === 0 ? "complete" : missingBusCategories.join(", "),
      REQUIRED_BUS_CATEGORIES.join(", "),
      missingBusCategories.length === 0
        ? "The spacecraft includes each required bus subsystem."
        : `The design is missing required subsystems: ${missingBusCategories.join(", ")}.`,
      missingBusCategories.length === 0
        ? "The spacecraft has the basic hardware needed to operate."
        : "A spacecraft without these subsystems cannot safely execute its mission.",
      "Add one component from each missing bus category.",
    ),
    marginFinding(
      "mass-dry-margin",
      "mass",
      "Dry mass margin (%)",
      mass.dryMassMarginFraction,
      requiredMarginFraction,
      `Dry spacecraft mass is ${format(mass.dryMassKg)} kg against ${format(mass.launchCapacityKg)} kg of launcher capacity.`,
      "Dry-mass margin is the launcher capacity left after dry hardware, divided by dry mass.",
      "Remove dry hardware or select a launcher with more capacity.",
    ),
    marginFinding(
      "mass-wet-margin",
      "mass",
      "Wet mass margin (%)",
      mass.wetMassMarginFraction,
      requiredMarginFraction,
      `Wet spacecraft mass is ${format(mass.wetMassKg)} kg, including propellant, against ${format(mass.launchCapacityKg)} kg of capacity.`,
      "Wet-mass margin includes propellant and protects against launch-mass growth.",
      "Reduce payload or propellant mass, or choose a launcher with more capacity.",
    ),
    standardFinding(
      "mass-total",
      "mass",
      mass.wetMassKg <= mass.launchCapacityKg ? "ok" : "fail",
      "Wet spacecraft mass (kg)",
      round(mass.wetMassKg, 2),
      mass.launchCapacityKg,
      `The complete wet spacecraft weighs ${format(mass.wetMassKg)} kg; the launcher limit is ${format(mass.launchCapacityKg)} kg.`,
      mass.wetMassKg <= mass.launchCapacityKg
        ? "The spacecraft fits within the launcher payload limit."
        : "The spacecraft is too heavy to launch to this orbit.",
      "Remove mass or select a launcher with more payload capacity.",
    ),
    marginFinding(
      "power-generation",
      "power",
      "Orbit-average power margin (%)",
      power.powerMarginFraction,
      requiredMarginFraction,
      `End-of-life average power is ${format(power.orbitAveragePowerGenerationW)} W against ${format(power.averagePowerLoadW)} W of average load.`,
      "Orbit-average power accounts for sunlight, eclipse, panel losses, and aging.",
      "Add panel area, reduce instrument duty cycle, or lower bus power.",
    ),
    marginFinding(
      "power-eclipse-battery",
      "power",
      "Eclipse energy margin (%)",
      power.energyMarginFraction,
      requiredMarginFraction,
      `Usable battery energy is ${format(power.usableBatteryEnergyWh)} Wh against ${format(power.eclipseEnergyRequiredWh)} Wh needed during eclipse.`,
      "Energy margin compares usable battery storage with the load during one modeled eclipse.",
      "Add battery capacity or reduce loads during eclipse.",
    ),
  );

  const telecomSeverity =
    communications.linkMarginDb < 0
      ? "fail"
      : communications.linkMarginDb < communications.requiredLinkMarginDb
        ? "warning"
        : "ok";
  findings.push(
    standardFinding(
      "comms-link-margin",
      "communications",
      telecomSeverity,
      "Link margin (dB)",
      round(communications.linkMarginDb, 2),
      `${communications.requiredLinkMarginDb} dB required`,
      `The best antenna has ${format(communications.linkMarginDb)} dB link margin at ${format(orbit.typicalLinkDistanceKm)} km; the link requires ${communications.requiredLinkMarginDb} dB.`,
      telecomSeverity === "ok"
        ? "The simplified link has enough margin to sustain the modeled data rate."
        : telecomSeverity === "warning"
          ? "The link closes, but it does not have the full recommended reserve."
          : "The signal is too weak to close the selected link.",
      "Choose a higher-gain antenna or a closer communication distance.",
    ),
    standardFinding(
      "comms-link-rate",
      "communications",
      communications.effectiveDownlinkMbps > 0 ? "ok" : "fail",
      "Effective downlink rate (Mbps)",
      round(communications.effectiveDownlinkMbps, 4),
      "greater than 0 Mbps",
      `After link-margin derating and contact strategy, the estimated rate is ${format(communications.effectiveDownlinkMbps)} Mbps.`,
      communications.effectiveDownlinkMbps > 0
        ? "The antenna can return data at the estimated rate."
        : "No selected antenna can return mission data.",
      "Add an antenna or improve link margin.",
    ),
    standardFinding(
      "data-throughput",
      "data",
      data.lostDataGB <= 0 ? "ok" : "warning",
      "Generated / returned / lost data (GB)",
      `${round(data.generatedGB, 2)} / ${round(data.returnedDataGB, 2)} / ${round(data.lostDataGB, 2)}`,
      `${round(data.generatedGB, 2)} GB generated`,
      `Instruments generate ${format(data.generatedGB)} GB; ${format(data.returnedDataGB)} GB are returned and ${format(data.lostDataGB)} GB are not returned.`,
      data.lostDataGB > 0
        ? "Some collected science cannot reach Earth before the mission ends."
        : "The modeled communications plan returns all generated data.",
      "Reduce instrument duty cycle, add recorder capacity, or increase downlink capacity.",
    ),
    standardFinding(
      "data-buffer",
      "data",
      data.lostDataGB <= 0 ? "ok" : "warning",
      "Recorder and downlink buffer (GB)",
      round(data.returnedDataGB, 2),
      round(data.downlinkCapacityGB, 2),
      `The recorder stores ${format(data.recorderCapacityGB)} GB; contacts can downlink up to ${format(data.downlinkCapacityGB)} GB over this mission.`,
      data.lostDataGB > 0
        ? "Downlink capacity or recorder storage limits returned observations."
        : "The recorder and contacts can support all planned data.",
      "Increase recorder storage or schedule more ground-station contact time.",
    ),
    standardFinding(
      "propulsion-delta-v",
      "propulsion",
      !deltaV.insertionCovered ? "fail" : deltaV.totalDeltaVCovered ? "ok" : "warning",
      "Available / required delta-v (m/s)",
      `${round(deltaV.availableDeltaVms, 1)} / ${round(deltaV.requiredDeltaVms, 1)}`,
      deltaV.requiredDeltaVms,
      `The rocket equation estimates ${format(deltaV.availableDeltaVms)} m/s from the wet spacecraft; insertion, stationkeeping, and deorbit need ${format(deltaV.requiredDeltaVms)} m/s.`,
      !deltaV.insertionCovered
        ? "The spacecraft cannot perform the maneuver needed to enter the planned trajectory."
        : deltaV.totalDeltaVCovered
          ? "The spacecraft can cover insertion, stationkeeping, and deorbit."
          : "Insertion is possible, but the full stationkeeping and deorbit budget is not covered.",
      "Add suitable propulsion and propellant, or choose a trajectory delivered by the launcher.",
    ),
    standardFinding(
      "orbit-drag-lifetime",
      "propulsion",
      deltaV.achievableLifetimeMonths <
        design.operationsPlan.missionDurationMonths
        ? "warning"
        : "ok",
      "Achievable lifetime (months)",
      round(deltaV.achievableLifetimeMonths, 1),
      scenario.threshold.minLifetimeMonths,
      `Available propellant and natural orbit lifetime support about ${format(deltaV.achievableLifetimeMonths)} months.`,
      deltaV.achievableLifetimeMonths <
        design.operationsPlan.missionDurationMonths
        ? `The estimated lifetime is shorter than the ${design.operationsPlan.missionDurationMonths}-month plan.`
        : "The estimated lifetime supports the planned mission duration.",
      "Add propellant or choose a longer-lived orbit.",
    ),
    standardFinding(
      "mission-reliability",
      "reliability",
      reliability.missionSuccessProbability >= RELIABILITY_WARNING_THRESHOLD_FRACTION
        ? "ok"
        : "warning",
      "Mission success probability (%)",
      round(reliability.missionSuccessProbability * PERCENT_UNITS_PER_FRACTION, 2),
      "educational estimate",
      `One-year component survival is extended over ${design.operationsPlan.missionDurationMonths} months and adjusted for radiation and rideshare risks.`,
      "Longer missions and more series-connected hardware reduce the chance of full mission success.",
      "Select reliable or radiation-hardened parts and avoid unnecessary series dependencies.",
    ),
    standardFinding(
      "reliability-weakest-subsystem",
      "reliability",
      reliability.weakestSubsystemProbability >= RELIABILITY_WARNING_THRESHOLD_FRACTION
        ? "ok"
        : "warning",
      "Weakest subsystem",
      `${reliability.weakestSubsystem} (${round(reliability.weakestSubsystemProbability * PERCENT_UNITS_PER_FRACTION, 2)}%)`,
      "highest risk contributor",
      `${reliability.weakestSubsystem} has the lowest modeled survival probability.`,
      "A failure in the weakest subsystem is the largest single reliability concern in this design.",
      "Upgrade or add parallel redundancy to this subsystem.",
    ),
    standardFinding(
      "cost-reserve",
      "cost",
      "ok",
      "Risk reserve (%)",
      round(cost.reserveFraction * PERCENT_UNITS_PER_FRACTION, 1),
      "15-35%",
      `A ${format(cost.reserveFraction * PERCENT_UNITS_PER_FRACTION)}% reserve reflects the modeled mission reliability.`,
      "This reserve is included in the total cost estimate.",
      "Improve reliability to reduce the risk-based reserve.",
    ),
    standardFinding(
      "mission-cost",
      "cost",
      cost.totalCostM <= scenario.availableBudgetM ? "ok" : "fail",
      "Total mission cost including reserve (USD millions)",
      round(cost.totalCostM, 2),
      scenario.availableBudgetM,
      `Parts, launcher, and operations cost ${format(cost.rawMissionCostM)}M before a ${format(cost.reserveCostM)}M risk reserve.`,
      cost.totalCostM <= scenario.availableBudgetM
        ? "The estimated mission cost including reserve fits the budget."
        : "The estimated cost including reserve exceeds the hard scenario budget cap.",
      "Choose lower-cost parts or reduce mission operations cost.",
    ),
    standardFinding(
      "launch-payload-capacity",
      "launch",
      mass.wetMassKg <= mass.launchCapacityKg ? "ok" : "fail",
      "Wet mass / launch capacity (kg)",
      `${round(mass.wetMassKg, 2)} / ${mass.launchCapacityKg}`,
      mass.launchCapacityKg,
      `The launch vehicle can deliver ${mass.launchCapacityKg} kg to this insertion class.`,
      mass.wetMassKg <= mass.launchCapacityKg
        ? "Wet payload mass fits the destination-specific launch capacity."
        : "The launcher cannot carry this wet spacecraft to the selected orbit.",
      "Reduce mass or select a launcher with sufficient capacity.",
    ),
    standardFinding(
      "launch-fixed-orbit",
      "launch",
      launcher.fixedOrbitId && launcher.fixedOrbitId !== orbit.id ? "fail" : "ok",
      "Launcher orbit compatibility",
      "checked",
      "selected launcher supports selected orbit",
      "Dedicated launches can select the planned orbit; rideshare may impose orbit and schedule risks.",
      "Rideshare orbit or schedule changes are represented as reliability penalties.",
      "Choose a dedicated launch if the rideshare orbit does not match the mission.",
    ),
    standardFinding(
      "science-score",
      "science",
      scienceScorePoints >= scenario.threshold.minScienceScorePoints ? "ok" : "warning",
      "Science score (points)",
      round(scienceScorePoints, 2),
      scenario.threshold.minScienceScorePoints,
      `Instrument value is adjusted for scenario fit, pointing, duty cycle, redundant measurements, and data returned.`,
      scienceScorePoints >= scenario.threshold.minScienceScorePoints
        ? "The science score reaches the threshold target."
        : "The science score does not reach the threshold target.",
      "Select instruments that measure the required topics and can return useful observations.",
    ),
  );
  for (const criterion of [...thresholdCriteria, ...baselineCriteria]) {
    findings.push(
      standardFinding(
        `criterion-${criterion.id}-${thresholdCriteria.includes(criterion) ? "threshold" : "baseline"}`,
        "science",
        criterion.passed ? "ok" : "warning",
        criterion.label,
        typeof criterion.actual === "number" ? criterion.actual : String(criterion.actual),
        criterion.required,
        `${criterion.label} is checked against the scenario's ${thresholdCriteria.includes(criterion) ? "threshold" : "baseline"} requirement.`,
        criterion.passed ? "This requirement is met." : "This requirement is not met.",
        `Review the ${criterion.label.toLowerCase()} requirement and adjust the design.`,
      ),
    );
  }
  return findings;
}

function marginFinding(
  id: string,
  category: Finding["category"],
  metric: string,
  actualMargin: number,
  requiredMargin: number,
  cause: string,
  effect: string,
  suggestion: string,
): Finding {
  const severity = marginSeverity(actualMargin, requiredMargin);
  return standardFinding(
    id,
    category,
    severity,
    metric,
    round(actualMargin * PERCENT_UNITS_PER_FRACTION, 1),
    round(requiredMargin * PERCENT_UNITS_PER_FRACTION, 1),
    cause,
    effect,
    suggestion,
  );
}

function buildShortfalls(
  requiredMarginFraction: number,
  mass: ReturnType<typeof calculateMass>,
  power: ReturnType<typeof calculatePower>,
  linkMarginDbValue: number,
  requiredLinkMarginDbValue: number,
): ResourceShortfall[] {
  const massRequirement = (margin: number, id: string): ResourceShortfall => ({
    id,
    actualMargin: margin,
    requiredMargin: requiredMarginFraction,
    shortfall: Math.max(0, requiredMarginFraction - margin),
  });
  return [
    massRequirement(mass.dryMassMarginFraction, "mass-dry"),
    massRequirement(mass.wetMassMarginFraction, "mass-wet"),
    massRequirement(power.powerMarginFraction, "power"),
    massRequirement(power.energyMarginFraction, "energy"),
    {
      id: "telecom",
      actualMargin: linkMarginDbValue,
      requiredMargin: requiredLinkMarginDbValue,
      shortfall: Math.max(0, requiredLinkMarginDbValue - linkMarginDbValue),
    },
  ];
}

function calculateScore(
  metrics: EvaluationMetrics,
  scenario: Scenario,
  outcome: EvaluationResult["outcome"],
): EvaluationScore {
  const sciencePoints = clampScore(metrics.scienceScorePoints);
  const efficiencyPoints = clampScore(
    MAXIMUM_SCORE_POINTS -
      Math.max(0, metrics.wetMassMarginFraction) * 10 -
      Math.max(0, metrics.powerMarginFraction) * 10,
  );
  const resiliencePoints =
    metrics.missionSuccessProbability * PERCENT_UNITS_PER_FRACTION;
  const costPoints = clampScore(
    MAXIMUM_SCORE_POINTS * (1 - metrics.totalCostM / scenario.availableBudgetM),
  );
  const totalPoints =
    sciencePoints * SCIENCE_SCORE_WEIGHT_FRACTION +
    efficiencyPoints * EFFICIENCY_SCORE_WEIGHT_FRACTION +
    resiliencePoints * RESILIENCE_SCORE_WEIGHT_FRACTION +
    costPoints * COST_SCORE_WEIGHT_FRACTION +
    (outcome === "success"
      ? SUCCESS_OUTCOME_BONUS_POINTS
      : outcome === "partial"
        ? PARTIAL_OUTCOME_BONUS_POINTS
        : 0);
  return {
    sciencePoints: round(sciencePoints, 1),
    efficiencyPoints: round(efficiencyPoints, 1),
    resiliencePoints: round(resiliencePoints, 1),
    costPoints: round(costPoints, 1),
    totalPoints: round(totalPoints, 1),
  };
}

function instrumentSelections(scenario: Scenario, orbit: Orbit): PartQuantity[][] {
  const candidateInstruments = instruments.filter((instrument) =>
    instrument.compatibleBodies.includes(orbit.centralBody),
  );
  const selections: PartQuantity[][] = [];
  const visit = (startIndex: number, selected: PartQuantity[], totalCount: number): void => {
    if (
      selected.length > 0 &&
      selectionMeetsRequiredTags(selected, scenario)
    ) {
      selections.push([...selected]);
    }
    if (totalCount >= MAXIMUM_ENUMERATED_INSTRUMENT_COUNT) return;
    for (let index = startIndex; index < candidateInstruments.length; index += 1) {
      const instrument = candidateInstruments[index];
      if (!instrument) continue;
      selected.push({ id: instrument.id, qty: 1 });
      visit(index + 1, selected, totalCount + 1);
      selected.pop();
    }
  };
  visit(0, [], 0);
  return selections;
}

function selectionMeetsRequiredTags(
  selected: PartQuantity[],
  scenario: Scenario,
): boolean {
  const observedTags = new Set(
    selected.flatMap(({ id }) => getInstrument(id).scienceTags),
  );
  return scenario.requiredScienceTagMode === "all"
    ? scenario.threshold.requiredScienceTags.every((tag) => observedTags.has(tag))
    : scenario.threshold.requiredScienceTags.length === 0 ||
        scenario.threshold.requiredScienceTags.some((tag) => observedTags.has(tag));
}

function busSelections(): PartQuantity[][] {
  const choices = REQUIRED_BUS_CATEGORIES.map((category) => {
    const categoryParts = busComponents.filter((component) => component.category === category);
    return categoryParts.flatMap((component) => {
      const quantityLimit =
        category === "solarPanel"
          ? MAXIMUM_PANEL_COUNT_PER_DESIGN
          : category === "battery"
            ? MAXIMUM_BATTERY_COUNT_PER_DESIGN
            : category === "dataStorage"
              ? MAXIMUM_DATA_STORAGE_COUNT_PER_DESIGN
              : 1;
      return Array.from({ length: quantityLimit }, (_, index) => ({
        id: component.id,
        qty: index + 1,
      }));
    });
  });
  const propulsionChoices: PartQuantity[][] = [
    [],
    ...busComponents
      .filter((component) => component.category === "propulsion")
      .flatMap((component) =>
        Array.from({ length: MAXIMUM_PROPULSION_COUNT_PER_DESIGN }, (_, index) => [
          { id: component.id, qty: index + 1 },
        ]),
      ),
  ];
  const results: PartQuantity[][] = [];
  const selectCategory = (categoryIndex: number, selected: PartQuantity[]): void => {
    if (categoryIndex === choices.length) {
      for (const propulsion of propulsionChoices) {
        results.push([...selected, ...propulsion]);
      }
      return;
    }
    for (const option of choices[categoryIndex] ?? []) {
      selected.push(option);
      selectCategory(categoryIndex + 1, selected);
      selected.pop();
    }
  };
  selectCategory(0, []);
  return results;
}

function clampProbability(value: number): number {
  return Math.min(
    MAXIMUM_PROBABILITY_FRACTION,
    Math.max(MINIMUM_PROBABILITY_FRACTION, value),
  );
}

function clampScore(value: number): number {
  return Math.min(MAXIMUM_SCORE_POINTS, Math.max(0, value));
}

function standardFinding(
  id: string,
  category: Finding["category"],
  severity: Finding["severity"],
  metric: string,
  value: Finding["value"],
  limit: Finding["limit"],
  cause: string,
  effect: string,
  suggestion: string,
): Finding {
  return { id, category, severity, metric, value, limit, cause, effect, suggestion };
}

function round(value: number, decimalPlaces: number): number {
  const multiplier = 10 ** decimalPlaces;
  return Math.round(value * multiplier) / multiplier;
}

function format(value: number): string {
  return Number.isFinite(value) ? round(value, 2).toString() : "not available";
}
