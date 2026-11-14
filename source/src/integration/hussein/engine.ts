/* Ported verbatim from Hussein's src/game/engine.js. Types are not modelled:
   the module is used as-is so its behaviour stays identical. */
// @ts-nocheck
import { PARTS, BODIES } from './data'

export const partById = (id) => PARTS.find((p) => p.id === id)

export const emptyBuild = { bus: null, power: null, comms: null, instruments: [] }

function effects(anomalies, mitigated) {
  const e = { genMul: 1, downMul: 1, drawAdd: 0, scienceMul: 1 }
  const half = (v, m) => (m ? 1 - (1 - v) / 2 : v)
  anomalies.forEach((a, i) => {
    const m = mitigated.includes(i)
    const f = a.effect
    if (f.genMul) e.genMul *= half(f.genMul, m)
    if (f.downMul) e.downMul *= half(f.downMul, m)
    if (f.drawAdd) e.drawAdd += m ? f.drawAdd / 2 : f.drawAdd
    if (f.scienceMul) e.scienceMul *= half(f.scienceMul, m)
  })
  return e
}

// Scenario-aware resource model. Everything is pure: given a build, a mission
// and a set of anomalies it returns the same numbers every time.
export function compute(build, scenario, orbitId, anomalies = [], mitigated = []) {
  const orbit = scenario.orbits[orbitId] ?? Object.values(scenario.orbits)[0]
  const body = BODIES[scenario.body]
  const picked = [build.bus, build.power, build.comms, ...build.instruments].filter(Boolean).map(partById)
  const eff = effects(anomalies, mitigated)

  const mass = picked.reduce((n, p) => n + p.mass, 0)
  const solar = body?.solar ?? 1
  const gen = picked.filter((p) => p.gen).reduce((n, p) => n + p.gen, 0) * solar * orbit.powerMult * eff.genMul
  const draw = picked.reduce((n, p) => n + (p.power || 0), 0) + eff.drawAdd

  const dataGen = picked.reduce((n, p) => n + (p.data || 0), 0) * eff.scienceMul
  const dataCap = (picked.find((p) => p.cat === 'comms')?.down || 0) * orbit.downMult * eff.downMul
  const dataRatio = dataGen > 0 ? Math.min(1, dataCap / dataGen) : 1

  const scienceRaw = picked
    .filter((p) => p.cat === 'instrument')
    .reduce((n, p) => n + p.science * (orbit.fit[p.id] ?? 1), 0)
  const scienceReturned = scienceRaw * dataRatio * eff.scienceMul

  const cost = picked.reduce((n, p) => n + p.cost, 0) + orbit.launch
  const net = gen - draw

  const massMargin = orbit.capacity > 0 ? (orbit.capacity - mass) / orbit.capacity : 0
  const powerMargin = gen > 0 ? net / gen : 0
  const budgetLeft = scenario.budget - cost

  const problems = []
  if (!build.bus) problems.push('No spacecraft bus selected.')
  if (!build.power) problems.push('No power source selected.')
  if (!build.comms) problems.push('No communications system selected.')
  if (build.instruments.length === 0) problems.push('Select at least one instrument.')
  if (mass > orbit.capacity) problems.push(`Overweight: ${Math.round(mass)} kg on a ${orbit.capacity} kg slot.`)
  if (net <= 0) problems.push(`Power deficit: ${Math.round(net)} W. The spacecraft cannot run.`)
  if (budgetLeft < 0) problems.push(`Over budget by $${Math.abs(budgetLeft).toFixed(0)}M.`)

  return {
    scenario, body, orbit, picked, mass, gen, draw, net, massMargin, powerMargin,
    cost, budgetLeft, dataGen, dataCap, dataRatio, solar,
    scienceRaw, scienceReturned, problems,
    valid: problems.length === 0,
  }
}

export function score(t, anomalies, mitigated, failed = false) {
  const scienceNorm = Math.min(1, t.scienceReturned / 85)
  const marginNorm = Math.min(1, Math.max(0, Math.min(t.powerMargin, t.massMargin)) / 0.3)
  const efficiencyNorm = Math.min(1, Math.max(0, t.budgetLeft / t.scenario.budget) / 0.25)

  const hardFail = failed || t.mass > t.orbit.capacity || t.net <= 0 || t.budgetLeft < 0
  const value = Math.round(100 * (0.5 * scienceNorm + 0.3 * marginNorm + 0.2 * efficiencyNorm))

  const grade = hardFail
    ? { label: 'MISSION LOSS', tone: 'bad' }
    : value >= 68
      ? { label: 'MISSION SUCCESS', tone: 'good' }
      : value >= 50
        ? { label: 'PARTIAL SUCCESS', tone: 'warn' }
        : { label: 'MISSION FAILED', tone: 'bad' }

  const causes = []
  if (t.solar < 0.99) {
    causes.push({
      kind: 'SOLAR',
      text: `Only ${(t.solar * 100).toFixed(0)}% of Earth's sunlight reaches ${t.body.name}. Your arrays generated ${Math.round(t.gen)} W instead of ${Math.round(t.gen / t.solar)} W.`,
    })
  }
  if (t.dataRatio < 0.98) {
    causes.push({
      kind: 'DATA',
      text: `${Math.round((1 - t.dataRatio) * 100)}% of your science never reached the ground. Downlink was ${t.dataCap.toFixed(0)} Gb/day against ${t.dataGen.toFixed(0)} Gb/day generated.`,
    })
  }
  if (t.powerMargin < 0.15) {
    causes.push({
      kind: 'POWER',
      text: `Power margin was ${(t.powerMargin * 100).toFixed(0)}%. Real missions design for 30%.`,
    })
  }
  if (t.massMargin < 0.1) {
    causes.push({
      kind: 'MASS',
      text: `Mass margin was ${(t.massMargin * 100).toFixed(0)}% on the ${t.orbit.name} slot. One late change and the mission does not fly.`,
    })
  }
  if (t.budgetLeft < 12) {
    causes.push({
      kind: 'COST',
      text: `$${Math.max(0, t.budgetLeft).toFixed(0)}M unspent. No reserve for the anomaly that actually happens.`,
    })
  }
  anomalies.forEach((a, i) => {
    const wasMitigated = mitigated.includes(i)
    causes.push({
      kind: a.tag,
      text: wasMitigated
        ? `${a.title}: contained with a contingency. Cost: schedule, not hardware.`
        : `${a.title}: rode it out. ${a.text}`,
    })
  })
  if (causes.length === 0) {
    causes.push({ kind: 'MARGIN', text: 'Every resource kept a healthy reserve. This is what a well-run mission looks like.' })
  }

  return { value, grade, causes, hardFail }
}
