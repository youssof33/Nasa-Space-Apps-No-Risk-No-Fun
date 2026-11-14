/* ==========================================================================
   Flight model preview — a faithful port of Mission Control's sim.js.
   The catalogue below mirrors `public/game/js/data.js` and exists only so the
   workbench can show the real flight consequences of the restored options
   before launch. The flight game remains the authority: the same configuration
   is handed over through `opsPayload` and evaluated again in the frame.
   ========================================================================== */

export interface FlightPart {
  id: string;
  name: string;
  mass?: number;
  cost: number;
  house?: number;
  shield?: number;
  w?: number;
  constant?: boolean;
  wh?: number;
  data?: number;
  sci?: number;
  tag?: string;
  mbps?: number;
  mul?: number;
  mitigate?: number;
  propMul?: number;
  power?: number;
  leo?: number;
  note?: string;
}

export const FLIGHT_BUS: FlightPart[] = [
  { id: "3u", name: "CubeSat bus", mass: 4, cost: 1.5, house: 5, shield: 30, note: "Cheap. Tiny payload bay." },
  { id: "espa", name: "ESPA smallsat bus", mass: 180, cost: 25, house: 60, shield: 60, note: "Workhorse for small science." },
  { id: "obs", name: "Observatory bus", mass: 520, cost: 120, house: 150, shield: 180, note: "Redundant, deep-space rated." },
  { id: "h_std", name: "Standard bus", mass: 180, cost: 18, house: 120, shield: 40, note: "Flight-proven 1.2 m bus." },
  { id: "h_pwr", name: "High-power bus", mass: 260, cost: 26, house: 260, shield: 70, note: "Bigger structure and harness." },
  { id: "h_rad", name: "Radiation-hardened bus", mass: 240, cost: 32, house: 180, shield: 220, note: "Survives the belts." },
];

export const FLIGHT_ARRAY: FlightPart[] = [
  { id: "a60", name: "Fixed 60 W panel", mass: 2, cost: 0.8, w: 60 },
  { id: "a400", name: "Deployable 400 W", mass: 12, cost: 4, w: 400 },
  { id: "a1200", name: "Deployable 1200 W", mass: 40, cost: 12, w: 1200 },
  { id: "a3000", name: "Twin 3000 W wings", mass: 90, cost: 25, w: 3000 },
  { id: "h_a420", name: "Deployable 420 W", mass: 45, cost: 9, w: 420 },
  { id: "h_a900", name: "High-gain 900 W", mass: 95, cost: 16, w: 900 },
  { id: "h_a1350", name: "Dual-wing 1350 W", mass: 140, cost: 24, w: 1350 },
  { id: "h_rtg", name: "MMRTG 110 W", mass: 45, cost: 22, w: 110, constant: true, note: "Works in the dark." },
];

export const FLIGHT_BATTERY: FlightPart[] = [
  { id: "b50", name: "50 Wh", mass: 1, cost: 0.3, wh: 50, note: "A few minutes of eclipse load." },
  { id: "b400", name: "400 Wh", mass: 6, cost: 1.5, wh: 400, note: "The smallsat standard." },
  { id: "b2000", name: "2000 Wh", mass: 25, cost: 6, wh: 2000, note: "Survives long eclipses and heater faults." },
];

export const FLIGHT_INSTR: FlightPart[] = [
  { id: "cam", name: "Multispectral imager", mass: 8, cost: 6, w: 15, data: 40, sci: 25, tag: "imaging", note: "Wide swath, high data volume." },
  { id: "spec", name: "Imaging spectrometer", mass: 12, cost: 10, w: 25, data: 12, sci: 30, tag: "composition", note: "Reads mineral fingerprints." },
  { id: "radar", name: "Radar sounder", mass: 30, cost: 22, w: 60, data: 25, sci: 35, tag: "subsurface", note: "Sees metres below the surface." },
  { id: "mag", name: "Magnetometer", mass: 3, cost: 2, w: 4, data: 0.5, sci: 15, tag: "fields", note: "Tiny, cheap, low data." },
  { id: "alt", name: "Laser altimeter", mass: 9, cost: 8, w: 20, data: 5, sci: 20, tag: "topography", note: "Precise elevation, small data." },
  { id: "hab", name: "Habitability suite", mass: 25, cost: 30, w: 45, data: 8, sci: 45, tag: "biosignature", note: "The expensive one." },
  { id: "plasma", name: "Plasma wave sensor", mass: 4, cost: 3, w: 6, data: 1, sci: 18, tag: "fields", note: "Space weather, almost free." },
  { id: "h_cam", name: "Multispectral camera", mass: 35, cost: 14, w: 45, data: 12, sci: 30, tag: "imaging", note: "Sharp visible imagery." },
  { id: "h_spec", name: "Ocean colour spectrometer", mass: 60, cost: 18, w: 70, data: 18, sci: 45, tag: "composition", note: "Core of the science case." },
  { id: "h_radar", name: "Ice-penetrating radar", mass: 140, cost: 34, w: 320, data: 60, sci: 70, tag: "subsurface", note: "Devours power and data." },
  { id: "h_mag", name: "Fluxgate magnetometer", mass: 8, cost: 5, w: 12, data: 0.5, sci: 25, tag: "fields", note: "Almost free." },
  { id: "h_wx", name: "Weather suite", mass: 40, cost: 16, w: 55, data: 8, sci: 35, tag: "weather", note: "Clouds, aerosols, storms." },
];

export const FLIGHT_COMMS: FlightPart[] = [
  { id: "uhf", name: "UHF omni", mass: 1, cost: 0.4, w: 3, mbps: 0.1, note: "Low rate, no pointing." },
  { id: "s", name: "S-band patch", mass: 4, cost: 2, w: 12, mbps: 2, note: "Standard, modest." },
  { id: "x", name: "X-band HGA", mass: 12, cost: 7, w: 35, mbps: 50, note: "High rate, needs pointing." },
  { id: "ka", name: "Ka-band HGA", mass: 20, cost: 14, w: 55, mbps: 200, note: "Huge rate, huge power." },
  { id: "h_s", name: "S-band (compact)", mass: 12, cost: 6, w: 25, mbps: 8, note: "Fine for a camera." },
  { id: "h_x", name: "X-band (compact)", mass: 28, cost: 12, w: 60, mbps: 30, note: "Planetary workhorse." },
  { id: "h_ka", name: "Ka-band deep space", mass: 45, cost: 20, w: 110, mbps: 80, note: "Heavy dish." },
];

export const FLIGHT_GROUND: FlightPart[] = [
  { id: "comm", name: "Commercial network", mul: 0.55, cost: 0.5, note: "A few passes a day. Cheap." },
  { id: "nen", name: "NASA Near Earth Network", mul: 1.0, cost: 3.0, note: "Standard science support." },
  { id: "dsn", name: "Deep Space Network", mul: 1.45, cost: 12, note: "Near-continuous coverage." },
];

export const FLIGHT_RECORDER: FlightPart[] = [
  { id: "none", name: "No recorder", mass: 0, cost: 0, note: "Stream live only. Data dies in eclipse." },
  { id: "r64", name: "64 Gb recorder", mass: 2, cost: 2.5, note: "Buffers a few orbits." },
  { id: "r512", name: "512 Gb recorder", mass: 5, cost: 6, note: "Buffers weeks of data." },
];

export const FLIGHT_REDUNDANCY: FlightPart[] = [
  { id: "single", name: "Single-string", mass: 0, cost: 1, mul: 1.0, mitigate: 0, note: "Cheapest. One failure ends the mission." },
  { id: "crit", name: "Redundant critical", mass: 14, cost: 1.28, mul: 1.28, mitigate: 0.45, note: "Backups on power and comms." },
  { id: "full", name: "Fully redundant", mass: 38, cost: 1.65, mul: 1.65, mitigate: 0.75, note: "Two of everything." },
];

export const FLIGHT_PROPULSION: FlightPart[] = [
  { id: "chem", name: "Chemical propulsion", propMul: 1.0, power: 0, cost: 0, note: "Fast burns, heavy tanks." },
  { id: "ep", name: "Electric propulsion", propMul: 0.35, power: 45, cost: 14, note: "Tiny propellant mass, big power draw." },
];

export interface FlightOrbit {
  id: string;
  name: string;
  body: string;
  eclipse: number;
  contact: number;
  launch: number;
  decay: number;
  rad: number;
  period: number;
  note: string;
}

export const FLIGHT_ORBIT: FlightOrbit[] = [
  { id: "sso", name: "LEO 550 km SSO", body: "earth", eclipse: 0.36, contact: 0.12, launch: 1.0, decay: 1.0, rad: 5, period: 1.5, note: "Freeze-thaw lighting." },
  { id: "polar", name: "LEO 800 km polar", body: "earth", eclipse: 0.36, contact: 0.12, launch: 1.05, decay: 0.3, rad: 20, period: 1.7, note: "Longer life, more radiation." },
  { id: "meo", name: "MEO 20,200 km", body: "earth", eclipse: 0.02, contact: 0.9, launch: 1.6, decay: 0, rad: 100, period: 12, note: "Near-constant contact." },
  { id: "geo", name: "GEO 35,786 km", body: "earth", eclipse: 0.02, contact: 0.95, launch: 1.9, decay: 0, rad: 50, period: 24, note: "Stares at one hemisphere." },
  { id: "lunar", name: "Lunar orbit 100 km", body: "moon", eclipse: 0.45, contact: 0.35, launch: 2.6, decay: 0, rad: 20, period: 2, note: "No magnetosphere." },
  { id: "mars", name: "Mars orbit 400 km", body: "mars", eclipse: 0.4, contact: 0.45, launch: 4.5, decay: 0.2, rad: 15, period: 2, note: "Relay needed." },
  { id: "h_leo", name: "LEO 550 km", body: "earth", eclipse: 0.36, contact: 0.12, launch: 1.0, decay: 1.0, rad: 5, period: 1.5, note: "Cheap to reach." },
  { id: "h_sso", name: "SSO 700 km", body: "earth", eclipse: 0.36, contact: 0.14, launch: 1.05, decay: 0.55, rad: 9, period: 1.6, note: "Same local time every pass." },
  { id: "h_geo", name: "GEO 35,786 km", body: "earth", eclipse: 0.02, contact: 0.95, launch: 1.9, decay: 0, rad: 50, period: 24, note: "Never lose contact." },
  { id: "h_polar", name: "Lunar polar 100 km", body: "moon", eclipse: 0.45, contact: 0.3, launch: 2.6, decay: 0, rad: 20, period: 2, note: "Low and slow." },
  { id: "h_frozen", name: "Lunar 300 km", body: "moon", eclipse: 0.45, contact: 0.4, launch: 2.7, decay: 0, rad: 18, period: 2.4, note: "The compromise orbit." },
  { id: "h_halo", name: "Lunar L2 halo", body: "moon", eclipse: 0.02, contact: 0.98, launch: 3.0, decay: 0, rad: 12, period: 14, note: "Constant far-side view." },
  { id: "h_low", name: "Mars 400 km", body: "mars", eclipse: 0.4, contact: 0.45, launch: 4.5, decay: 0.2, rad: 15, period: 2, note: "Sharpest view." },
  { id: "h_msso", name: "Mars sun-sync 800 km", body: "mars", eclipse: 0.4, contact: 0.5, launch: 4.6, decay: 0.1, rad: 14, period: 2.3, note: "Reliable for weather." },
  { id: "h_areo", name: "Mars areostationary", body: "mars", eclipse: 0.05, contact: 0.95, launch: 5.0, decay: 0, rad: 12, period: 20, note: "Perfect relay." },
];

export const FLIGHT_LV: FlightPart[] = [
  { id: "small", name: "Small-lift", leo: 300, cost: 7.5, note: "Electron class" },
  { id: "med", name: "Medium-lift", leo: 15000, cost: 67, note: "Falcon 9 class" },
  { id: "heavy", name: "Heavy-lift", leo: 50000, cost: 150, note: "Heavy class" },
];

export const FLIGHT_DIFFICULTY = [
  { id: "cadet", name: "Cadet", budget: 1.3, events: 0, note: "Extra budget. No surprises." },
  { id: "engineer", name: "Engineer", budget: 1.0, events: 0, note: "Real budget. No surprises." },
  { id: "director", name: "Flight Director", budget: 0.85, events: 3, note: "Tight budget. Everything goes wrong." },
];

export const FLIGHT_OBJ = [
  { id: "crops", body: "earth", budget: 120, years: 3, minSci: 20, need: ["imaging"] },
  { id: "ice", body: "moon", budget: 450, years: 5, minSci: 45, need: ["subsurface", "topography"] },
  { id: "mars", body: "mars", budget: 700, years: 6, minSci: 60, need: ["biosignature", "composition"] },
  { id: "polar", body: "earth", budget: 160, years: 3, minSci: 35, need: ["imaging", "composition"] },
  { id: "shackleton", body: "moon", budget: 380, years: 4, minSci: 50, need: ["subsurface", "topography"] },
  { id: "dust", body: "mars", budget: 620, years: 5, minSci: 55, need: ["imaging", "weather"] },
];

export interface FlightConfig {
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

export interface FlightCheck {
  label: string;
  ok: boolean;
  fatal: boolean;
  why: string;
}

export interface FlightEvaluation {
  wet: number;
  dry: number;
  propellant: number;
  cap: number;
  cost: number;
  budget: number;
  contact: number;
  delivery: number;
  arrayAvg: number;
  load: number;
  batNeed: number;
  batWh: number;
  dose: number;
  shield: number;
  science: number;
  minSci: number;
  checks: FlightCheck[];
  blockers: FlightCheck[];
  warnings: FlightCheck[];
  success: boolean;
  score: number;
  grade: string;
}

const byId = <T extends { id: string }>(list: T[], id: string): T | undefined =>
  list.find((item) => item.id === id);
const sum = <T>(list: T[], f: (item: T) => number) => list.reduce((total, item) => total + f(item), 0);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const money = (value: number) => `$${value.toFixed(1)}M`;

/**
 * Same equations as `public/game/js/sim.js`, without random events. Events are
 * rolled inside the flight game at launch; this preview deliberately shows the
 * clean configuration so the player can see what each option buys.
 */
export function evaluateFlight(config: FlightConfig, difficulty = "engineer"): FlightEvaluation {
  const objective = byId(FLIGHT_OBJ, config.objective) ?? FLIGHT_OBJ[3];
  const bus = byId(FLIGHT_BUS, config.bus) ?? FLIGHT_BUS[1];
  const array = byId(FLIGHT_ARRAY, config.array) ?? FLIGHT_ARRAY[2];
  const battery = byId(FLIGHT_BATTERY, config.battery) ?? FLIGHT_BATTERY[1];
  const comms = byId(FLIGHT_COMMS, config.comms) ?? FLIGHT_COMMS[2];
  const ground = byId(FLIGHT_GROUND, config.gs) ?? FLIGHT_GROUND[1];
  const recorder = byId(FLIGHT_RECORDER, config.rec) ?? FLIGHT_RECORDER[2];
  const redundancy = byId(FLIGHT_REDUNDANCY, config.red) ?? FLIGHT_REDUNDANCY[0];
  const propulsion = byId(FLIGHT_PROPULSION, config.prop) ?? FLIGHT_PROPULSION[0];
  const orbit = byId(FLIGHT_ORBIT, config.orbit) ?? FLIGHT_ORBIT[7];
  const launcher = byId(FLIGHT_LV, config.launcher) ?? FLIGHT_LV[1];
  const diff = byId(FLIGHT_DIFFICULTY, difficulty) ?? FLIGHT_DIFFICULTY[1];
  const instruments = config.instruments
    .map((id) => byId(FLIGHT_INSTR, id))
    .filter((part): part is FlightPart => Boolean(part));

  const budget = objective.budget * diff.budget;
  const science = sum(instruments, (part) => part.sci ?? 0);
  const generated = sum(instruments, (part) => part.data ?? 0);
  const load =
    (bus.house ?? 0) + (comms.w ?? 0) + (propulsion.power ?? 0) +
    sum(instruments, (part) => part.w ?? 0);

  const dry =
    (bus.mass ?? 0) + (array.mass ?? 0) + (battery.mass ?? 0) + (comms.mass ?? 0) +
    (recorder.mass ?? 0) + (redundancy.mass ?? 0) +
    sum(instruments, (part) => part.mass ?? 0);
  const propellant =
    dry * 0.02 * config.years * (1 + orbit.decay * 2) * (propulsion.propMul ?? 1);
  const wet = dry + propellant;
  const cap = (launcher.leo ?? 15000) / orbit.launch;

  const hardware =
    bus.cost + array.cost + battery.cost + comms.cost + ground.cost +
    recorder.cost + (propulsion.cost ?? 0) + sum(instruments, (part) => part.cost);
  const cost =
    hardware * (redundancy.mul ?? 1) + (launcher.cost ?? 67) + (1 + bus.cost * 0.05) * config.years;

  const contact = clamp(orbit.contact * (ground.mul ?? 1), 0.02, 0.98);
  const arrayAvg = array.constant ? (array.w ?? 0) : (array.w ?? 0) * (1 - orbit.eclipse);
  const downlink = ((comms.mbps ?? 0) * 86400 * contact) / 8000;
  const batNeed = load * orbit.eclipse * orbit.period * 1.2;
  const streamed = downlink / Math.max(1e-6, generated);
  const delivery =
    generated > 0
      ? Math.min(1, streamed, recorder.id === "none" ? contact : 1)
      : 0;
  const dose = orbit.rad * config.years;
  const shield = bus.shield ?? 0;
  const lifeFactor = dose <= shield ? 1 : Math.max(0.2, shield / dose);
  const timeFactor = Math.min(1, config.years / objective.years);
  const delivered = science * delivery * lifeFactor * timeFactor;

  const tags = new Set(instruments.map((part) => part.tag));
  const missing = objective.need.filter((tag) => !tags.has(tag));
  const atTarget = orbit.body === objective.body;

  const checks: FlightCheck[] = [
    {
      label: "Destination",
      fatal: true,
      ok: atTarget,
      why: atTarget
        ? `Orbit is at ${orbit.body}.`
        : `This mission is at ${objective.body}, but the orbit is at ${orbit.body}.`,
    },
    {
      label: "Objective instruments",
      fatal: true,
      ok: missing.length === 0,
      why:
        missing.length === 0
          ? "Payload covers every objective requirement."
          : `Missing ${missing.join(" + ")}.`,
    },
    {
      label: "Launch mass",
      fatal: true,
      ok: wet <= cap,
      why: `${wet.toFixed(0)} kg wet vs ${cap.toFixed(0)} kg capacity on a ${launcher.name} to this orbit.`,
    },
    {
      label: "Budget",
      fatal: true,
      ok: cost <= budget,
      why: `${money(cost)} of ${money(budget)}. ${cost > budget ? `Over by ${money(cost - budget)}.` : `Headroom ${money(budget - cost)}.`}`,
    },
    {
      label: "Power",
      fatal: true,
      ok: arrayAvg - load >= 0,
      why: `${load} W load vs ${arrayAvg.toFixed(0)} W average array output.`,
    },
    {
      label: "Eclipse battery",
      fatal: true,
      ok: (battery.wh ?? 0) >= batNeed,
      why: `Need ${batNeed.toFixed(0)} Wh to fly through eclipse, have ${battery.wh} Wh.`,
    },
    {
      label: "Radiation",
      fatal: false,
      ok: dose <= shield,
      why: `${dose.toFixed(0)} krad total dose vs ${shield} krad of shielding.`,
    },
    {
      label: "Data downlink",
      fatal: false,
      ok: delivery >= 0.95,
      why: `${generated.toFixed(0)} Gb/day generated vs ${downlink.toFixed(1)} Gb/day downlink (${Math.round(contact * 100)}% contact${recorder.id === "none" ? ", no recorder" : ""}).`,
    },
    {
      label: "Science return",
      fatal: false,
      ok: delivered >= objective.minSci,
      why: `${delivered.toFixed(0)} of ${objective.minSci} points needed.`,
    },
  ];

  const blockers = checks.filter((check) => check.fatal && !check.ok);
  const warnings = checks.filter((check) => !check.fatal && !check.ok);
  const success = blockers.length === 0 && delivered >= objective.minSci;
  let score: number;
  if (success) {
    score =
      60 * Math.min(1, delivered / objective.minSci) +
      20 * clamp(1 - cost / budget, 0, 1) +
      10 * clamp(1 - wet / cap, 0, 1) +
      10 * delivery;
  } else {
    score = 30 * Math.min(1, delivered / objective.minSci);
  }
  score = Math.round(score);
  const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 65 ? "C" : score >= 50 ? "D" : "F";

  return {
    wet,
    dry,
    propellant,
    cap,
    cost,
    budget,
    contact,
    delivery,
    arrayAvg,
    load,
    batNeed,
    batWh: battery.wh ?? 0,
    dose,
    shield,
    science: delivered,
    minSci: objective.minSci,
    checks,
    blockers,
    warnings,
    success,
    score,
    grade,
  };
}
