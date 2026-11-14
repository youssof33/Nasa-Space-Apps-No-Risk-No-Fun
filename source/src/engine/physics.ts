import type { FindingSeverity, Orbit } from "../data/types";
import {
  BASE_LINK_MARGIN_DB,
  FREE_SPACE_PATH_LOSS_DB_PER_DISTANCE_DECADE,
  REFERENCE_ANTENNA_GAIN_DB,
  REFERENCE_LINK_DISTANCE_KM,
  STANDARD_GRAVITY_M_PER_S2,
  SYSTEM_LOSS_FRACTION,
} from "./constants";

export function resourceMarginFraction(available: number, required: number): number {
  if (required <= 0) return available >= 0 ? 1 : -1;
  return (available - required) / required;
}

export function marginSeverity(
  actualMargin: number,
  requiredMargin: number,
): FindingSeverity {
  return actualMargin < 0
    ? "fail"
    : actualMargin < requiredMargin
      ? "warning"
      : "ok";
}

export function rocketEquationDeltaVms(
  wetMassKg: number,
  propellantKg: number,
  specificImpulseSec: number,
): number {
  if (propellantKg <= 0 || wetMassKg <= propellantKg || specificImpulseSec <= 0) return 0;
  return (
    specificImpulseSec *
    STANDARD_GRAVITY_M_PER_S2 *
    Math.log(wetMassKg / (wetMassKg - propellantKg))
  );
}

export function solarOrbitAveragePowerW(
  solarFluxWPerM2: number,
  areaM2: number,
  efficiencyFraction: number,
  eclipseFractionOfOrbit: number,
  missionDurationYears: number,
  degradationFractionPerYear: number,
): number {
  const degradationFraction = Math.max(
    0,
    1 - degradationFractionPerYear * missionDurationYears,
  );
  const eclipseFactor = 1 - eclipseFractionOfOrbit;
  return (
    solarFluxWPerM2 *
    areaM2 *
    efficiencyFraction *
    SYSTEM_LOSS_FRACTION *
    eclipseFactor *
    degradationFraction
  );
}

export function linkMarginDb(
  antennaGainDb: number,
  linkDistanceKm: number,
  baseMarginDb = BASE_LINK_MARGIN_DB,
  referenceGainDb = REFERENCE_ANTENNA_GAIN_DB,
  referenceDistanceKm = REFERENCE_LINK_DISTANCE_KM,
): number {
  if (linkDistanceKm <= 0 || referenceDistanceKm <= 0) {
    throw new RangeError("Link distances must be greater than zero.");
  }
  return (
    baseMarginDb +
    (antennaGainDb - referenceGainDb) -
    FREE_SPACE_PATH_LOSS_DB_PER_DISTANCE_DECADE *
      Math.log10(linkDistanceKm / referenceDistanceKm)
  );
}

export function requiredLinkMarginDb(orbit: Orbit): number {
  return orbit.centralBody === "earth" && orbit.kind === "bound" ? 6 : 3;
}

export function effectiveDownlinkMbps(nominalMbps: number, marginDb: number): number {
  return marginDb < 0 ? nominalMbps * 10 ** (marginDb / 10) : nominalMbps;
}

export function survivalProbabilityAfterYears(
  annualSurvivalProbability: number,
  years: number,
): number {
  if (
    annualSurvivalProbability < 0 ||
    annualSurvivalProbability > 1 ||
    years < 0 ||
    !Number.isFinite(annualSurvivalProbability) ||
    !Number.isFinite(years)
  ) {
    throw new RangeError("Reliability probability must be in [0, 1] and years non-negative.");
  }
  return annualSurvivalProbability ** years;
}

export function parallelSurvivalProbability(
  annualSurvivalProbability: number,
  quantity: number,
  years = 1,
): number {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new RangeError("Parallel subsystem quantity must be a positive integer.");
  }
  const singleUnitSurvival = survivalProbabilityAfterYears(
    annualSurvivalProbability,
    years,
  );
  return 1 - (1 - singleUnitSurvival) ** quantity;
}
