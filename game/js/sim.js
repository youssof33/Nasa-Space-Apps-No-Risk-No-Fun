/* ==========================================================================
   MISSION CONTROL — simulation model
   Pure functions. No DOM, no rendering.
   ========================================================================== */
window.SIM = (function () {
  const D = window.DATA;
  const byId = (list, id) => list.find(x => x.id === id);
  const sum = (list, f) => list.reduce((a, x) => a + f(x), 0);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const money = n => "$" + n.toFixed(1) + "M";

  function evaluate(state, diffId, eventIds) {
    const o    = byId(D.OBJ, state.objective);
    const bus  = byId(D.BUS, state.bus);
    const arr  = byId(D.ARRAY, state.array);
    const bat  = byId(D.BATTERY, state.battery);
    const com  = byId(D.COMMS, state.comms);
    const gs   = byId(D.GROUND, state.gs || "nen");
    const rec  = byId(D.RECORDER, state.rec || "none");
    const red  = byId(D.REDUNDANCY, state.red || "single");
    const prop = byId(D.PROPULSION, state.prop || "chem");
    const orb  = byId(D.ORBIT, state.orbit);
    const lv   = byId(D.LV, state.launcher);
    const diff = byId(D.DIFFICULTY, diffId || "engineer");
    const ins  = state.instruments.map(id => byId(D.INSTR, id)).filter(Boolean);

    const budget = o.budget * diff.budget;

    // --- raw numbers, before anything goes wrong -------------------------
    const sci0 = sum(ins, i => i.sci);
    const gen  = sum(ins, i => i.data);
    const load = bus.house + com.w + prop.power + sum(ins, i => i.w);

    const dry   = bus.mass + arr.mass + bat.mass + com.mass + rec.mass + red.mass
                + sum(ins, i => i.mass);
    const prop0 = dry * 0.02 * state.years * (1 + orb.decay * 2) * prop.propMul;
    const cap   = lv.leo / orb.launch;

    const hw    = bus.cost + arr.cost + bat.cost + com.cost + gs.cost + rec.cost
                + prop.cost + sum(ins, i => i.cost);
    const cost0 = hw * red.mul + lv.cost + (1 + bus.cost * 0.05) * state.years;

    const contact   = clamp(orb.contact * gs.mul, 0.02, 0.98);
    // an RTG keeps producing through eclipse; solar arrays do not
    const arrayAvg0 = arr.constant ? arr.w : arr.w * (1 - orb.eclipse);
    const down0     = com.mbps * 86400 * contact / 8000;
    const batNeed   = load * orb.eclipse * orb.period * 1.2;

    // --- random events mutate these --------------------------------------
    const m = {
      o, bus, arr, bat, com, gs, rec, red, prop, orb, lv, ins, diff, budget,
      sci: sci0, gen, load, dry, cap, batNeed, contact,
      propellant: prop0, cost: cost0, arrayAvg: arrayAvg0, down: down0,
      dose: orb.rad * state.years,
      sciPenalty: 1, powerPenalty: 1, linkPenalty: 1, propPenalty: 1,
      events: [],
    };

    (eventIds || []).forEach(id => {
      const ev = byId(D.EVENTS, id);
      if (ev) { ev.apply(m); m.events.push(ev); }
    });

    const mit = red.mitigate;
    if (mit > 0) {
      m.sciPenalty   = 1 - (1 - m.sciPenalty) * (1 - mit);
      m.powerPenalty = 1 - (1 - m.powerPenalty) * (1 - mit);
      m.linkPenalty  = 1 - (1 - m.linkPenalty) * (1 - mit * 0.7);
      m.propPenalty  = 1 + (m.propPenalty - 1) * (1 - mit);
    }

    m.propellant = prop0 * m.propPenalty;
    m.wet        = dry + m.propellant;
    m.arrayAvg   = arrayAvg0 * m.powerPenalty;
    m.down       = down0 * m.linkPenalty;
    m.sci        = sci0 * m.sciPenalty;

    // --- derived ---------------------------------------------------------
    m.powerMargin = m.arrayAvg - load;
    const streamed = m.down / Math.max(1e-6, gen);
    // without a recorder you can only transmit what you make while in view
    m.delivery    = gen > 0 ? Math.min(1, streamed, rec.id === "none" ? m.contact : 1) : 0;
    m.lifeFactor  = m.dose <= bus.shield ? 1 : Math.max(0.2, bus.shield / m.dose);
    m.timeFactor  = Math.min(1, state.years / o.years);
    m.delivered   = m.sci * m.delivery * m.lifeFactor * m.timeFactor;

    const tags = new Set(ins.map(i => i.tag));
    m.covers   = o.need.every(t => tags.has(t));
    m.missing  = o.need.filter(t => !tags.has(t));
    m.atTarget = orb.body === o.body;

    // --- gates -----------------------------------------------------------
    // `why` is a getter: recommend() runs thousands of evaluations and never
    // touches the prose, so we only pay for the strings the UI actually shows.
    m.checks = [
      { role:"Mission planner", fatal:true, ok:m.atTarget, label:"Destination",
        get why() { return m.atTarget ? `Orbit is at ${D.BODY[orb.body].name}.`
                        : `This mission is at ${D.BODY[o.body].name}, but the orbit is at ${D.BODY[orb.body].name}.`; } },
      { role:"Mission planner", fatal:true, ok:m.covers, label:"Objective instruments",
        get why() { return m.covers ? "Payload covers every objective requirement."
                      : "Missing " + m.missing.join(" + ") + ". The objective is unreachable."; } },
      { role:"Systems engineer", fatal:true, ok:m.wet <= cap, label:"Launch mass",
        get why() { return `${m.wet.toFixed(0)} kg wet vs ${cap.toFixed(0)} kg capacity on a ${lv.name} to this orbit.`; } },
      { role:"Systems engineer", fatal:true, ok:m.cost <= budget, label:"Budget",
        get why() { return `${money(m.cost)} of ${money(budget)}. ${m.cost > budget ? "Over by " + money(m.cost - budget) + "." : "Headroom " + money(budget - m.cost) + "."}`; } },
      { role:"Systems engineer", fatal:true, ok:m.powerMargin >= 0, label:"Power",
        get why() { return `${load} W load vs ${m.arrayAvg.toFixed(0)} W average array output (${Math.round(orb.eclipse*100)}% eclipse).`; } },
      { role:"Systems engineer", fatal:true, ok:bat.wh >= batNeed, label:"Eclipse battery",
        get why() { return `Need ${batNeed.toFixed(0)} Wh to fly through eclipse, have ${bat.wh} Wh.`; } },
      // not fatal — a thin shield shortens the mission instead of killing it
      { role:"Systems engineer", fatal:false, ok:m.dose <= bus.shield, label:"Radiation",
        get why() { return m.dose <= bus.shield
          ? `${m.dose.toFixed(0)} krad total dose, ${(bus.shield - m.dose).toFixed(0)} krad of margin.`
          : `${m.dose.toFixed(0)} krad total dose vs ${bus.shield} krad of shielding — the mission is cut to ${Math.round(m.lifeFactor * 100)}%.`; } },
      { role:"Comms", fatal:false, ok:m.delivery >= 0.95, label:"Data downlink",
        get why() { return `${gen.toFixed(0)} Gb/day generated vs ${m.down.toFixed(1)} Gb/day downlink (${Math.round(m.contact*100)}% contact${rec.id === "none" ? ", no recorder" : ""}).`; } },
      { role:"Science lead", fatal:false, ok:m.delivered >= o.minSci, label:"Science return",
        get why() { return `${m.delivered.toFixed(0)} of ${o.minSci} points needed.`; } },
    ];

    m.blockers = m.checks.filter(c => c.fatal && !c.ok);
    m.warnings = m.checks.filter(c => !c.fatal && !c.ok);
    m.success  = m.blockers.length === 0 && m.delivered >= o.minSci;

    m.requirements = [
      { label: "Reach " + D.BODY[o.body].name, ok: m.atTarget },
      { label: "Fly " + o.need.join(" + "), ok: m.covers },
      { label: `Operate for at least ${o.years} years`, ok: state.years >= o.years },
      { label: `Deliver ${o.minSci} science points`, ok: m.delivered >= o.minSci },
      { label: `Stay inside ${money(budget)}`, ok: m.cost <= budget },
    ];

    if (m.success) {
      m.score = 60 * Math.min(1, m.delivered / o.minSci)
              + 20 * clamp(1 - m.cost / budget, 0, 1)
              + 10 * clamp(1 - m.wet / cap, 0, 1)
              + 10 * m.delivery;
    } else {
      m.score = 30 * Math.min(1, m.delivered / o.minSci);
    }
    m.score = Math.round(m.score);
    m.grade = m.score >= 90 ? "A" : m.score >= 80 ? "B" : m.score >= 65 ? "C" : m.score >= 50 ? "D" : "F";
    m.stars = m.score >= 90 ? 5 : m.score >= 80 ? 4 : m.score >= 65 ? 3 : m.score >= 50 ? 2 : 1;
    m.cost = Math.round(m.cost * 10) / 10;
    return m;
  }

  /* ---------------------------------------------------------------- events */
  function rollEvents(n) {
    const pool = D.EVENTS.map(e => e.id);
    const out = [];
    while (out.length < n && pool.length) {
      out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    return out;
  }

  /* ------------------------------------------------------------- recommend */
  function recommend(objectiveId, diffId) {
    const o = byId(D.OBJ, objectiveId);
    // one instrument per needed tag; the rest stay optional and removable
    const required = o.need.map(t => D.INSTR.find(i => i.tag === t).id);
    const optional = D.INSTR.filter(i => !o.need.includes(i.tag)).map(i => i.id);
    const orbits = D.ORBIT.filter(x => x.body === o.body);

    const pick = a => a[Math.floor(Math.random() * a.length)];
    const mk = () => ({
      objective: objectiveId,
      bus: pick(D.BUS).id, array: pick(D.ARRAY).id, battery: pick(D.BATTERY).id,
      comms: pick(D.COMMS).id, gs: pick(D.GROUND).id, rec: pick(D.RECORDER).id,
      red: pick(D.REDUNDANCY).id, prop: pick(D.PROPULSION).id,
      orbit: pick(orbits).id, launcher: pick(D.LV).id,
      years: clamp(o.years + Math.floor(Math.random() * 4), o.years, 8),
      instruments: required.concat(optional.filter(() => Math.random() < 0.35)),
    });

    // Ordering: every check green first, then score, then the tidiest design
    // (shortest life, lowest cost) so the suggestion never over-specifies.
    const better = (a, b) => {
      if (!a) return false;
      if (!b) return true;
      if (a.clean !== b.clean) return a.clean;
      if (a.m.success !== b.m.success) return a.m.success;
      if (a.m.score !== b.m.score) return a.m.score > b.m.score;
      if (a.c.years !== b.c.years) return a.c.years < b.c.years;
      return a.m.cost < b.m.cost;
    };
    const wrap = c => {
      const m = evaluate(c, diffId, []);
      return { c, m, clean: m.success && m.checks.every(x => x.ok) };
    };

    const fields = {
      bus: D.BUS, array: D.ARRAY, battery: D.BATTERY, comms: D.COMMS,
      gs: D.GROUND, rec: D.RECORDER, red: D.REDUNDANCY, prop: D.PROPULSION,
      orbit: orbits, launcher: D.LV,
    };
    const neighbours = c => {
      const out = [];
      for (const k in fields) {
        for (const item of fields[k]) {
          if (item.id !== c[k]) out.push(Object.assign({}, c, { [k]: item.id }));
        }
      }
      for (const d of [-1, 1]) {
        const y = c.years + d;
        if (y >= o.years && y <= 8) out.push(Object.assign({}, c, { years: y }));
      }
      for (const id of required.concat(optional)) {
        if (required.indexOf(id) >= 0) continue;
        const has = c.instruments.indexOf(id) >= 0;
        out.push(Object.assign({}, c, {
          instruments: has ? c.instruments.filter(x => x !== id) : c.instruments.concat(id),
        }));
      }
      return out;
    };

    // 1) a random sweep for feasible starting points
    const seeds = [];
    for (let i = 0; i < 4000; i++) {
      const s = wrap(mk());
      if (s.m.success) seeds.push(s);
    }
    seeds.sort((x, y) => (better(x, y) ? -1 : better(y, x) ? 1 : 0));

    // 2) climb from the best few: flip one choice at a time while it helps
    let best = null;
    for (const seed of seeds.slice(0, 8)) {
      let cur = seed;
      for (let step = 0; step < 24; step++) {
        let next = null;
        for (const nb of neighbours(cur.c)) {
          const cand = wrap(nb);
          if (better(cand, cur) && (!next || better(cand, next))) next = cand;
        }
        if (!next) break;
        cur = next;
      }
      if (better(cur, best)) best = cur;
    }

    if (!best) return null;
    return { config: best.c, score: best.m.score, clean: best.clean };
  }

  /* --------------------------------------------------------------- selftest */
  function selfTest() {
    const base = {
      objective:"crops", bus:"3u", array:"a60", battery:"b50", instruments:["cam"],
      comms:"uhf", gs:"nen", rec:"none", red:"single", prop:"chem",
      orbit:"sso", launcher:"small", years:3,
    };

    const win = evaluate({ ...base, array:"a400", comms:"x", rec:"r64" }, "engineer", []);
    if (!win.success) throw new Error("selftest: reference crops mission should succeed, got " + win.score);

    const noRec = evaluate({ ...base, array:"a400", comms:"x", rec:"none" }, "engineer", []);
    if (noRec.delivery > 0.3) throw new Error("selftest: no recorder in LEO should cap delivery at contact");

    const lose = evaluate(base, "engineer", []);
    if (lose.success) throw new Error("selftest: default UHF mission should fail");

    const wrongBody = evaluate({ ...base, objective:"mars" }, "engineer", []);
    if (wrongBody.atTarget) throw new Error("selftest: Mars objective from LEO should be off-target");

    const over = evaluate({ ...base, objective:"mars", orbit:"mars", launcher:"small" }, "engineer", []);
    if (over.success) throw new Error("selftest: small-lift to Mars should fail on mass");

    const rad = evaluate({ objective:"ice", bus:"espa", array:"a1200", battery:"b400",
      instruments:["radar","alt"], comms:"x", gs:"nen", rec:"r512", red:"single", prop:"chem",
      orbit:"lunar", launcher:"heavy", years:5 }, "engineer", []);
    if (rad.lifeFactor >= 1) throw new Error("selftest: lunar ESPA bus should take a radiation hit");

    // an RTG must ignore eclipse; a solar array in the same orbit must not
    const rtg = evaluate({ ...base, objective:"ice", bus:"espa", array:"h_rtg", battery:"b400",
      instruments:["radar","alt"], orbit:"lunar", launcher:"heavy", years:4 }, "engineer", []);
    if (rtg.arrayAvg !== 110) throw new Error("selftest: MMRTG output should not lose eclipse, got " + rtg.arrayAvg);
    const solar = evaluate({ ...base, objective:"ice", bus:"espa", array:"h_a420", battery:"b400",
      instruments:["radar","alt"], orbit:"lunar", launcher:"heavy", years:4 }, "engineer", []);
    if (solar.arrayAvg >= 420) throw new Error("selftest: solar array should lose eclipse, got " + solar.arrayAvg);

    D.BUS.forEach(b => { if (!(b.size > 0)) throw new Error("selftest: bus without a model size " + b.id); });
    D.OBJ.forEach(o => o.need.forEach(t => {
      if (!D.INSTR.some(i => i.tag === t)) throw new Error("selftest: unknown tag " + t);
    }));
    D.ORBIT.forEach(o => {
      if (!(o.contact > 0 && o.contact <= 1)) throw new Error("selftest: bad contact " + o.id);
      if (!(o.eclipse >= 0 && o.eclipse < 1)) throw new Error("selftest: bad eclipse " + o.id);
    });
    D.OBJ.forEach(o => {
      if (!D.ORBIT.some(x => x.body === o.body)) throw new Error("selftest: no orbit at " + o.body);
    });
    return true;
  }

  return { evaluate, rollEvents, recommend, selfTest, money };
})();
