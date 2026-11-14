import { orbits } from "../../data/catalogs";
import type { Orbit, OrbitId } from "../../data/types";

export function findOrbit(orbitId: OrbitId): Orbit | undefined {
  return orbits.find((orbit) => orbit.id === orbitId);
}
