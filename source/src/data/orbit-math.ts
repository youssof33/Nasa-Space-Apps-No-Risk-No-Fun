import type { Orbit } from "./types";

const EARTH_GRAVITATIONAL_PARAMETER_KM3_PER_S2 = 398600.4418;
const MOON_GRAVITATIONAL_PARAMETER_KM3_PER_S2 = 4902.8001;
const SUN_GRAVITATIONAL_PARAMETER_KM3_PER_S2 = 132712440018;
const EARTH_MEAN_RADIUS_KM = 6371;
const MOON_MEAN_RADIUS_KM = 1737.4;
const SECONDS_PER_HOUR = 3600;

export function orbitalPeriodHours(orbit: Orbit): number {
  if (orbit.kind !== "bound") {
    throw new RangeError(`Orbit ${orbit.id} is a transfer and has no bound orbital period.`);
  }
  const perigeeAltKm = orbit.perigeeAltKm;
  const apogeeAltKm = orbit.apogeeAltKm;
  if (perigeeAltKm === undefined || apogeeAltKm === undefined) {
    throw new RangeError(`Bound orbit ${orbit.id} needs perigee and apogee altitudes.`);
  }

  const gravitationalParameterKm3PerS2 =
    orbit.centralBody === "earth"
      ? EARTH_GRAVITATIONAL_PARAMETER_KM3_PER_S2
      : orbit.centralBody === "moon"
        ? MOON_GRAVITATIONAL_PARAMETER_KM3_PER_S2
        : SUN_GRAVITATIONAL_PARAMETER_KM3_PER_S2;
  const bodyRadiusKm = orbit.centralBody === "moon" ? MOON_MEAN_RADIUS_KM : EARTH_MEAN_RADIUS_KM;
  const semiMajorAxisKm =
    bodyRadiusKm + (perigeeAltKm + apogeeAltKm) / 2;
  return (
    (2 *
      Math.PI *
      Math.sqrt(semiMajorAxisKm ** 3 / gravitationalParameterKm3PerS2)) /
    SECONDS_PER_HOUR
  );
}
