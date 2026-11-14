import busComponentData from "./bus-components.json";
import eventData from "./events.json";
import instrumentData from "./instruments.json";
import launcherData from "./launchers.json";
import orbitData from "./orbits.json";
import scenarioData from "./scenarios.json";
import type {
  BodyId,
  BusCategory,
  BusComponent,
  ComponentTier,
  CmlStage,
  EventId,
  InsertionClass,
  Instrument,
  Launcher,
  MissionEvent,
  Orbit,
  OrbitId,
  OrbitKind,
  Scenario,
  ScienceTag,
} from "./types";

const busCategories: BusCategory[] = [
  "structure",
  "solarPanel",
  "battery",
  "computer",
  "adcs",
  "propulsion",
  "antenna",
  "dataStorage",
];
const componentTiers: ComponentTier[] = ["simple", "intermediate", "advanced"];
const bodyIds: BodyId[] = ["earth", "moon", "sun-transfer"];
const orbitKinds: OrbitKind[] = ["bound", "transfer"];
const orbitIds: OrbitId[] = ["LEO", "SSO", "MEO", "GEO", "HEO", "LUNAR", "MARS_TRANSFER"];
const insertionClasses: InsertionClass[] = ["LEO", "SSO", "GTO", "TLI"];
const cmlStages: CmlStage[] = ["CML1", "CML2", "CML3", "CML4"];
const eventIds: EventId[] = [
  "solar-flare",
  "instrument-glitch",
  "comms-dropout",
  "micrometeoroid",
  "bonus-extension",
  "budget-cut",
];
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
const scenarioDifficulties: Scenario["difficulty"][] = ["beginner", "intermediate"];
const eventSubsystems: MissionEvent["affectedSubsystem"][] = [
  "power",
  "instrument",
  "communications",
  "structure",
  "budget",
];
const findingSeverities: MissionEvent["severity"][] = ["ok", "warning", "fail"];

// Catalog values are educational estimates informed by public datasheets and mission references.
export const instruments: Instrument[] = instrumentData.map((instrument) => ({
  ...instrument,
  scienceTags: instrument.scienceTags.map((tag) =>
    parseEnum<ScienceTag>(tag, scienceTags, "science tag"),
  ),
  compatibleBodies: instrument.compatibleBodies.map((body) =>
    parseEnum<BodyId>(body, bodyIds, "compatible body"),
  ),
}));
export const busComponents: BusComponent[] = busComponentData.map((component) => ({
  ...component,
  category: parseEnum<BusCategory>(component.category, busCategories, "bus category"),
  tier: parseEnum<ComponentTier>(component.tier, componentTiers, "component tier"),
}));
export const launchers: Launcher[] = launcherData.map((launcher) => ({
  ...launcher,
  payloadKgByClass: {
    LEO: launcher.payloadKgByClass.LEO,
    SSO: launcher.payloadKgByClass.SSO,
    GTO: launcher.payloadKgByClass.GTO,
    TLI: launcher.payloadKgByClass.TLI,
  },
  missionMode: parseEnum<Launcher["missionMode"]>(
    launcher.missionMode,
    ["dedicated", "rideshare"],
    "launcher mission mode",
  ),
  fixedOrbitId: launcher.fixedOrbitId
    ? parseEnum<OrbitId>(launcher.fixedOrbitId, orbitIds, "launcher fixed orbit")
    : undefined,
}));
export const orbits: Orbit[] = orbitData.map((orbit) => ({
  ...orbit,
  centralBody: parseEnum<BodyId>(orbit.centralBody, bodyIds, "central body"),
  kind: parseEnum<OrbitKind>(orbit.kind, orbitKinds, "orbit kind"),
  id: parseEnum<OrbitId>(orbit.id, orbitIds, "orbit id"),
  insertionClass: parseEnum<InsertionClass>(
    orbit.insertionClass,
    insertionClasses,
    "insertion class",
  ),
}));
export const scenarios: Scenario[] = scenarioData.map((scenario) => ({
  ...scenario,
  targetCml: parseEnum<CmlStage>(scenario.targetCml, cmlStages, "target CML"),
  difficulty: parseEnum<Scenario["difficulty"]>(
    scenario.difficulty,
    scenarioDifficulties,
    "scenario difficulty",
  ),
  requiredScienceTagMode: parseEnum<Scenario["requiredScienceTagMode"]>(
    scenario.requiredScienceTagMode,
    ["all", "any"],
    "required science-tag mode",
  ),
  allowedOrbits: scenario.allowedOrbits.map((id) =>
    parseEnum<OrbitId>(id, orbitIds, "scenario orbit id"),
  ),
  hiddenEventsPool: scenario.hiddenEventsPool.map((id) =>
    parseEnum<EventId>(id, eventIds, "scenario event id"),
  ),
  threshold: {
    ...scenario.threshold,
    requiredScienceTags: scenario.threshold.requiredScienceTags.map((tag) =>
      parseEnum<ScienceTag>(tag, scienceTags, "threshold science tag"),
    ),
  },
  baseline: {
    ...scenario.baseline,
    requiredScienceTags: scenario.baseline.requiredScienceTags.map((tag) =>
      parseEnum<ScienceTag>(tag, scienceTags, "baseline science tag"),
    ),
  },
}));
export const events: MissionEvent[] = eventData.map((event) => ({
  ...event,
  id: parseEnum<EventId>(event.id, eventIds, "event id"),
  affectedSubsystem: parseEnum<MissionEvent["affectedSubsystem"]>(
    event.affectedSubsystem,
    eventSubsystems,
    "event subsystem",
  ),
  severity: parseEnum<MissionEvent["severity"]>(
    event.severity,
    findingSeverities,
    "event severity",
  ),
}));

export const catalogs = { instruments, busComponents, launchers, orbits, scenarios, events };

function parseEnum<AllowedValue extends string>(
  value: string,
  allowedValues: readonly AllowedValue[],
  label: string,
): AllowedValue {
  const matchedValue = allowedValues.find((allowedValue) => allowedValue === value);
  if (!matchedValue) {
    throw new TypeError(`Invalid ${label} in data catalog: ${value}`);
  }
  return matchedValue;
}
