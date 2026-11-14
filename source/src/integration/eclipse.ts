/**
 * Eclipse geometry, derived from JPL Horizons.
 *
 * `public/assets/horizons-sun.json` holds the raw evidence: the Sun's position
 * relative to Earth, the Moon and Mars at epoch 2026-11-14, straight from the
 * Horizons API, plus the derived table below. The numbers are baked in because
 * the site ships offline; nothing is fetched at runtime.
 *
 * Method: circular-orbit eclipse fraction from the standard terminator
 * formula, f = acos( sqrt(h² + 2Rh) / ((R+h)·cos β) ) / π, with β the angle
 * between the Sun line and the orbit plane. Sun-synchronous and polar orbits
 * hold a steady β by design; the equatorial ones are quoted at the worst case
 * they are flown at.
 */
export interface EclipseRow {
  mission: string;
  orbit: string;
  /** Share of each revolution spent in the body's shadow, 0–1. */
  eclipse: number;
  /** Share of each revolution in sunlight, 0–1. */
  sunlight: number;
}

export const ECLIPSE_TABLE: EclipseRow[] = [
  { mission: "polar-watch", orbit: "leo", eclipse: 0.345, sunlight: 0.655 },
  { mission: "polar-watch", orbit: "sso", eclipse: 0.227, sunlight: 0.773 },
  { mission: "polar-watch", orbit: "geo", eclipse: 0.048, sunlight: 0.952 },
  { mission: "lunar-ice", orbit: "low", eclipse: 0.348, sunlight: 0.652 },
  { mission: "lunar-ice", orbit: "mid", eclipse: 0, sunlight: 1 },
  { mission: "lunar-ice", orbit: "halo", eclipse: 0.009, sunlight: 0.991 },
  { mission: "mars-dust", orbit: "low", eclipse: 0.302, sunlight: 0.698 },
  { mission: "mars-dust", orbit: "sso", eclipse: 0.174, sunlight: 0.826 },
  { mission: "mars-dust", orbit: "sync", eclipse: 0.053, sunlight: 0.947 },
];

/** Share of the orbit in shadow, or null when the orbit is not in the table. */
export function eclipseOf(mission: string, orbit: string): number | null {
  const row = ECLIPSE_TABLE.find((entry) => entry.mission === mission && entry.orbit === orbit);
  return row ? row.eclipse : null;
}

/** Real solar irradiance at each body, from the same Horizons pass (W/m²). */
export const SOLAR_IRRADIANCE: Record<string, number> = {
  earth: 1390,
  moon: 1390,
  mars: 527,
};
