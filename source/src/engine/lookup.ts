import { busComponents, instruments, launchers, orbits } from "../data/catalogs";
import type {
  BusComponent,
  Instrument,
  Launcher,
  MissionDesign,
  Orbit,
  OrbitId,
} from "../data/types";

export function getInstrument(id: string): Instrument {
  return getById(instruments, id, "instrument");
}

export function getBusComponent(id: string): BusComponent {
  return getById(busComponents, id, "bus component");
}

export function getLauncher(id: string): Launcher {
  return getById(launchers, id, "launcher");
}

export function getOrbit(id: OrbitId): Orbit {
  return getById(orbits, id, "orbit");
}

export function getDesignParts(design: MissionDesign): {
  instruments: Instrument[];
  busComponents: BusComponent[];
} {
  return {
    instruments: expandSelections(design.instruments, getInstrument, "instrument"),
    busComponents: expandSelections(design.busComponents, getBusComponent, "bus component"),
  };
}

function expandSelections<T>(
  selections: MissionDesign["instruments"],
  lookup: (id: string) => T,
  label: string,
): T[] {
  const expanded: T[] = [];
  for (const selection of selections) {
    if (!Number.isSafeInteger(selection.qty) || selection.qty <= 0) {
      throw new RangeError(`${label} quantity for ${selection.id} must be a positive integer.`);
    }
    for (let count = 0; count < selection.qty; count += 1) {
      expanded.push(lookup(selection.id));
    }
  }
  return expanded;
}

function getById<T extends { id: string }>(items: T[], id: string, label: string): T {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) {
    throw new RangeError(`Unknown ${label} id: ${id}`);
  }
  return item;
}
