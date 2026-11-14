/* Mission Architect — campaign, design UI, launch flow, debrief. */
(function () {
  "use strict";

  const D = window.MA.DATA;
  const M = window.MA.Model;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SAVE_KEY = "mission-architect.v1";

  const PAY_COLOR = {
    cam: "#5fd3ff", spec: "#46e6a0", dish: "#ffd166", can: "#ff8a3d",
    rad: "#ff6b6b", mag: "#9d8cff", lidar: "#7fe3ff", bio: "#7dffb0",
  };
  const BODY_GLOW = {
    earth: "rgba(95,211,255,.16)", moon: "rgba(157,140,255,.16)", mars: "rgba(255,138,61,.16)",
  };

  const state = {
    missionId: "ares",
    design: null,
    unlocked: 1,
    cml: 1,
    best: {},
    muted: false,
    last: "ares",
    launching: false,
    finished: false,
    no3d: false,
    result: null,
    started: false,
    stage: 0,
    crew: ["", "", "", ""],
    crewSet: false,
  };

  const STAGES = D.stages;
  const LAST = STAGES.length - 1;
  const roleOf = (id) => D.roles.find((r) => r.id === id) || D.roles[0];
  const crewName = (i) => state.crew[i] || "Player " + (i + 1);
  const roleIndex = (r) => D.roles.findIndex((x) => x.id === r.id);

  let scene = null;
  let sound = null;
  let toastTimer = 0;
  let lastPhase = "";

  /* ---------- save ---------- */
  function loadSave() {
    try {
      const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
      if (!raw || typeof raw !== "object") return;
      state.unlocked = clampInt(raw.unlocked, 1, D.missions.length);
      state.cml = clampInt(raw.cml, 1, 4);
      state.muted = !!raw.muted;
      state.last = D.missions.some((m) => m.id === raw.last) ? raw.last : "ares";
      if (raw.best && typeof raw.best === "object") state.best = raw.best;
      if (Array.isArray(raw.crew)) {
        state.crew = [0, 1, 2, 3].map((i) => String(raw.crew[i] || "").slice(0, 16));
        state.crewSet = state.crew.some(Boolean);
      }
    } catch (e) { /* ignore a broken save */ }
  }
  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        unlocked: state.unlocked, cml: state.cml, muted: state.muted,
        last: state.missionId, best: state.best, crew: state.crew,
      }));
    } catch (e) { /* private mode is fine */ }
  }
  function clampInt(v, a, b) {
    v = Math.round(Number(v) || a);
    return Math.max(a, Math.min(b, v));
  }

  /* ---------- helpers ---------- */
  const mission = () => D.missions.find((m) => m.id === state.missionId) || D.missions[0];
  const missionIndex = () => D.missions.findIndex((m) => m.id === state.missionId);
  const clone = (d) => ({ ...d, payloads: d.payloads.slice() });
  const fmtInt = (n) => Math.round(n).toLocaleString("en-US");
  const fmtOne = (n) => (Math.round(n * 10) / 10).toFixed(1);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => el.classList.remove("is-on"), 3600);
  }

  /* ---------- brief + design markup ---------- */
  function buildBrief(m) {
    $("#briefNo").textContent = m.no;
    $("#briefDiff").textContent = m.difficulty;
    $("#briefCml").textContent = "CML " + m.cml;
    $("#briefName").textContent = m.name;
    $("#briefTag").textContent = m.tagline;
    $("#briefNeed").textContent = m.need;
    $("#briefObj").textContent = m.objective;
    $("#briefGrid").innerHTML = [
      ["ORBIT", m.orbitLabel],
      ["SCIENCE", m.targetScience + " pts"],
      ["DATA FLOOR", m.minData + " GB/sol"],
      ["BUDGET CAP", M.money(m.budgetCap)],
      ["RISK LIMIT", m.maxRisk + "%"],
      ["DEVELOPMENT", D.meta.devMonths + " mo"],
    ].map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("");
  }

  function optHTML(o) {
    return `<button type="button" class="opt" data-group="${o.group}" data-id="${o.id}" aria-pressed="false" title="${esc(o.blurb || o.meta)}">
      <span class="o-name">${esc(o.name)}</span>
      <span class="o-stats">${esc(o.stats)}</span>
      <b class="o-cost">${esc(o.cost)}</b>
      <span class="o-meta">${esc(o.meta)}</span>
      <span class="o-blurb">${esc(o.blurb || "")}</span>
    </button>`;
  }

  function buildSections(m) {
    const cap = (v) => v.capacity[m.body] || 0;
    const busOpts = D.buses.map((b) => optHTML({
      group: "bus", id: b.id, name: b.name, meta: b.family,
      stats: `${b.mass} kg · ${b.power} W · ${b.downlink} GB/sol downlink`,
      cost: M.money(b.cost), blurb: b.blurb,
    })).join("");
    const payOpts = D.payloads.map((p) => optHTML({
      group: "payload", id: p.id, name: p.name, meta: p.role,
      stats: `${p.mass} kg · ${p.power} W · ${p.data} GB/sol gen · sci ${p.science}`,
      cost: M.money(p.cost) + (p.downlink ? ` · +${p.downlink} GB link` : ""),
      blurb: p.blurb,
    })).join("");
    const vehOpts = D.vehicles.map((v) => optHTML({
      group: "vehicle", id: v.id, name: v.name, meta: v.family,
      stats: `${cap(v)} kg to ${m.bodyLabel} · risk ${v.risk > 0 ? "+" : ""}${v.risk}`,
      cost: M.money(v.cost), blurb: v.blurb,
    })).join("");
    const groundOpts = D.grounds.map((g) => optHTML({
      group: "ground", id: g.id, name: g.name, meta: g.family,
      stats: `eff ${Math.round(g.eff * 100)}% · coverage ${Math.round(g.coverage * 100)}%`,
      cost: M.money(g.cost), blurb: g.blurb,
    })).join("");
    const lifeOpts = D.lives.map((l) => optHTML({
      group: "life", id: l.id, name: l.name, meta: l.family,
      stats: `science ×${l.sci.toFixed(2)} · risk +${l.risk}`,
      cost: M.money(l.cost), blurb: l.blurb,
    })).join("");
    const testOpts = D.tests.map((t) => optHTML({
      group: "test", id: t.id, name: t.name, meta: t.family,
      stats: `risk ${t.risk > 0 ? "+" : ""}${t.risk} · schedule ${t.months ? "+" + t.months + " mo" : "as planned"}`,
      cost: M.money(t.cost), blurb: t.blurb,
    })).join("");

    return {
      bus: `<details class="dsec" open>
        <summary><span class="dnum">01</span><span class="dname">Spacecraft bus</span><span class="dsel" data-sel="bus"></span></summary>
        <div class="opts opts-1">${busOpts}</div>
      </details>`,
      payload: `<details class="dsec" open>
        <summary><span class="dnum">02</span><span class="dname">Payload</span><span class="dsel" data-sel="payload"></span></summary>
        <div class="opts opts-2">${payOpts}</div>
      </details>`,
      vehicle: `<details class="dsec" open>
        <summary><span class="dnum">03</span><span class="dname">Launch vehicle</span><span class="dsel" data-sel="vehicle"></span></summary>
        <div class="opts opts-3">${vehOpts}</div>
      </details>`,
      ground: `<details class="dsec" open>
        <summary><span class="dnum">04</span><span class="dname">Ground segment</span><span class="dsel" data-sel="ground"></span></summary>
        <div class="opts opts-3">${groundOpts}</div>
      </details>`,
      life: `<details class="dsec" open>
        <summary><span class="dnum">05</span><span class="dname">Operations life</span><span class="dsel" data-sel="ops"></span></summary>
        <div class="opts opts-3">${lifeOpts}</div>
      </details>`,
      test: `<details class="dsec" open>
        <summary><span class="dnum">06</span><span class="dname">Test programme</span><span class="dsel" data-sel="test"></span></summary>
        <div class="opts opts-3">${testOpts}</div>
      </details>`,
    };
  }

  function briefStage(m) {
    const roleList = D.roles.map((r) => {
      const mine = STAGES.filter((s) => s.role === r.id).map((s) => s.name);
      return `<li style="--rc:${r.colour}">
        <b>${r.code}</b>
        <span><strong>${esc(r.name)}</strong><em>${esc(mine.join(" · "))}</em></span>
      </li>`;
    }).join("");
    const rows = [
      ["SCIENCE", m.targetScience + " points minimum"],
      ["DATA", m.minData + " GB per sol returned"],
      ["RISK", "at or under " + m.maxRisk + "%"],
      ["BUDGET", M.money(m.budgetCap) + " for the whole mission"],
    ].map(([k, v]) => `<li><span>${k}</span><b>${esc(v)}</b></li>`).join("");
    return `<div class="board">
      <p class="mono">WHAT THE BOARD WILL CHECK</p>
      <ul class="board-list">${rows}</ul>
    </div>
    <div class="roster">
      <p class="mono">CONSOLES ON THIS MISSION</p>
      <ul class="roster-list">${roleList}</ul>
      <button type="button" class="link-btn" id="rosterEdit">Change crew names</button>
    </div>`;
  }

  function renderStage() {
    const m = mission();
    const s = STAGES[state.stage];
    const role = roleOf(s.role);
    const i = roleIndex(role);

    $("#stageOf").textContent = `STAGE ${state.stage + 1} OF ${STAGES.length}`;
    $("#stageTitle").textContent = s.name;
    $("#stageGoal").textContent = s.goal;
    $("#stageRole").style.setProperty("--rc", role.colour);
    $("#stageRoleName").textContent = role.name.toUpperCase();
    $("#stageRoleWho").textContent = crewName(i);

    $("#stageRail").innerHTML = STAGES.map((st, n) => {
      const r = roleOf(st.role);
      return `<button type="button" class="rail-step ${n === state.stage ? "is-on" : ""} ${n < state.stage ? "is-done" : ""}"
        data-stage="${n}" style="--rc:${r.colour}" aria-current="${n === state.stage ? "step" : "false"}">
        <i>${n + 1}</i><b>${st.short || st.name}</b><em>${r.code}</em>
      </button>`;
    }).join("");

    const secs = buildSections(m);
    $("#design").innerHTML = s.groups.length
      ? s.groups.map((g) => secs[g]).join("")
      : briefStage(m);

    $$(".opt[data-group='payload']", $("#design")).forEach((el) => {
      el.style.setProperty("--c", PAY_COLOR[el.dataset.id] || "#5fd3ff");
    });

    $("#panel").classList.toggle("is-brief-stage", state.stage === 0);
    $("#stageBack").disabled = state.stage === 0;

    const first = $("#design .opt.is-on") || $("#design .opt") || $("#runBtn");
    if (first && document.body.classList.contains("is-playing")) first.focus({ preventScroll: true });
    syncAll();
  }

  function goStage(n) {
    if (n < 0 || n > LAST) return;
    state.stage = n;
    renderStage();
    $("#panelScroll").scrollTop = 0;
  }

  let pendingStage = -1;
  function handoff(n) {
    const st = STAGES[n];
    const role = roleOf(st.role);
    pendingStage = n;
    $("#handRole").textContent = role.name;
    $("#handName").textContent = crewName(roleIndex(role));
    $("#handTask").textContent = st.goal;
    openModal("handoffModal");
  }

  function advance() {
    if (state.stage < LAST) {
      const next = state.stage + 1;
      if (STAGES[next].role !== STAGES[state.stage].role) handoff(next);
      else goStage(next);
      return;
    }
    startLaunch();
  }

  /* ---------- live sync ---------- */
  function syncAll() {
    const m = mission();
    const d = state.design;
    const r = M.rollup(m, d);
    const cap = r.capacity;

    $$("#design .opt").forEach((el) => {
      const g = el.dataset.group;
      const on = g === "payload" ? d.payloads.includes(el.dataset.id) : d[g] === el.dataset.id;
      el.classList.toggle("is-on", on);
      el.setAttribute("aria-pressed", String(on));
    });

    const pick = (list, id) => list.find((x) => x.id === id);
    const bus = pick(D.buses, d.bus);
    const veh = pick(D.vehicles, d.vehicle);
    const grd = pick(D.grounds, d.ground);
    const life = pick(D.lives, d.life);
    const test = pick(D.tests, d.test);
    const sel = (name, text) => {
      const el = $(`[data-sel="${name}"]`);
      if (el) el.textContent = text;
    };
    sel("bus", bus.name);
    sel("payload", `${d.payloads.length} selected · ${Math.round(r.mass - bus.mass)} kg`);
    sel("vehicle", veh.name);
    sel("ground", grd.name);
    sel("ops", `${life.name.split(" ")[0]} mo`);
    sel("test", test.name);

    setMeter("mass", r.mass, cap, fmtInt, "kg");
    setMeter("power", r.powerDemand, r.powerSupply, fmtInt, "W");
    setMeter("data", r.dataGen, r.downlink, (v) => fmtOne(v), "GB");
    setMeter("budget", r.budget, m.budgetCap, M.money);

    const sci = $("#cSci");
    sci.textContent = `${Math.round(r.science)} / ${m.targetScience}`;
    sci.classList.toggle("is-bad", r.science < m.targetScience);
    const risk = $("#cRisk");
    risk.textContent = `${Math.round(r.risk)}% / ${m.maxRisk}%`;
    risk.classList.toggle("is-bad", r.risk > m.maxRisk);

    // stage status
    if (!state.launching && !state.result) {
      const st = $("#stageState");
      if (r.hard.length) {
        st.textContent = "DESIGN HOLD";
        st.className = "stage-state is-bad";
      } else if (r.soft.length) {
        st.textContent = "REVIEW";
        st.className = "stage-state is-live";
      } else {
        st.textContent = "NOMINAL";
        st.className = "stage-state";
      }
    }

    // alert + footer action
    const run = $("#runBtn");
    if (r.hard.length) {
      $("#alert").hidden = false;
      $("#alertTitle").textContent = r.hard[0].label;
      $("#alertText").textContent = r.hard[0].text + (state.stage < LAST ? " Fix it before launch." : "");
      $("#fixBtn").hidden = false;
    } else {
      $("#alert").hidden = true;
    }

    const labels = [
      "Accept the brief",
      "Continue: launch vehicle",
      "Continue: ground & ops",
      "Continue: test & review",
    ];
    if (state.launching) {
      run.disabled = true;
      run.classList.add("is-busy");
      run.textContent = "Mission in flight…";
    } else if (state.stage < LAST) {
      run.disabled = false;
      run.classList.remove("is-busy");
      run.innerHTML = `${labels[state.stage]} <span aria-hidden="true">→</span>`;
    } else {
      run.disabled = r.hard.length > 0;
      run.classList.remove("is-busy");
      run.innerHTML = r.hard.length
        ? "Resolve the violation to launch"
        : "Run mission simulation <span aria-hidden='true'>→</span>";
    }
    return r;
  }

  function setMeter(key, value, cap, fmt, unit) {
    const el = document.querySelector(`.meter[data-meter="${key}"]`);
    const bar = $("#b" + key[0].toUpperCase() + key.slice(1));
    const num = $("#m" + key[0].toUpperCase() + key.slice(1));
    const capEl = $("#m" + key[0].toUpperCase() + key.slice(1) + "Cap");
    const ratio = cap > 0 ? value / cap : 0;
    const over = value > cap + 1e-9;
    const warn = !over && ratio >= 0.96;
    el.classList.toggle("is-over", over);
    el.classList.toggle("is-warn", warn);
    bar.style.width = Math.min(100, Math.max(0, ratio * 100)).toFixed(1) + "%";
    num.textContent = fmt(value);
    capEl.textContent = key === "budget" ? M.money(cap) : fmt(cap);
    el.title = unit ? `${fmt(value)} of ${fmt(cap)} ${unit}` : `${fmt(value)} of ${fmt(cap)}`;
  }

  /* ---------- mission load ---------- */
  function loadMission(id, opts) {
    const m = D.missions.find((x) => x.id === id) || D.missions[0];
    state.missionId = m.id;
    state.design = M.defaultDesign(m);
    state.result = null;
    state.finished = false;
    state.launching = false;
    state.started = true;

    document.body.classList.remove("is-title", "is-launching");
    document.body.classList.add("is-playing");
    $("#titleScreen").setAttribute("aria-hidden", "true");
    $("#launchHud").hidden = true;
    lastPhase = "";

    buildBrief(m);
    state.stage = 0;
    renderStage();
    $("#pillCode").textContent = m.no;
    $("#pillName").textContent = m.name;
    $("#pillCml").textContent = "CML " + m.cml;
    $("#stageKicker").textContent = `${m.no} // ${m.name}`;
    $("#lhMission").textContent = `${m.no} // ${m.name}`;
    $("#stageState").textContent = "ON PAD";
    $("#stageState").className = "stage-state";
    $("#lhAlt").innerHTML = "0 <i>KM</i>";
    $("#lhVel").innerHTML = "0 <i>M/S</i>";
    $("#lhStage").textContent = "IGNITION";
    $("#lhLog").innerHTML = "";
    $("#lhBar").style.width = "0%";
    $("#panelScroll").scrollTop = 0;

    if (scene) {
      scene.setDesign(m, state.design);
      scene.reset();
      scene.setComposition("design");
    }
    syncAll();
    save();
    closeAllModals(false);
    if (!state.crewSet) {
      renderCrew();
      openModal("crewModal");
    } else if (!opts || opts.focus !== false) {
      const first = $("#design .opt.is-on") || $("#design .opt");
      if (first) first.focus({ preventScroll: true });
    }
  }

  /* ---------- option click ---------- */
  function onDesignClick(e) {
    const el = e.target.closest(".opt");
    if (!el || state.launching) return;
    const g = el.dataset.group;
    const id = el.dataset.id;
    if (g === "payload") {
      const i = state.design.payloads.indexOf(id);
      if (i >= 0) state.design.payloads.splice(i, 1);
      else state.design.payloads.push(id);
    } else {
      state.design[g] = id;
    }
    state.result = null;
    const r = syncAll();
    if (scene) scene.setDesign(mission(), state.design);
    if (r.hard.length) {
      const alert = $("#alert");
      alert.classList.remove("shake");
      void alert.offsetWidth;
      alert.classList.add("shake");
    }
  }

  /* ---------- auto fix ---------- */
  function autoFix() {
    const m = mission();
    const btn = $("#fixBtn");
    const old = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Solving…";
    window.setTimeout(() => {
      const solved = M.autoSolve(m, state.design);
      btn.disabled = false;
      btn.textContent = old;
      if (!solved) {
        toast("No compliant design found. Change the mission requirements or loosen the stack.");
        return;
      }
      state.design = solved;
      state.result = null;
      syncAll();
      if (scene) scene.setDesign(m, state.design);
      const r = M.rollup(m, solved);
      toast(`Cheapest compliant stack applied: ${M.money(r.budget)} · ${Math.round(r.science)} science · ${Math.round(r.risk)}% risk.`);
    }, 60);
  }

  /* ---------- launch ---------- */
  function startLaunch() {
    if (state.launching) return;
    const m = mission();
    const r = M.rollup(m, state.design);
    if (r.hard.length) {
      syncAll();
      const alert = $("#alert");
      alert.classList.remove("shake");
      void alert.offsetWidth;
      alert.classList.add("shake");
      return;
    }

    state.launching = true;
    state.finished = false;
    state.result = M.resultOf(m, clone(state.design));
    state.launchResult = state.result;
    lastPhase = "";

    document.body.classList.add("is-launching");
    $("#launchHud").hidden = false;
    $("#lhLog").innerHTML = "";
    $("#lhBar").style.width = "0%";
    $("#lhAlt").innerHTML = "0 <i>KM</i>";
    $("#lhVel").innerHTML = "0 <i>M/S</i>";
    $("#lhStage").textContent = "IGNITION";
    $("#runBtn").disabled = true;
    $("#runBtn").classList.add("is-busy");
    $("#runBtn").textContent = "Mission in flight…";

    launchSound();

    if (scene && scene.isReady()) {
      scene.setDesign(m, state.design);
      scene.setComposition("launch");
      scene.launch(m, state.design, {
        fast: reduce,
        onTelemetry: onTelemetry,
        onPhase: onPhase,
        onComplete: finishLaunch,
      });
    } else {
      // no WebGL: keep the game playable with a timed sequence
      const seq = [
        ["IGNITION", 0, 0, 0],
        ["LIFTOFF", 0.1, 4, 120],
        ["MAX-Q", 0.34, 38, 1800],
        ["STAGE SEP", 0.5, 96, 3400],
        ["FAIRING DEPLOY", 0.66, 210, 5200],
        ["ORBIT INSERTION", 0.83, 550, 7600],
        ["MISSION COMPLETE", 1, 550, 7600],
      ];
      seq.forEach(([name, prog, alt, vel], i) => {
        window.setTimeout(() => {
          if (!state.launching) return;
          onTelemetry({ alt, vel, phase: name, progress: prog });
          onPhase(name, { progress: prog, t: prog * 7 });
          if (i === seq.length - 1) finishLaunch();
        }, i * 420);
      });
    }
  }

  function onTelemetry(t) {
    $("#lhAlt").innerHTML = `${fmtInt(t.alt)} <i>KM</i>`;
    $("#lhVel").innerHTML = `${fmtInt(t.vel)} <i>M/S</i>`;
    $("#lhBar").style.width = (t.progress * 100).toFixed(1) + "%";
  }

  function onPhase(name, data) {
    if (name === lastPhase) return;
    lastPhase = name;
    $("#lhStage").textContent = name;
    const t = Math.max(0, Math.round((data && data.t) || 0));
    const mm = String(Math.floor(t / 60)).padStart(2, "0");
    const ss = String(t % 60).padStart(2, "0");
    const log = $("#lhLog");
    const p = document.createElement("p");
    p.innerHTML = `<b>T+${mm}:${ss}</b> ${esc(name)}`;
    log.appendChild(p);
    while (log.children.length > 6) log.removeChild(log.firstChild);
  }

  function finishLaunch() {
    if (state.finished) return;
    state.finished = true;
    state.launching = false;
    document.body.classList.remove("is-launching");
    $("#launchHud").hidden = true;
    $("#runBtn").classList.remove("is-busy");
    $("#runBtn").disabled = false;
    $("#runBtn").innerHTML = "Run mission simulation <span aria-hidden='true'>→</span>";
    const st = $("#stageState");
    st.textContent = "IN ORBIT";
    st.className = "stage-state";
    stopSound();
    window.setTimeout(() => {
      /* Integration: the merged site continues into Mission Control's orbit phase. */
      if (window.MA_BRIDGE && window.MA_BRIDGE.onOrbit) {
        window.MA_BRIDGE.onOrbit();
        return;
      }
      if (state.result) showDebrief(state.result);
    }, reduce ? 100 : 360);
  }

  /* ---------- debrief ---------- */
  function showDebrief(r) {
    const m = r.mission;
    const idx = D.missions.findIndex((x) => x.id === m.id);
    const next = D.missions[idx + 1];
    const success = r.success;

    $("#dbCode").textContent = `${m.no} // DEBRIEF`;
    const out = $("#dbOutcome");
    out.textContent = success ? "MISSION READY" : "REQUIREMENTS MISSED";
    out.className = "tag " + (success ? "is-pass" : "is-fail");
    $("#dbScore").textContent = "0";
    $("#scoreRing").style.setProperty("--p", "0");

    const fail = r.checks.find((c) => !c.ok);
    let title;
    if (success && r.score >= 85) title = "A mission a review board would fund.";
    else if (success) title = "The mission closes. The margins are doing the work.";
    else if (fail && fail.key === "science") title = "The spacecraft flew. The science did not arrive.";
    else if (fail && fail.key === "data") title = "The link was the limit.";
    else if (fail && fail.key === "risk") title = "The design outran its evidence.";
    else title = "The mission flew, but the design did not close.";

    const summary = `${r.vehicle.name} lifted ${Math.round(r.mass)} kg on a ${m.orbitLabel} profile. The stack returned ${fmtOne(r.dataReturned)} GB/sol and delivered ${Math.round(r.science)} of ${m.targetScience} science points. Risk closed at ${Math.round(r.risk)}%.`;
    $("#dbTitle").textContent = title;
    $("#dbText").textContent = success
      ? summary
      : `${fail ? fail.label + " missed its requirement. " : ""}${summary}`;

    $("#dbStats").innerHTML = [
      ["SCIENCE", `${Math.round(r.science)} / ${m.targetScience}`],
      ["DATA", `${fmtOne(r.dataReturned)} GB/sol`],
      ["RISK", `${Math.round(r.risk)}%`],
      ["COST", M.money(r.budget)],
    ].map(([k, v]) => `<div><b>${esc(v)}</b><span>${k}</span></div>`).join("");

    $("#dbChecks").innerHTML = r.checks.map((c) =>
      `<li class="${c.ok ? "" : "bad"}"><b>${esc(c.label)}</b><span>${esc(c.value)}</span></li>`
    ).join("");

    const pick = (id) => {
      if (id === "sci") return `${r.bus.name} · ${r.payloads.length} payload${r.payloads.length === 1 ? "" : "s"}`;
      if (id === "lch") return r.vehicle.name;
      if (id === "ops") return `${r.ground.name} · ${r.life.name}`;
      return r.test.name;
    };
    $("#dbCrew").innerHTML = D.roles.map((role, i) =>
      `<span style="--rc:${role.colour}"><b>${role.code}</b><em>${esc(crewName(i))}</em><small>${esc(pick(role.id))}</small></span>`
    ).join("");

    $("#dbLesson").textContent = success
      ? m.lesson
      : `${fail ? fail.label + ". " : ""}${m.lesson}`;

    // campaign unlock (before the footer, so "next" reflects it)
    if (success) {
      const prevBest = state.best[m.id];
      if (!prevBest || r.score > prevBest.score) {
        state.best[m.id] = { score: r.score, stars: r.stars };
      }
      const oldUnlocked = state.unlocked;
      const oldCml = state.cml;
      state.unlocked = Math.max(state.unlocked, Math.min(D.missions.length, idx + 2));
      state.cml = Math.max(state.cml, m.cml);
      save();
      if (state.unlocked > oldUnlocked && next) {
        toast(`CML ${m.cml} reached · ${next.no} ${next.name} unlocked`);
      } else if (state.cml > oldCml && !next) {
        toast("Campaign complete · CML 4 point design reached");
      }
      renderCampaign();
    }

    const nextOk = success && next && state.unlocked > idx + 1;
    $("#dbNext").hidden = !nextOk;
    if (nextOk) $("#dbNext").innerHTML = `Next: ${next.name} <span aria-hidden="true">→</span>`;
    $("#dbCampaign").hidden = false;
    $("#dbCampaign").className = "btn btn-ghost";
    if (success && !next) {
      $("#dbCampaign").className = "btn btn-primary";
      $("#dbCampaign").textContent = "Campaign complete · review";
    } else {
      $("#dbCampaign").textContent = "Campaign";
    }

    openModal("debriefModal");
    const from = 0;
    const to = r.score;
    if (reduce) {
      $("#dbScore").textContent = String(to);
      $("#scoreRing").style.setProperty("--p", String(to));
    } else {
      const t0 = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - t0) / 700);
        const e = 1 - Math.pow(1 - p, 3);
        const v = Math.round(from + (to - from) * e);
        $("#dbScore").textContent = String(v);
        $("#scoreRing").style.setProperty("--p", String(v));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      window.setTimeout(() => {
        if ($("#dbScore").textContent !== String(to)) {
          $("#dbScore").textContent = String(to);
          $("#scoreRing").style.setProperty("--p", String(to));
        }
      }, 1100);
    }
  }

  function returnToDesign() {
    closeModal("debriefModal", false);
    state.result = null;
    state.launching = false;
    state.finished = false;
    if (scene) {
      scene.reset();
      scene.setComposition("design");
    }
    syncAll();
    const first = $("#design .opt.is-on");
    if (first) first.focus({ preventScroll: true });
  }

  /* ---------- crew ---------- */
  function renderCrew() {
    $("#crewGrid").innerHTML = D.roles.map((r, i) => {
      const mine = STAGES.filter((s) => s.role === r.id).map((s) => s.name).join(" · ");
      return `<label class="crew-row" style="--rc:${r.colour}">
        <span class="crew-badge">${r.code}</span>
        <span class="crew-what"><b>${esc(r.name)}</b><em>${esc(r.duty)}</em><small>${esc(mine)}</small></span>
        <input type="text" data-crew="${i}" maxlength="16" autocomplete="off"
          value="${esc(state.crew[i])}" placeholder="Player ${i + 1}" aria-label="${esc(r.name)} name" />
      </label>`;
    }).join("");
  }

  function commitCrew() {
    $$("[data-crew]", $("#crewGrid")).forEach((el) => {
      state.crew[Number(el.dataset.crew)] = el.value.trim().slice(0, 16);
    });
    state.crewSet = true;
    save();
    closeModal("crewModal", false);
    if (!document.body.classList.contains("is-title")) {
      renderStage();
      toast(`Crew set · ${crewName(0)} is Flight Director.`);
    }
  }

  /* ---------- campaign ---------- */
  function renderCampaign() {
    const prog = $("#campProgress");
    prog.innerHTML = D.cml.map((c) => {
      const done = c.level <= state.cml;
      const now = c.level === state.cml + 1;
      return `<div class="${done ? "is-done" : now ? "is-now" : ""}">
        <b>CML ${c.level}</b>${esc(c.name)}
      </div>`;
    }).join("");

    const grid = $("#campGrid");
    grid.innerHTML = D.missions.map((m, i) => {
      const unlocked = i < state.unlocked;
      const b = state.best[m.id];
      const active = m.id === state.missionId;
      return `<button type="button" class="camp-card ${unlocked ? "" : "is-locked"} ${active ? "is-active" : ""}"
        data-mission="${m.id}" data-locked="${unlocked ? "false" : "true"}"
        aria-disabled="${unlocked ? "false" : "true"}"
        style="--glow:${BODY_GLOW[m.body]}">
        <span class="camp-top"><span class="camp-no">${m.no} · CML ${m.cml}</span>
          ${unlocked ? `<span class="camp-best">${b ? "BEST " + b.score + " · " + "★".repeat(b.stars || 0) : "NOT FLOWN"}</span>` : `<span class="camp-lock">LOCKED</span>`}</span>
        <span class="camp-body">${esc(m.name)}</span>
        <span class="camp-tag">${esc(m.tagline)}</span>
        <span class="camp-orbit">${esc(m.orbitLabel)}</span>
        <span class="camp-desc">${esc(unlocked ? m.need : "Complete " + D.missions[i - 1].no + " to unlock this design study.")}</span>
        <span class="camp-stats">
          <span>TARGET<b>${m.targetScience} sci</b></span>
          <span>DATA<b>${m.minData} GB/sol</b></span>
          <span>CAP<b>${M.money(m.budgetCap)}</b></span>
        </span>
      </button>`;
    }).join("");
  }

  function onCampaignClick(e) {
    const card = e.target.closest(".camp-card");
    if (!card) return;
    const id = card.dataset.mission;
    if (card.dataset.locked === "true") {
      toast("Complete the previous design study to unlock this mission.");
      return;
    }
    loadMission(id);
  }

  /* ---------- modals ---------- */
  let focusBack = null;
  function openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    if (!focusBack) focusBack = document.activeElement;
    el.hidden = false;
    document.body.classList.add("modal-open");
    const first = el.querySelector("button, [href], input, [tabindex]");
    if (first) window.setTimeout(() => first.focus({ preventScroll: true }), 30);
  }
  function closeModal(id, restore) {
    const el = document.getElementById(id);
    if (!el || el.hidden) return;
    el.hidden = true;
    if (!$$(".modal").some((m) => !m.hidden)) document.body.classList.remove("modal-open");
    if (restore !== false && focusBack && document.contains(focusBack)) {
      focusBack.focus({ preventScroll: true });
    }
    focusBack = null;
  }
  function closeAllModals(restore) {
    $$(".modal").forEach((m) => { m.hidden = true; });
    document.body.classList.remove("modal-open");
    if (restore === false) focusBack = null;
  }

  /* ---------- sound ---------- */
  function launchSound() {
    if (state.muted) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      sound = sound || new AC();
      if (sound.state === "suspended") sound.resume();
      const dur = 2;
      const buf = sound.createBuffer(1, sound.sampleRate * dur, sound.sampleRate);
      const data = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.025 * white) / 1.025;
        data[i] = last * 3.2;
      }
      const src = sound.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const lp = sound.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 360;
      const g = sound.createGain();
      const now = sound.currentTime;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.16, now + 0.25);
      g.gain.setValueAtTime(0.16, now + 5.8);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 7.2);
      src.connect(lp).connect(g).connect(sound.destination);
      src.start();
      src.stop(now + 7.4);
      window._maRumble = { src, g };
    } catch (e) { /* audio is optional */ }
  }
  function stopSound() {
    const r = window._maRumble;
    if (!r || !sound) return;
    try {
      r.g.gain.cancelScheduledValues(sound.currentTime);
      r.g.gain.setValueAtTime(0.0001, sound.currentTime);
      r.src.stop(sound.currentTime + 0.05);
    } catch (e) { /* already stopped */ }
    window._maRumble = null;
  }
  function updateSoundBtn() {
    const b = $("#btnSound");
    b.textContent = state.muted ? "SOUND OFF" : "SOUND ON";
    b.setAttribute("aria-pressed", String(state.muted));
  }

  /* ---------- codex ---------- */
  function renderSources() {
    $("#sourceList").innerHTML = D.sources.map((s) => `
      <article class="source">
        <a href="${s.url}" target="_blank" rel="noopener noreferrer">${esc(s.name)} ↗</a>
        <p class="org">${esc(s.org)}</p>
        <p>${esc(s.used)}</p>
      </article>`).join("");
  }

  function selectCodexTab(name) {
    $$(".codex-tabs button").forEach((b) => {
      const on = b.dataset.ctab === name;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-selected", String(on));
    });
    $$(".ctab").forEach((p) => {
      const on = p.id === "ctab-" + name;
      p.classList.toggle("is-on", on);
      p.hidden = !on;
    });
  }

  /* ---------- events ---------- */
  function bind() {
    $("#btnStart").addEventListener("click", () => {
      document.body.classList.remove("is-title");
      document.body.classList.add("is-playing");
      $("#titleScreen").setAttribute("aria-hidden", "true");
      if (scene) scene.setComposition("design");
      renderCampaign();
      window.setTimeout(() => openModal("missionsModal"), 360);
    });
    $("#btnHow").addEventListener("click", () => {
      selectCodexTab("play");
      openModal("codexModal");
    });
    $("#brandBtn").addEventListener("click", () => {
      if (document.body.classList.contains("is-title")) return;
      renderCampaign();
      openModal("missionsModal");
    });
    $("#btnMissions").addEventListener("click", () => { renderCampaign(); openModal("missionsModal"); });
    $("#btnCodex").addEventListener("click", () => openModal("codexModal"));
    $("#btnSound").addEventListener("click", () => {
      state.muted = !state.muted;
      updateSoundBtn();
      save();
      if (state.muted) stopSound();
    });

    $("#design").addEventListener("click", onDesignClick);
    $("#design").addEventListener("click", (e) => {
      if (e.target.closest("#rosterEdit")) {
        renderCrew();
        openModal("crewModal");
      }
    });
    $("#runBtn").addEventListener("click", advance);
    $("#stageBack").addEventListener("click", () => goStage(state.stage - 1));
    $("#stageRail").addEventListener("click", (e) => {
      const b = e.target.closest("[data-stage]");
      if (b) goStage(Number(b.dataset.stage));
    });
    $("#stageRole").addEventListener("click", () => {
      renderCrew();
      openModal("crewModal");
    });
    $("#crewStart").addEventListener("click", commitCrew);
    $("#handBtn").addEventListener("click", () => {
      const n = pendingStage;
      closeModal("handoffModal", false);
      if (n >= 0) goStage(n);
      pendingStage = -1;
    });
    $("#fixBtn").addEventListener("click", autoFix);
    $("#lhSkip").addEventListener("click", () => {
      if (!state.launching) return;
      if (scene && scene.isReady()) scene.skip();
      else finishLaunch();
    });

    $$(".rig-cam button").forEach((b) => {
      b.addEventListener("click", () => {
        $$(".rig-cam button").forEach((x) => x.classList.remove("is-on"));
        b.classList.add("is-on");
        if (scene) scene.setView(b.dataset.cam);
      });
    });

    $$("[data-rig]").forEach((b) => {
      b.addEventListener("click", () => {
        if (scene && scene.isReady()) scene.nudge(b.dataset.rig);
      });
    });

    $("#campGrid").addEventListener("click", onCampaignClick);
    $$("[data-close]").forEach((b) => {
      b.addEventListener("click", () => closeModal(b.dataset.close));
    });
    $$(".modal").forEach((m) => {
      m.addEventListener("click", (e) => {
        if (e.target === m && m.id !== "handoffModal") closeModal(m.id);
      });
    });
    $("#dbDesign").addEventListener("click", returnToDesign);
    $("#dbCampaign").addEventListener("click", () => {
      closeModal("debriefModal", false);
      state.result = null;
      if (scene) { scene.reset(); scene.setComposition("design"); }
      syncAll();
      renderCampaign();
      openModal("missionsModal");
    });
    $("#dbNext").addEventListener("click", () => {
      const idx = missionIndex();
      const next = D.missions[idx + 1];
      if (!next) return;
      closeModal("debriefModal", false);
      loadMission(next.id);
    });

    $$(".codex-tabs button").forEach((b, i, arr) => {
      b.addEventListener("click", () => selectCodexTab(b.dataset.ctab));
      b.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        const next = arr[(i + (e.key === "ArrowRight" ? 1 : arr.length - 1)) % arr.length];
        next.focus();
        selectCodexTab(next.dataset.ctab);
      });
    });

    $("#resetCampaign").addEventListener("click", function () {
      if (this.dataset.armed !== "true") {
        this.dataset.armed = "true";
        this.textContent = "Click again to erase progress";
        window.setTimeout(() => {
          this.dataset.armed = "false";
          this.textContent = "Reset campaign progress";
        }, 4000);
        return;
      }
      try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
      state.unlocked = 1;
      state.cml = 1;
      state.best = {};
      state.last = "ares";
      this.dataset.armed = "false";
      this.textContent = "Reset campaign progress";
      renderCampaign();
      loadMission("ares");
      toast("Campaign reset. CML 1 · M-01 unlocked.");
    });

    window.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (state.launching) return;
      const open = ["debriefModal", "codexModal", "missionsModal", "crewModal", "handoffModal"].find((id) => {
        const el = document.getElementById(id);
        return el && !el.hidden;
      });
      if (!open) return;
      if (open === "debriefModal") returnToDesign();
      else if (open === "handoffModal") { closeModal(open, false); pendingStage = -1; }
      else closeModal(open);
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stopSound();
    });
  }

  /* ---------- boot ---------- */
  function boot() {
    loadSave();
    const savedIdx = missionIndexFromId(state.last);
    state.missionId = D.missions[Math.min(savedIdx, state.unlocked - 1)].id;
    state.design = M.defaultDesign(mission());

    buildBrief(mission());
    renderSources();
    renderCampaign();
    updateSoundBtn();
    renderStage();

    scene = window.MissionScene;
    if (scene) {
      const ok = scene.init({
        canvas: $("#scene"),
        stage: $("#stage"),
        fade: $("#stageFade"),
        onFail: () => {
          state.no3d = true;
          $("#stageFallback").hidden = false;
          $("#stageState").textContent = "MODEL ONLY";
          $("#stageState").className = "stage-state is-live";
        },
        onTelemetry: onTelemetry,
        onPhase: onPhase,
        onComplete: finishLaunch,
      });
      if (!ok) {
        state.no3d = true;
        $("#stageFallback").hidden = false;
      }
      scene.setDesign(mission(), state.design);
      scene.setComposition("title");
    } else {
      state.no3d = true;
      $("#stageFallback").hidden = false;
    }

    $("#pillCode").textContent = mission().no;
    $("#pillName").textContent = mission().name;
    $("#pillCml").textContent = "CML " + mission().cml;
    $("#stageKicker").textContent = `${mission().no} // ${mission().name}`;
    $("#lhMission").textContent = `${mission().no} // ${mission().name}`;

    bind();
    save();

    if (new URLSearchParams(location.search).has("selftest")) M.selfCheck();

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        if (scene && scene.isReady()) scene.setDesign(mission(), state.design);
      });
    }
  }

  function missionIndexFromId(id) {
    const i = D.missions.findIndex((m) => m.id === id);
    return i < 0 ? 0 : i;
  }

  /* ---------------------------------------------------------------- bridge
     Integration hook. Adds a way to start the launch from the merged site
     with a design that comes from the shared mission-selection stage. The
     launch sequence itself is untouched: this is startLaunch() without the
     design-review gate, because the merged workbench already ran one. */
  window.MA_BRIDGE = {
    onOrbit: null,
    start(payload) {
      if (!payload || !payload.design) return;
      const m = D.missions.find((x) => x.id === payload.mission) || mission();
      state.missionId = m.id;
      state.design = payload.design;
      state.crewSet = true;
      state.launching = true;
      state.finished = false;
      state.result = M.resultOf(m, clone(state.design));
      state.launchResult = state.result;
      lastPhase = "";

      document.body.classList.add("is-launching");
      $("#launchHud").hidden = false;
      $("#lhLog").innerHTML = "";
      $("#lhBar").style.width = "0%";
      $("#lhAlt").innerHTML = "0 <i>KM</i>";
      $("#lhVel").innerHTML = "0 <i>M/S</i>";
      $("#lhStage").textContent = "IGNITION";

      launchSound();

      if (scene && scene.isReady()) {
        scene.setDesign(m, state.design);
        scene.setComposition("launch");
        scene.launch(m, state.design, {
          fast: reduce,
          onTelemetry: onTelemetry,
          onPhase: onPhase,
          onComplete: finishLaunch,
        });
      } else {
        const seq = [
          ["IGNITION", 0, 0, 0],
          ["LIFTOFF", 0.1, 4, 120],
          ["MAX-Q", 0.34, 38, 1800],
          ["STAGE SEP", 0.5, 96, 3400],
          ["FAIRING DEPLOY", 0.66, 210, 5200],
          ["ORBIT INSERTION", 0.83, 550, 7600],
          ["MISSION COMPLETE", 1, 550, 7600],
        ];
        seq.forEach(([name, prog, alt, vel], i) => {
          window.setTimeout(() => {
            if (!state.launching) return;
            onTelemetry({ alt, vel, phase: name, progress: prog });
            onPhase(name, { progress: prog, t: prog * 7 });
            if (i === seq.length - 1) finishLaunch();
          }, i * 420);
        });
      }
    },
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
