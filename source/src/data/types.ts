export type ComponentTier = "simple" | "intermediate" | "advanced";
export type BusCategory =
  | "structure"
  | "solarPanel"
  | "battery"
  | "computer"
  | "adcs"
  | "propulsion"
  | "antenna"
  | "dataStorage";
export type BodyId = "earth" | "moon" | "sun-transfer";
export type OrbitKind = "bound" | "transfer";
export type OrbitId =
  | "LEO"
  | "SSO"
  | "MEO"
  | "GEO"
  | "HEO"
  | "LUNAR"
  | "MARS_TRANSFER";
export type InsertionClass = "LEO" | "SSO" | "GTO" | "TLI";
export type CmlStage = "CML1" | "CML2" | "CML3" | "CML4";
export type ScienceTag =
  | "earth-imaging"
  | "climate"
  | "land"
  | "magnetic-fields"
  | "space-weather"
  | "planetary-science"
  | "minerals"
  | "atmosphere"
  | "temperature"
  | "astronomy"
  | "imaging"
  | "radiation"
  | "solar-wind"
  | "lunar-surface";
export type EventId =
  | "solar-flare"
  | "instrument-glitch"
  | "comms-dropout"
  | "micrometeoroid"
  | "bonus-extension"
  | "budget-cut";
export type FindingSeverity = "ok" | "warning" | "fail";
export type FindingCategory =
  | "mass"
  | "power"
  | "data"
  | "communications"
  | "propulsion"
  | "cost"
  | "reliability"
  | "science"
  | "launch";

export interface Instrument {
  id: string;
  name: string;
  massKg: number;
  powerW: number;
  costM: number;
  dataRateMbps: number;
  scienceValuePoints: number;
  reliabilityProbability: number;
  scienceTags: ScienceTag[];
  compatibleBodies: BodyId[];
  requiredPointingArcsec: number;
  description: string;
  whyItMatters: string;
}

export interface BusPerformance {
  solarAreaM2?: number;
  solarEfficiencyFraction?: number;
  batteryCapacityWh?: number;
  maxDepthOfDischargeFraction?: number;
  storageGB?: number;
  downlinkMbps?: number;
  antennaGainDb?: number;
  referenceGainDb?: number;
  baseLinkMarginDb?: number;
  referenceDistanceKm?: number;
  pointingAccuracyArcsec?: number;
  propellantKg?: number;
  specificImpulseSec?: number;
  radiationHardeningFraction?: number;
  reliabilityProbability?: number;
}

export interface BusComponent {
  id: string;
  name: string;
  category: BusCategory;
  tier: ComponentTier;
  massKg: number;
  powerW: number;
  costM: number;
  performance: BusPerformance;
  description: string;
  whyItMatters: string;
}

export interface Launcher {
  id: string;
  name: string;
  costM: number;
  payloadKgByClass: Record<InsertionClass, number>;
  reliabilityProbability: number;
  fairingDiameterM: number;
  fairingHeightM: number;
  missionMode: "dedicated" | "rideshare";
  fixedOrbitId?: OrbitId;
  fixedOrbitRiskProbability: number;
  scheduleDelayRiskProbability: number;
}

export interface Orbit {
  id: OrbitId;
  name: string;
  centralBody: BodyId;
  kind: OrbitKind;
  altitudeKm: number;
  perigeeAltKm?: number;
  apogeeAltKm?: number;
  inclinationDeg: number;
  eclipseFractionOfOrbit: number;
  contactMinutesPerDay: number;
  radiationLevelIndex: number;
  naturalOrbitLifetimeMonths: number;
  insertionClass: InsertionClass;
  solarFluxWPerM2: number;
  typicalLinkDistanceKm: number;
  insertionDeltaVms: number;
  stationkeepingDeltaVmsPerYear: number;
  deorbitDeltaVms: number;
  encounterWindowDays?: number;
  closestApproachDistanceKm?: number;
  cruiseDurationDays?: number;
  coverageNotes: string;
  beginnerExplanation: string;
}

export interface MissionEvent {
  id: EventId;
  name: string;
  description: string;
  probabilityPerYear: number;
  affectedSubsystem: "power" | "instrument" | "communications" | "structure" | "budget";
  severity: FindingSeverity;
}

export interface ScienceRequirements {
  minScienceScorePoints: number;
  requiredScienceTags: ScienceTag[];
  dataReturnGB: number;
  minLifetimeMonths: number;
}

export interface Scenario {
  id: string;
  title: string;
  story: string;
  objective: string;
  threshold: ScienceRequirements;
  baseline: ScienceRequirements;
  requiredScienceTagMode: "all" | "any";
  availableBudgetM: number;
  defaultOperationsCostMPerMonth: number;
  targetCml: CmlStage;
  difficulty: "beginner" | "intermediate";
  allowedOrbits: OrbitId[];
  hiddenEventsPool: EventId[];
  missionAnalog: string;
}

export interface PartQuantity {
  id: string;
  qty: number;
}

export interface MissionDesign {
  scenarioId: string;
  instruments: PartQuantity[];
  busComponents: PartQuantity[];
  launcherId: string;
  orbitId: OrbitId;
  operationsPlan: {
    dutyCyclePercent: number;
    downlinkStrategy: "scheduled" | "opportunistic";
    missionDurationMonths: number;
    operationsCostMPerMonth: number;
  };
}

export interface Finding {
  id: string;
  category: FindingCategory;
  severity: FindingSeverity;
  metric: string;
  value: number | string;
  limit: number | string;
  cause: string;
  effect: string;
  suggestion: string;
}
