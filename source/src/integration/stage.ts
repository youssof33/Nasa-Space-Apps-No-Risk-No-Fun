import { busComponents, instruments } from "../data/catalogs";
import type { BusCategory, BusComponent, Instrument } from "../data/types";
import type { StageModel } from "../viz/spacecraft/Spacecraft";
import type { DesignState } from "./design";

/**
 * One assembly model for the whole site.
 *
 * The workbench draws it, the flight review previews it and Mission Control
 * rebuilds the very same geometry in orbit. Keeping the mapping in one module
 * is what makes "the spacecraft I designed" and "the spacecraft that flies"
 * the same object rather than two similar-looking props.
 */

const OMAR_INSTRUMENT: Record<string, string> = {
  cam: "multispectral-imager",
  spec: "compact-spectrometer",
  radar: "hyperspectral-mapper",
  mag: "magnetometer",
  wx: "thermal-radiometer",
};

const POWER_COMPONENT: Record<string, string> = {
  pwr_array: "deployable-solar-array",
  pwr_array_xl: "high-efficiency-solar-array",
  pwr_array_dual: "high-efficiency-solar-array",
  /* The catalogue has no RTG mesh yet; the compact array reads as the small
     power package the MMRTG replaces in the flight model. */
  pwr_rtg: "deployable-solar-array",
};

const BATTERY_COMPONENT: Record<string, string> = {
  b50: "lithium-battery",
  b400: "large-battery",
  b2000: "large-battery",
};

const COMMS_COMPONENT: Record<string, string> = {
  com_s: "low-gain-antenna",
  com_x: "mid-gain-antenna",
  com_ka: "high-gain-antenna",
};

const COMPONENTS = new Map(busComponents.map((component) => [component.id, component]));
const INSTRUMENTS = new Map(instruments.map((instrument) => [instrument.id, instrument]));

function component(id: string | undefined): BusComponent | undefined {
  return id ? COMPONENTS.get(id) : undefined;
}

function omarInstrument(id: string | undefined): Instrument | undefined {
  const mapped = id ? OMAR_INSTRUMENT[id] : undefined;
  return mapped ? INSTRUMENTS.get(mapped) : undefined;
}

/** The 3D stack implied by a workbench design. */
export function stageModelOf(state: DesignState): StageModel {
  const build = state.build;
  const flight = state.flight;
  const bus: Partial<Record<BusCategory, BusComponent>> = {};
  const add = (entry: BusComponent | undefined): void => {
    if (entry) bus[entry.category] = entry;
  };

  add(component("cubesat-structure"));
  add(component(POWER_COMPONENT[build.power ?? ""]));
  add(component(BATTERY_COMPONENT[flight.battery] ?? "large-battery"));
  add(
    component(
      build.bus === "bus_rad" ? "radiation-tolerant-computer" : "basic-flight-computer",
    ),
  );
  add(component(build.bus === "bus_power" ? "precision-adcs" : "basic-adcs"));
  add(component(COMMS_COMPONENT[build.comms ?? ""] ?? "low-gain-antenna"));
  if (flight.recorder !== "none") add(component("solid-state-recorder"));
  add(component(flight.propulsion === "ep" ? "cold-gas-propulsion" : "chemical-propulsion"));

  const bays: StageModel["bays"] = [null, null, null, null];
  build.instruments.slice(0, 4).forEach((id, index) => {
    const instrument = omarInstrument(id);
    if (instrument) bays[index] = { instrument, qty: 1 };
  });

  return { bus, bays };
}

/** Plain, structured-cloneable description of the craft for the ops iframe. */
export interface CraftInstrument {
  scienceTags: string[];
  massKg: number;
}

export interface CraftSpec {
  structureMass: number;
  solarDeploy: number;
  batteryWh: number;
  antennaGain: number | null;
  storageGB: number | null;
  computerHardened: boolean;
  adcsPrecision: boolean;
  propulsion: "chem" | "ep";
  instruments: Array<CraftInstrument | null>;
}

export function craftSpecOf(state: DesignState): CraftSpec {
  const model = stageModelOf(state);
  const solarArea = model.bus.solarPanel?.performance.solarAreaM2 ?? 0;

  return {
    structureMass: model.bus.structure?.massKg ?? 6,
    solarDeploy: model.bus.solarPanel ? Math.min(1, Math.max(0.42, solarArea / 0.45)) : 0.04,
    batteryWh: model.bus.battery?.performance.batteryCapacityWh ?? 0,
    antennaGain: model.bus.antenna?.performance.antennaGainDb ?? null,
    storageGB: model.bus.dataStorage?.performance.storageGB ?? null,
    computerHardened:
      (model.bus.computer?.performance.radiationHardeningFraction ?? 0.35) > 0.6,
    adcsPrecision:
      (model.bus.adcs?.performance.pointingAccuracyArcsec ?? 600) < 100,
    propulsion: state.flight.propulsion === "ep" ? "ep" : "chem",
    instruments: model.bays.map((bay) =>
      bay
        ? { scienceTags: bay.instrument.scienceTags, massKg: bay.instrument.massKg }
        : null,
    ),
  };
}
