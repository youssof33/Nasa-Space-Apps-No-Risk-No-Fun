import { signal } from "@preact/signals";
import { compute, emptyBuild, score } from "./hussein/engine";
import { evaluateFlight, FLIGHT_LV, type FlightEvaluation } from "./flight";
import { missionById, scenarioOf } from "./missions";
import { craftSpecOf, type CraftSpec } from "./stage";

export interface BuildState {
  bus: string | null;
  power: string | null;
  comms: string | null;
  instruments: string[];
}

/**
 * The restored `game oldd` flight configuration. These are the options the
 * original Mission Design screen exposed beyond bus/power/comms/payload; they
 * are carried verbatim into Mission Control's flight model at launch.
 */
export interface FlightState {
  battery: string;
  ground: string;
  recorder: string;
  redundancy: string;
  propulsion: string;
  launcher: string;
  years: number;
  difficulty: string;
}

export interface DesignState {
  scenarioId: string;
  orbit: string;
  build: BuildState;
  flight: FlightState;
}

export const MAX_INSTRUMENTS = 3;

/* ---------------------------------------------------------------------------
   Explicit mapping tables, shared design -> Mission Control flight model.
   The flight model is the authority; these tables are the only place where
   Hussein's part ids become Mission Control part ids.
   --------------------------------------------------------------------------- */
const OPS_BUS: Record<string, string> = {
  earth: "espa",
  moon: "obs",
  mars: "obs",
};

const OPS_ARRAY: Record<string, string> = {
  pwr_array: "a1200",
  pwr_array_xl: "a3000",
  pwr_array_dual: "a3000",
  pwr_rtg: "h_rtg",
};

const OPS_INSTRUMENT: Record<string, string> = {
  cam: "cam",
  spec: "spec",
  radar: "radar",
  mag: "mag",
  wx: "h_wx",
};

const OPS_COMMS: Record<string, string> = {
  com_s: "s",
  com_x: "x",
  com_ka: "ka",
};

const OPS_ORBIT: Record<string, Record<string, string>> = {
  "polar-watch": { leo: "h_leo", sso: "h_sso", geo: "h_geo" },
  "lunar-ice": { low: "h_polar", mid: "h_frozen", halo: "h_halo" },
  "mars-dust": { low: "h_low", sso: "h_msso", sync: "h_areo" },
};

const OPS_GROUND: Record<string, string> = {
  earth: "nen",
  moon: "dsn",
  mars: "dsn",
};

/* The flight model needs a payload that can actually do the objective. If the
   design leaves a required science tag uncovered, the matching instrument is
   added to the flight configuration (Hussein's model does not gate on tags). */
const OPS_TAG_INSTRUMENT: Record<string, string> = {
  imaging: "cam",
  composition: "spec",
  subsurface: "radar",
  topography: "alt",
  weather: "h_wx",
  fields: "mag",
};

const OPS_INSTRUMENT_TAG: Record<string, string> = {
  cam: "imaging",
  spec: "composition",
  radar: "subsurface",
  mag: "fields",
  alt: "topography",
  h_cam: "imaging",
  h_spec: "composition",
  h_radar: "subsurface",
  h_mag: "fields",
  h_wx: "weather",
};

const OPS_YEARS: Record<string, number> = {
  "polar-watch": 3,
  "lunar-ice": 5,
  "mars-dust": 5,
};

export interface OpsState {
  objective: string;
  bus: string;
  array: string;
  battery: string;
  instruments: string[];
  comms: string;
  orbit: string;
  launcher: string;
  years: number;
  gs: string;
  rec: string;
  red: string;
  prop: string;
}

export interface OpsPayload {
  state: OpsState;
  difficulty: string;
  /** The exact assembly drawn on the workbench, rebuilt by the ops scene. */
  craft: CraftSpec;
  /** Shared seed for the flight's random events; 0 or absent means unseeded. */
  seed?: number;
}

function defaultFlight(scenarioId: string): FlightState {
  const mission = missionById(scenarioId);
  return {
    battery: "b400",
    ground: OPS_GROUND[mission.body] ?? "nen",
    recorder: "r512",
    redundancy: "single",
    propulsion: "chem",
    launcher: "med",
    years: OPS_YEARS[mission.id] ?? 3,
    difficulty: "engineer",
  };
}

/** The full flight configuration implied by a workbench design. */
export function flightConfigOf(state: DesignState): OpsState {
  const mission = missionById(state.scenarioId);
  const build = state.build;

  const instruments = new Set(
    build.instruments.map((id) => OPS_INSTRUMENT[id]).filter((id): id is string => Boolean(id)),
  );
  const covered = new Set([...instruments].map((id) => OPS_INSTRUMENT_TAG[id]));
  for (const tag of mission.need) {
    if (!covered.has(tag)) instruments.add(OPS_TAG_INSTRUMENT[tag]);
  }

  return {
    objective: mission.objective,
    bus: OPS_BUS[mission.body] ?? "espa",
    array: OPS_ARRAY[build.power ?? ""] ?? "a1200",
    battery: state.flight.battery,
    instruments: instruments.size ? [...instruments] : ["cam"],
    comms: OPS_COMMS[build.comms ?? ""] ?? "x",
    orbit: OPS_ORBIT[mission.id]?.[state.orbit] ?? "h_leo",
    launcher: state.flight.launcher,
    years: state.flight.years,
    gs: state.flight.ground,
    rec: state.flight.recorder,
    red: state.flight.redundancy,
    prop: state.flight.propulsion,
  };
}

export function flightPreviewOf(state: DesignState = design.value): FlightEvaluation {
  return evaluateFlight(flightConfigOf(state), state.flight.difficulty);
}

/* Pick the smallest vehicle the flight model can actually lift, using its own
   mass budget. The player can override this in the flight panel. */
function fitLauncher(state: DesignState): string {
  const config = flightConfigOf(state);
  for (const vehicle of FLIGHT_LV) {
    const evaluation = evaluateFlight({ ...config, launcher: vehicle.id }, state.flight.difficulty);
    if (evaluation.wet <= evaluation.cap) return vehicle.id;
  }
  return "heavy";
}

function initial(scenarioId: string): DesignState {
  const scenario = scenarioOf(scenarioId);
  const state: DesignState = {
    scenarioId: scenario.id,
    orbit: Object.keys(scenario.orbits)[0],
    build: { ...emptyBuild, instruments: [] },
    flight: defaultFlight(scenarioId),
  };
  state.flight.launcher = fitLauncher(state);
  return state;
}

export const design = signal<DesignState>(initial("polar-watch"));

export function setScenario(scenarioId: string): void {
  design.value = initial(scenarioId);
}

export function setOrbit(orbit: string): void {
  design.value = { ...design.value, orbit };
}

export function selectPart(category: "bus" | "power" | "comms", id: string): void {
  const build = design.value.build;
  design.value = {
    ...design.value,
    build: { ...build, [category]: build[category] === id ? null : id },
  };
}

export function toggleInstrument(id: string): void {
  const build = design.value.build;
  const has = build.instruments.includes(id);
  if (!has && build.instruments.length >= MAX_INSTRUMENTS) return;
  design.value = {
    ...design.value,
    build: {
      ...build,
      instruments: has
        ? build.instruments.filter((entry) => entry !== id)
        : [...build.instruments, id],
    },
  };
}

export function setFlight(patch: Partial<FlightState>): void {
  design.value = {
    ...design.value,
    flight: { ...design.value.flight, ...patch },
  };
}

export function setFlightYears(years: number): void {
  setFlight({ years: Math.max(1, Math.min(8, Math.round(years))) });
}

export function totalsOf(state: DesignState = design.value) {
  const scenario = scenarioOf(state.scenarioId);
  return compute(state.build, scenario, state.orbit);
}

export function previewOf(state: DesignState = design.value) {
  const totals = totalsOf(state);
  return { totals, ...score(totals, [], []) };
}

/* ---------------------------------------------------------------------------
   Explicit mapping table, Hussein -> Mission Architect (take-off scene).
   Hussein's design has bus / power / comms / instruments + orbit; Mission
   Architect builds its rocket from bus / vehicle / ground / life / test /
   payloads. The mapping is one-way and lossy on purpose: the launch scene only
   needs a plausible stack for the chosen body.
   --------------------------------------------------------------------------- */
const SHADY_BUS: Record<string, string> = {
  bus_std: "relay",
  bus_power: "relay",
  bus_rad: "deep",
};

const SHADY_PAYLOAD: Record<string, string> = {
  cam: "cam",
  spec: "spec",
  radar: "spec",
  mag: "mag",
  wx: "cam",
};

const SHADY_VEHICLE: Record<string, string> = {
  earth: "vector-m",
  moon: "vector-h",
  mars: "vector-h",
};

const SHADY_GROUND: Record<string, string> = {
  earth: "global",
  moon: "dsn",
  mars: "dsn",
};

const SHADY_REQUIRED: Record<string, string[]> = {
  ares: ["dish"],
  lunar: ["spec", "dish"],
  mars: ["spec", "dish", "rad"],
};

export interface ShadyPayload {
  mission: string;
  design: {
    bus: string;
    vehicle: string;
    ground: string;
    life: string;
    test: string;
    payloads: string[];
  };
}

export function shadyPayload(state: DesignState = design.value): ShadyPayload {
  const mission = missionById(state.scenarioId);
  const build = state.build;

  const payloads = new Set<string>();
  for (const id of build.instruments) {
    const mapped = SHADY_PAYLOAD[id];
    if (mapped) payloads.add(mapped);
  }
  if (build.comms === "com_x" || build.comms === "com_ka") payloads.add("dish");
  for (const required of SHADY_REQUIRED[mission.shady] ?? []) payloads.add(required);

  return {
    mission: mission.shady,
    design: {
      bus: SHADY_BUS[build.bus ?? ""] ?? "relay",
      vehicle: SHADY_VEHICLE[mission.body] ?? "vector-m",
      ground: SHADY_GROUND[mission.body] ?? "global",
      life: "36",
      test: "standard",
      payloads: [...payloads],
    },
  };
}

export function opsPayload(state: DesignState = design.value): OpsPayload {
  return {
    difficulty: state.flight.difficulty,
    state: flightConfigOf(state),
    craft: craftSpecOf(state),
  };
}
