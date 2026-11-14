/* Ported verbatim from Hussein's src/game/data.js. Types are not modelled:
   the module is used as-is so its behaviour stays identical. */
// @ts-nocheck
// Mission data. All values are game units except the ones flagged in ANCHORS/SOURCES.
// Textures: Solar System Scope (CC BY 4.0), derived from NASA imagery.

export const BODIES = {
  earth: {
    id: 'earth',
    name: 'Earth',
    texture: '/textures/bodies/earth_day.jpg',
    clouds: '/textures/bodies/earth_clouds.jpg',
    lights: '/textures/earth_lights_2048.png',
    atmos: '#4d9bff',
    atmosStrength: 1,
    sun: 3.1,
    sunColor: '#fff4e2',
    solar: 1,
    canLand: false,
  },
  moon: {
    id: 'moon',
    name: 'Moon',
    texture: '/textures/bodies/moon.jpg',
    clouds: null,
    lights: null,
    atmos: null,
    atmosStrength: 0,
    sun: 4.6,
    sunColor: '#ffffff',
    solar: 1,
    canLand: true,
  },
  mars: {
    id: 'mars',
    name: 'Mars',
    texture: '/textures/bodies/mars.jpg',
    clouds: null,
    lights: null,
    atmos: '#e8a06a',
    atmosStrength: 0.45,
    sun: 2.5,
    sunColor: '#ffe4c4',
    solar: 0.43,
    canLand: true,
  },
}

export const SCENARIOS = [
  {
    id: 'polar-watch',
    name: 'POLAR WATCH',
    body: 'earth',
    kicker: 'Earth Observation · Polar Orbit',
    brief:
      'Sea ice is retreating faster than the models predict. Your team has one launch slot and one budget to put an observatory over the poles and find out why.',
    objective: 'Map sea-ice extent daily and measure ocean colour through the melt season.',
    budget: 120,
    lifetime: '3 years',
    landing: false,
    site: null,
    orbits: {
      leo: {
        id: 'leo', name: 'LEO', altitude: '550 km',
        blurb: 'Cheap to reach. Narrow passes, short contact windows.',
        capacity: 600, launch: 8, powerMult: 1.0, downMult: 0.6,
        fit: { cam: 1.0, spec: 0.95, radar: 0.9, mag: 0.8, wx: 0.95 },
        revisit: '~3 days', radius: 1.3, tilt: 0.9,
      },
      sso: {
        id: 'sso', name: 'SSO', altitude: '700 km',
        blurb: 'Same local time every pass. Best light for ice and ocean colour.',
        capacity: 500, launch: 12, powerMult: 0.95, downMult: 0.8,
        fit: { cam: 1.1, spec: 1.1, radar: 1.05, mag: 0.85, wx: 1.0 },
        revisit: 'daily', radius: 1.42, tilt: 1.7,
      },
      geo: {
        id: 'geo', name: 'GEO', altitude: '35,786 km',
        blurb: 'Never lose contact. Too far for sharp surface detail.',
        capacity: 1400, launch: 38, powerMult: 1.1, downMult: 1.0,
        fit: { cam: 0.25, spec: 0.35, radar: 0.2, mag: 0.9, wx: 0.85 },
        revisit: 'continuous', radius: 2.35, tilt: 0.08,
      },
    },
  },
  {
    id: 'lunar-ice',
    name: 'SHACKLETON',
    body: 'moon',
    kicker: 'Lunar Prospecting · South Pole',
    brief:
      'Permanently shadowed craters at the lunar south pole may hold the water that decides whether a base is possible. Nothing has surveyed them from orbit at this resolution.',
    objective: 'Detect subsurface water ice and map a safe approach for a lander.',
    budget: 105,
    lifetime: '1 year',
    landing: true,
    site: 'Shackleton Rim',
    orbits: {
      low: {
        id: 'low', name: 'POLAR', altitude: '100 km',
        blurb: 'Low and slow. Best resolution, worst contact time.',
        capacity: 450, launch: 14, powerMult: 1.0, downMult: 0.5,
        fit: { cam: 1.15, spec: 1.1, radar: 1.2, mag: 1.0, wx: 0.9 },
        revisit: '~2 days', radius: 1.2, tilt: 1.75,
      },
      mid: {
        id: 'mid', name: 'FROZEN', altitude: '300 km',
        blurb: 'The compromise orbit. Enough passes to downlink, close enough to see ice.',
        capacity: 550, launch: 11, powerMult: 1.0, downMult: 0.7,
        fit: { cam: 1.0, spec: 1.0, radar: 1.05, mag: 1.0, wx: 0.95 },
        revisit: 'daily', radius: 1.32, tilt: 1.75,
      },
      halo: {
        id: 'halo', name: 'HALO', altitude: 'L2',
        blurb: 'Constant view of the far side. No surface detail worth the name.',
        capacity: 900, launch: 19, powerMult: 1.0, downMult: 1.0,
        fit: { cam: 0.6, spec: 0.75, radar: 0.5, mag: 1.2, wx: 0.6 },
        revisit: 'continuous', radius: 1.9, tilt: 0.4,
      },
    },
  },
  {
    id: 'mars-dust',
    name: 'DUST WATCH',
    body: 'mars',
    kicker: 'Mars Weather · Human Precursor',
    brief:
      'A crewed mission is two years out. Nobody can predict how long a global dust storm will last, and the crew cannot land in one.',
    objective: 'Track dust storms and atmospheric opacity through a full Martian year.',
    budget: 145,
    lifetime: '2 years',
    landing: true,
    site: 'Jezero Crater',
    orbits: {
      low: {
        id: 'low', name: 'LOW', altitude: '400 km',
        blurb: 'Sharpest view of the surface. Dust eats your solar power.',
        capacity: 700, launch: 22, powerMult: 1.0, downMult: 0.5,
        fit: { cam: 1.1, spec: 1.0, radar: 1.05, mag: 0.9, wx: 1.15 },
        revisit: '~2 days', radius: 1.2, tilt: 0.9,
      },
      sso: {
        id: 'sso', name: 'SUN-SYNC', altitude: '800 km',
        blurb: 'Same local time every pass. The reliable choice for weather.',
        capacity: 650, launch: 20, powerMult: 1.0, downMult: 0.65,
        fit: { cam: 1.15, spec: 1.05, radar: 1.0, mag: 0.9, wx: 1.2 },
        revisit: 'daily', radius: 1.36, tilt: 1.6,
      },
      sync: {
        id: 'sync', name: 'AREO', altitude: '17,000 km',
        blurb: 'Hangs over one point. Perfect relay, useless for surface detail.',
        capacity: 1200, launch: 34, powerMult: 1.0, downMult: 1.0,
        fit: { cam: 0.45, spec: 0.5, radar: 0.3, mag: 0.9, wx: 0.75 },
        revisit: 'continuous', radius: 2.05, tilt: 0.05,
      },
    },
  },
]

export const PARTS = [
  { id: 'bus_std', cat: 'bus', name: 'Standard Bus', mass: 180, power: 120, cost: 18, data: 0, science: 0,
    blurb: 'Flight-proven 1.2 m bus. Cheap, unremarkable, reliable.' },
  { id: 'bus_power', cat: 'bus', name: 'High-Power Bus', mass: 260, power: 260, cost: 26, data: 0, science: 0,
    blurb: 'Bigger structure and harness. Buys you watts at the cost of kilograms.' },
  { id: 'bus_rad', cat: 'bus', name: 'Radiation-Hardened Bus', mass: 240, power: 180, cost: 32, data: 0, science: 0,
    blurb: 'Survives the belts. Heavy, expensive, and pointless in low orbit.' },

  { id: 'pwr_array', cat: 'power', name: 'Deployable Array', gen: 420, mass: 45, power: 0, cost: 9, data: 0, science: 0,
    blurb: '2.4 m² of cells. The default choice for a smallsat.' },
  { id: 'pwr_array_xl', cat: 'power', name: 'High-Gain Array', gen: 900, mass: 95, power: 0, cost: 16, data: 0, science: 0,
    blurb: '5.2 m². Enough for a radar — and enough mass to force a bigger rocket.' },
  { id: 'pwr_array_dual', cat: 'power', name: 'Dual-Wing Array', gen: 1350, mass: 140, power: 0, cost: 24, data: 0, science: 0,
    blurb: 'Two 5.2 m² wings, sized for a place with weak sunlight. Overkill at Earth, mandatory at Mars.' },
  { id: 'pwr_rtg', cat: 'power', name: 'MMRTG', gen: 110, mass: 45, power: 0, cost: 22, data: 0, science: 0,
    blurb: '110 W from plutonium decay. Works in the dark, costs like it.' },

  { id: 'cam', cat: 'instrument', name: 'Multispectral Camera', mass: 35, power: 45, cost: 14, data: 12, science: 30,
    blurb: 'Sharp visible imagery. Wants a low orbit.' },
  { id: 'spec', cat: 'instrument', name: 'Ocean Colour Spectrometer', mass: 60, power: 70, cost: 18, data: 18, science: 45,
    blurb: 'Reads surface composition from orbit. The core of the science case.' },
  { id: 'radar', cat: 'instrument', name: 'Ice-Penetrating Radar', mass: 140, power: 320, cost: 34, data: 60, science: 70,
    blurb: 'Sees below the surface. Devours power and data.' },
  { id: 'mag', cat: 'instrument', name: 'Magnetometer', mass: 8, power: 12, cost: 5, data: 0.5, science: 25,
    blurb: 'Almost free. Rarely the reason a mission flies.' },
  { id: 'wx', cat: 'instrument', name: 'Weather Suite', mass: 40, power: 55, cost: 16, data: 8, science: 35,
    blurb: 'Clouds, aerosols, storms. Good public-facing imagery.' },

  { id: 'com_s', cat: 'comms', name: 'S-band', down: 8, mass: 12, power: 25, cost: 6, data: 0, science: 0,
    blurb: '8 Gb/day. Fine for a camera, hopeless for a radar.' },
  { id: 'com_x', cat: 'comms', name: 'X-band', down: 30, mass: 28, power: 60, cost: 12, data: 0, science: 0,
    blurb: '30 Gb/day. The workhorse of planetary observation.' },
  { id: 'com_ka', cat: 'comms', name: 'Ka-band', down: 80, mass: 45, power: 110, cost: 20, data: 0, science: 0,
    blurb: '80 Gb/day. Heavy dish, thirsty amplifier, weather drama.' },
]
