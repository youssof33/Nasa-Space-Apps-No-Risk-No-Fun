/* Mission Architect — design model, validation, scoring, solver. */
(function () {
  "use strict";

  const D = window.MA.DATA;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const find = (list, id) => list.find((x) => x.id === id) || list[0];

  function designOf(mission, design) {
    const d = design || mission.defaultDesign;
    return {
      bus: find(D.buses, d.bus),
      vehicle: find(D.vehicles, d.vehicle),
      ground: find(D.grounds, d.ground),
      life: find(D.lives, d.life),
      test: find(D.tests, d.test),
      payloads: D.payloads.filter((p) => d.payloads.includes(p.id)),
    };
  }

  function defaultDesign(mission) {
    return {
      bus: mission.defaultDesign.bus,
      vehicle: mission.defaultDesign.vehicle,
      ground: mission.defaultDesign.ground,
      life: mission.defaultDesign.life,
      test: mission.defaultDesign.test,
      payloads: mission.defaultDesign.payloads.slice(),
    };
  }

  function rollup(mission, design) {
    const sel = designOf(mission, design);
    const capacity = sel.vehicle.capacity[mission.body] || 0;
    const mass = sel.bus.mass + sel.payloads.reduce((n, p) => n + p.mass, 0);
    const powerDemand = sel.payloads.reduce((n, p) => n + p.power, 0);
    const powerSupply = Math.round(sel.bus.power * mission.multipliers.solar);
    const dishBonus = sel.payloads.reduce((n, p) => n + (p.downlink || 0), 0);
    const downlink = (sel.bus.downlink + dishBonus) * mission.multipliers.comm;
    const dataGen = sel.payloads.reduce((n, p) => n + p.data, 0) * mission.multipliers.data;
    const dataReturned = Math.min(dataGen, downlink) * sel.ground.eff;
    const budget = sel.bus.cost + sel.payloads.reduce((n, p) => n + p.cost, 0) +
      sel.vehicle.cost + sel.ground.cost + sel.life.cost + sel.test.cost + mission.fixedCost;
    const dataRatio = dataGen > 0 ? Math.min(1, downlink / dataGen) : 1;
    const science = sel.payloads.reduce((n, p) => n + p.science, 0) *
      mission.multipliers.science * sel.life.sci * sel.ground.coverage * dataRatio;

    let risk = 4 + mission.multipliers.risk + sel.bus.risk + sel.vehicle.risk +
      sel.life.risk + sel.test.risk + sel.ground.risk;
    const massMargin = capacity > 0 ? (capacity - mass) / capacity : -1;
    const powerMargin = powerSupply > 0 ? (powerSupply - powerDemand) / powerSupply : -1;
    if (massMargin < 0.05) risk += 6;
    if (powerMargin < 0.1) risk += 5;
    if (dataRatio < 1) risk += 4;
    risk = clamp(risk, 2, 60);

    const missing = mission.requiredPayloads.filter((id) => !design.payloads.includes(id));
    const hard = [];
    if (mass > capacity) hard.push({
      key: "mass",
      label: "MASS OVER VEHICLE LIMIT",
      text: `The stack is ${Math.round(mass - capacity)} kg over Vector-${sel.vehicle.id.slice(-1).toUpperCase()} capacity on this orbit.`,
    });
    if (powerDemand > powerSupply) hard.push({
      key: "power",
      label: "POWER SHORTFALL",
      text: `Payloads draw ${powerDemand} W. The bus supplies ${powerSupply} W in this orbit.`,
    });
    if (budget > mission.budgetCap) hard.push({
      key: "budget",
      label: "BUDGET OVER CAP",
      text: `The design costs ${money(budget)}, ${money(budget - mission.budgetCap)} over the mission cap.`,
    });
    if (missing.length) hard.push({
      key: "required",
      label: "MISSION REQUIREMENT MISSING",
      text: `The brief requires ${missing.map((id) => find(D.payloads, id).name.toLowerCase()).join(" and ")}.`,
    });
    if (mission.requiredBus && design.bus !== mission.requiredBus) hard.push({
      key: "bus",
      label: "BUS CLASS TOO SMALL",
      text: `This mission requires the ${find(D.buses, mission.requiredBus).name.toLowerCase()}.`,
    });
    if (mission.requiredGround && design.ground !== mission.requiredGround) hard.push({
      key: "ground",
      label: "GROUND SEGMENT CANNOT CLOSE THE LINK",
      text: mission.body === "earth"
        ? "Select the network named in the brief."
        : "Only the Deep Space Network can close this link. Earth-orbit stations cannot.",
    });
    if (mission.body !== "earth" && sel.ground.id !== "dsn") hard.push({
      key: "ground",
      label: "GROUND SEGMENT CANNOT CLOSE THE LINK",
      text: "Earth-orbit stations cannot reach a spacecraft beyond Earth orbit. Use the Deep Space Network.",
    });

    const soft = [];
    if (science < mission.targetScience) soft.push({
      key: "science",
      label: "SCIENCE SHORTFALL",
      text: `Projected ${Math.round(science)} of ${mission.targetScience} science points.`,
    });
    if (dataReturned < mission.minData) soft.push({
      key: "data",
      label: "DOWNLINK SHORTFALL",
      text: `Returned ${dataReturned.toFixed(1)} of ${mission.minData} GB/sol.`,
    });
    if (risk > mission.maxRisk) soft.push({
      key: "risk",
      label: "RISK OVER MISSION LIMIT",
      text: `Risk is ${Math.round(risk)}%, above the ${mission.maxRisk}% limit.`,
    });

    return {
      mission, ...sel, design,
      capacity, mass, massMargin,
      powerDemand, powerSupply, powerMargin,
      dishBonus, downlink, dataGen, dataRatio, dataReturned,
      budget, budgetCap: mission.budgetCap, budgetMargin: mission.budgetCap - budget,
      science, risk, missing, hard, soft,
      valid: hard.length === 0,
      meetsAll: hard.length === 0 && soft.length === 0,
    };
  }

  function scoreOf(r) {
    const s = Math.min(1, r.science / r.mission.targetScience);
    const d = Math.min(1, r.dataReturned / r.mission.minData);
    const m = clamp(r.massMargin / 0.35, 0, 1);
    const c = clamp(r.budgetMargin / r.mission.budgetCap / 0.3, 0, 1);
    const k = clamp(1 - r.risk / 35, 0, 1);
    const score = Math.round(100 * (0.42 * s + 0.14 * d + 0.08 * m + 0.16 * c + 0.2 * k));
    return {
      score: clamp(score, 0, 100),
      stars: score >= 85 ? 3 : score >= 72 ? 2 : score >= 55 ? 1 : 0,
    };
  }

  function resultOf(mission, design) {
    const r = rollup(mission, design);
    const checks = [
      { key: "science", label: "Science target", value: `${Math.round(r.science)} / ${mission.targetScience}`, ok: r.science >= mission.targetScience },
      { key: "data", label: "Data returned", value: `${r.dataReturned.toFixed(1)} / ${mission.minData} GB/sol`, ok: r.dataReturned >= mission.minData },
      { key: "risk", label: "Mission risk", value: `${Math.round(r.risk)}% / ${mission.maxRisk}%`, ok: r.risk <= mission.maxRisk },
      { key: "budget", label: "Budget", value: `${money(r.budget)} / ${money(mission.budgetCap)}`, ok: r.budget <= mission.budgetCap },
      { key: "mass", label: "Launch mass", value: `${Math.round(r.mass)} / ${r.capacity} kg`, ok: r.mass <= r.capacity },
      { key: "power", label: "Power balance", value: `${r.powerDemand} / ${r.powerSupply} W`, ok: r.powerDemand <= r.powerSupply },
    ];
    const success = checks.every((c) => c.ok);
    return { ...r, ...scoreOf(r), checks, success };
  }

  /* Brute-force the cheapest fully-compliant design close to the current one.
     Small space (3x3x3x3x3x256) so clarity beats a clever search. */
  function autoSolve(mission, current) {
    const ids = D.payloads.map((p) => p.id);
    const n = ids.length;
    let best = null;
    for (const bus of D.buses) {
      for (const vehicle of D.vehicles) {
        for (const ground of D.grounds) {
          for (const life of D.lives) {
            for (const test of D.tests) {
              for (let mask = 0; mask < (1 << n); mask++) {
                const payloads = ids.filter((_, i) => mask & (1 << i));
                const design = { bus: bus.id, vehicle: vehicle.id, ground: ground.id, life: life.id, test: test.id, payloads };
                const r = rollup(mission, design);
                if (!r.meetsAll) continue;
                let changes = 0;
                if (current) {
                  if (current.bus !== design.bus) changes++;
                  if (current.vehicle !== design.vehicle) changes++;
                  if (current.ground !== design.ground) changes++;
                  if (current.life !== design.life) changes++;
                  if (current.test !== design.test) changes++;
                  const cur = new Set(current.payloads);
                  const next = new Set(design.payloads);
                  changes += ids.filter((id) => cur.has(id) !== next.has(id)).length;
                }
                const rank = r.budget + changes * 12;
                if (!best || rank < best.rank) best = { rank, design, r };
              }
            }
          }
        }
      }
    }
    return best ? best.design : null;
  }

  function money(v) {
    if (Math.abs(v) >= 1000) {
      const b = v / 1000;
      return "$" + (Number.isInteger(b) ? b.toFixed(0) : b.toFixed(2).replace(/0$/, "")) + "B";
    }
    return "$" + Math.round(v) + "M";
  }

  function selfCheck() {
    const out = [];
    const ok = (name, cond) => out.push({ name, pass: !!cond });
    ok("three missions", D.missions.length === 3);
    D.missions.forEach((m) => {
      const def = rollup(m, m.defaultDesign);
      ok(`${m.no} default design is launchable`, def.valid);
      const solved = autoSolve(m, m.defaultDesign);
      ok(`${m.no} has a compliant solution`, !!solved);
      if (solved) {
        const r = rollup(m, solved);
        ok(`${m.no} solution meets all requirements`, r.meetsAll);
        ok(`${m.no} solution inside budget`, r.budget <= m.budgetCap);
        ok(`${m.no} solution inside mass`, r.mass <= r.capacity);
      }
    });
    const failed = out.filter((x) => !x.pass);
    console.info("%c[Mission Architect] self-check " + (failed.length ? "FAILED" : "passed") + ` (${out.length} checks)`, failed.length ? "color:#ff6b6b" : "color:#46e6a0");
    if (failed.length) console.table(failed);
    return failed.length === 0;
  }

  window.MA = window.MA || {};
  window.MA.Model = { rollup, resultOf, scoreOf, autoSolve, defaultDesign, money, find, selfCheck };
})();
