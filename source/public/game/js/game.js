/* ==========================================================================
   MISSION CONTROL — game controller
   ========================================================================== */
(function () {
  "use strict";

  const D = window.DATA, SIM = window.SIM, S = window.Scene, A = window.Audio3;

  const el = id => document.getElementById(id);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const byId = (l, id) => l.find(x => x.id === id);
  const money = SIM.money;

  const TABS = [
    { id:"objective", label:"Brief" },
    { id:"craft",     label:"Craft" },
    { id:"payload",   label:"Payload" },
    { id:"orbit",     label:"Orbit" },
    { id:"systems",   label:"Systems" },
    { id:"team",      label:"Team" },
  ];

  const DEFAULT_STATE = {
    objective:"crops", bus:"3u", array:"a60", battery:"b50",
    instruments:["cam"], comms:"uhf", orbit:"sso", launcher:"small", years:3,
    gs:"nen", rec:"none", red:"single", prop:"chem",
  };

  const ROLES = ["Mission planner", "Systems engineer", "Science lead", "Comms"];

  let state = Object.assign({}, DEFAULT_STATE, { instruments:["cam"] });
  let difficulty = "engineer";
  let tab = "objective";
  let model = null;
  let missionCode = "";
  /* The merged site sends the exact workbench assembly; null means the game's
     own catalogue craft (title screen and the standalone demo). */
  let designCraft = null;
  let soundOn = true;
  let lastOrbit = null, lastCraftSig = null;
  let launching = false;
  let skipCinematic = false;
  let toastTimer = null;
  let previewSig = null;
  let gaugePrev = null;
  let projPrev = null;

  /* ---------------------------------------------------------------- boot */
  async function boot() {
    try { SIM.selfTest(); }
    catch (e) { console.error("[selftest]", e); }

    el("loader").classList.add("show");
    el("loader-bar").style.width = "6%";

    try {
      await S.preload(f => {
        const pct = Math.round(f * 100);
        el("loader-bar").style.width = Math.max(6, pct) + "%";
        el("loader-pct").textContent = pct + "%";
        if (pct > 55) el("loader-txt").textContent = "Building the spacecraft";
        if (pct > 90) el("loader-txt").textContent = "Spinning up mission control";
      });
    } catch (e) { console.warn("texture preload", e); }

    S.init(el("scene"));
    S.setTarget(state.orbit);
    S.setOffset(-1.6);
    syncCraft();

    renderMissionGrid();
    renderDifficulty();
    renderBoard();
    renderTabs();
    render();
    wire();

    missionCode = newCode();

    await sleep(260);
    el("loader").classList.remove("show");
    window.MC_READY = true;
  }

  function newCode() {
    const tag = byId(D.OBJ, state.objective).id.slice(0, 3).toUpperCase();
    return tag + "-" + (100 + Math.floor(Math.random() * 900));
  }

  function enterGame() {
    A.boot(); A.resume(); A.select();
    el("screen-title").classList.remove("show");
    el("screen-game").classList.add("show");
    tab = "objective";
    S.setOffset(0);
    fitScene();
    S.pulse(0.7);
    missionCode = newCode();
    renderTabs();
    render();
  }

  function toast(msg, kind) {
    const t = el("toast");
    t.textContent = msg;
    t.className = "toast show" + (kind ? " " + kind : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 3000);
  }

  /* ---------------------------------------------------------------- wire */
  function wire() {
    el("diff-list").addEventListener("click", e => {
      const b = e.target.closest("button");
      if (!b) return;
      difficulty = b.dataset.id;
      A.select();
      renderDifficulty();
      render();
    });

    el("btn-begin").addEventListener("click", () => {
      A.click();
      el("missions").scrollIntoView({ behavior: "smooth", block: "start" });
      const first = el("mission-grid").querySelector(".mission-card");
      if (first) first.focus({ preventScroll: true });
    });

    el("mission-grid").addEventListener("click", e => {
      const card = e.target.closest("[data-id]");
      if (!card) return;
      pick("objective", card.dataset.id);
      enterGame();
    });

    el("diff-chip").addEventListener("click", () => {
      const i = D.DIFFICULTY.findIndex(d => d.id === difficulty);
      difficulty = D.DIFFICULTY[(i + 1) % D.DIFFICULTY.length].id;
      A.select();
      render();
      toast("Difficulty: " + byId(D.DIFFICULTY, difficulty).name);
    });

    el("btn-sound").addEventListener("click", () => {
      soundOn = !A.toggle();
      el("btn-sound").classList.toggle("off", !soundOn);
    });

    el("btn-restart").addEventListener("click", () => {
      A.deny();
      state = Object.assign({}, DEFAULT_STATE, { instruments:["cam"] });
      tab = "objective";
      missionCode = newCode();
      renderTabs(); render(); syncScene(true);
      toast("Design cleared.");
    });

    el("tabs").addEventListener("click", e => {
      const b = e.target.closest("button");
      if (!b) return;
      tab = b.dataset.id;
      A.click();
      renderTabs();
      renderTabBody();
    });

    el("tab-body").addEventListener("click", e => {
      const b = e.target.closest("[data-kind]");
      if (!b) return;
      pick(b.dataset.kind, b.dataset.id);
    });

    // live 3D preview while hovering design options
    const VISUAL_KINDS = { bus:1, array:1, comms:1, instruments:1, prop:1 };
    el("tab-body").addEventListener("pointerover", e => {
      const b = e.target.closest("[data-kind]");
      if (!b || !VISUAL_KINDS[b.dataset.kind]) return;
      previewOption(b.dataset.kind, b.dataset.id);
    });
    el("tab-body").addEventListener("pointerleave", () => {
      if (previewSig !== null) syncCraft();
    });

    el("btn-rec").addEventListener("click", applyRecommend);

    el("btn-launch").addEventListener("click", () => {
      if (launching) return;
      if (model.blockers.length) { A.deny(); flashTicker(); return; }
      startLaunch();
    });

    el("screen-launch").addEventListener("click", () => { skipCinematic = true; });

    el("btn-again").addEventListener("click", () => {
      A.click();
      el("screen-report").classList.remove("show");
      el("screen-game").classList.add("show");
      missionCode = newCode();
      render();
    });

    el("btn-new").addEventListener("click", () => {
      A.click();
      el("screen-report").classList.remove("show");
      state = Object.assign({}, DEFAULT_STATE, { instruments:["cam"] });
      tab = "objective";
      missionCode = newCode();
      renderTabs(); render(); syncScene(true);
      el("screen-game").classList.add("show");
    });

    window.addEventListener("resize", fitScene);
  }

  /* --------------------------------------------------------------- picks */
  function pick(kind, id) {
    const before = model ? model.blockers.length : 0;

    if (kind === "instruments") {
      state.instruments = state.instruments.includes(id)
        ? state.instruments.filter(i => i !== id)
        : state.instruments.concat(id);
    } else if (kind === "years") {
      state.years = +id;
    } else if (kind === "objective") {
      state.objective = id;
      state.years = byId(D.OBJ, id).years;
      state.orbit = byId(D.OBJ, id).body === "moon" ? "lunar"
                  : byId(D.OBJ, id).body === "mars" ? "mars" : "sso";
      missionCode = newCode();
    } else if (kind === "bus")     state.bus = id;
    else if (kind === "array")     state.array = id;
    else if (kind === "battery")   state.battery = id;
    else if (kind === "comms")     state.comms = id;
    else if (kind === "orbit")     state.orbit = id;
    else if (kind === "launcher")  state.launcher = id;
    else if (kind === "gs")        state.gs = id;
    else if (kind === "rec")       state.rec = id;
    else if (kind === "red")       state.red = id;
    else if (kind === "prop")      state.prop = id;

    A.select();
    render();
    syncScene(true);

    const after = model.blockers.length;
    if (after > before) A.deny();
  }

  function applyRecommend() {
    const btn = el("btn-rec");
    btn.disabled = true;
    btn.classList.add("busy");
    btn.innerHTML = "<b>★</b> Computing…";

    // let the button repaint before the search blocks the thread
    setTimeout(() => {
      const rec = SIM.recommend(state.objective, difficulty);
      btn.disabled = false;
      btn.classList.remove("busy");
      btn.innerHTML = "<b>★</b> Recommended";

      if (!rec) {
        A.deny();
        toast("No design clears every gate here. Try Cadet difficulty.", "bad");
        return;
      }

      state = Object.assign({}, rec.config, { objective: state.objective });
      missionCode = newCode();
      A.select();
      renderTabs();
      render();
      syncScene(true);

      const b = el("builder");
      b.classList.remove("flash");
      void b.offsetWidth;
      b.classList.add("flash");

      S.pulse(0.9);
      toast(rec.clean
        ? `Auto-configured — projected ${rec.score}/100. Every check green.`
        : `Auto-configured — projected ${rec.score}/100. Some checks are still amber.`, rec.clean ? "ok" : "");
    }, 40);
  }

  function craftSpec(s) {
    const spec = {
      busSize: byId(D.BUS, s.bus).size,
      arrayW: byId(D.ARRAY, s.array).w,
      commsMbps: byId(D.COMMS, s.comms).mbps,
      instrumentCount: s.instruments.length,
      prop: s.prop,
    };
    if (designCraft) spec.design = designCraft;
    return spec;
  }

  function syncCraft() {
    previewSig = null;
    S.setCraft(craftSpec(state));
  }

  // keep the craft framed in whatever 3D area the current layout leaves free:
  // side builder -> pull the camera in; bottom-sheet builder -> lift it up
  function fitScene() {
    if (!el("screen-game").classList.contains("show")) return;
    const compact = innerWidth <= 900;
    S.setZoom(compact ? 0.92 : 0.68);
    S.setLift(compact ? 1.4 : 0);
  }

  // hovering an option previews it on the real craft, so the difference between
  // "what I have" and "what I could have" is visible before you commit.
  function previewOption(kind, id) {
    const s = kind === "instruments"
      ? Object.assign({}, state, {
          instruments: state.instruments.includes(id)
            ? state.instruments.filter(i => i !== id)
            : state.instruments.concat(id),
        })
      : Object.assign({}, state, { [kind]: id });
    const sig = [s.bus, s.array, s.comms, s.instruments.length, s.prop].join("|");
    if (sig === previewSig) return;
    previewSig = sig;
    S.setCraft(craftSpec(s));
  }

  function syncScene(force) {
    if (force || lastOrbit !== state.orbit) {
      S.setTarget(state.orbit);
      lastOrbit = state.orbit;
    }
    const sig = [state.bus, state.array, state.comms, state.instruments.length, state.prop].join("|");
    if (force || sig !== lastCraftSig) {
      syncCraft();
      lastCraftSig = sig;
    }
  }

  /* -------------------------------------------------------------- render */
  function render() {
    model = SIM.evaluate(state, difficulty, []);

    el("obj-name").textContent = model.o.name;
    el("obj-tagline").textContent = model.o.tagline;
    el("diff-chip").textContent = byId(D.DIFFICULTY, difficulty).name;

    renderGauges();
    renderReqs();
    renderRoles();
    renderTicker();
    renderTabBody();
    renderLaunchBtn();
    renderProjection();
  }

  function renderProjection() {
    const p = el("proj");
    el("proj-score").textContent = model.score;
    el("proj-grade").textContent = model.grade;
    p.className = "proj g" + model.grade;
    if (projPrev !== null && projPrev !== model.score) {
      void p.offsetWidth;
      p.classList.add("bump");
    }
    projPrev = model.score;
  }

  function barClass(ratio, invert) {
    if (invert) return ratio >= 1 ? "bad" : ratio >= 0.85 ? "warn" : "ok";
    return ratio > 1 ? "bad" : ratio > 0.9 ? "warn" : "ok";
  }

  function gauge(label, value, ratio, cls, note, noteCls, delta) {
    const w = Math.max(2, Math.min(100, ratio * 100));
    return `<div class="gauge${delta ? " delta-" + delta : ""}">
      <div class="gauge-row"><span>${label}</span><b>${value}</b></div>
      <div class="bar"><i class="${cls}" style="width:${w}%"></i></div>
      ${note ? `<div class="gauge-note ${noteCls || ""}">${note}</div>` : ""}
    </div>`;
  }

  function renderGauges() {
    const m = model;
    const massR = m.wet / m.cap;
    const powR  = m.load / Math.max(1, m.arrayAvg);
    const budR  = m.cost / m.budget;
    const radR  = m.dose / Math.max(1, m.bus.shield);

    // flash the gauge that just got better or worse, so a click always lands
    const cur = [m.wet, m.load, m.cost, m.delivery, m.dose];
    const eps = [0.5, 1, 0.05, 0.001, 0.5];
    const delta = i => {
      if (!gaugePrev) return "";
      const d = cur[i] - gaugePrev[i];
      if (Math.abs(d) < eps[i]) return "";
      return (i === 3 ? d > 0 : d < 0) ? "good" : "bad";
    };
    const d = [delta(0), delta(1), delta(2), delta(3), delta(4)];
    gaugePrev = cur;

    el("gauges").innerHTML =
      gauge("Mass", `${m.wet.toFixed(0)} / ${m.cap.toFixed(0)} kg`, massR,
        barClass(massR), massR > 1 ? `${(m.wet - m.cap).toFixed(0)} kg over capacity` : `${(m.cap - m.wet).toFixed(0)} kg spare`,
        massR > 1 ? "bad" : "", d[0]) +
      gauge("Power", `${m.load} W / ${m.arrayAvg.toFixed(0)} W`, powR,
        barClass(powR, true), powR > 1 ? "Deficit — instruments brown out" : `${m.powerMargin.toFixed(0)} W spare`,
        powR > 1 ? "bad" : "", d[1]) +
      gauge("Budget", `${money(m.cost)} / ${money(m.budget)}`, budR,
        barClass(budR), budR > 1 ? `Over by ${money(m.cost - m.budget)}` : `${money(m.budget - m.cost)} left`,
        budR > 1 ? "bad" : "", d[2]) +
      gauge("Data return", `${Math.round(m.delivery * 100)}%`, m.delivery,
        m.delivery < 0.5 ? "bad" : m.delivery < 0.95 ? "warn" : "ok",
        m.delivery < 0.95
          ? `${m.gen.toFixed(0)} Gb/d generated, ${m.down.toFixed(1)} downlinked${m.rec.id === "none" ? " · no recorder" : ""}`
          : "All data reaches the ground",
        m.delivery < 0.95 ? "warn" : "ok", d[3]) +
      gauge("Radiation", `${m.dose.toFixed(0)} krad`, radR,
        barClass(radR), radR > 1 ? `Shield rated ${m.bus.shield} krad` : `${(m.bus.shield - m.dose).toFixed(0)} krad margin`,
        radR > 1 ? "bad" : "", d[4]);
  }

  function renderReqs() {
    el("reqs").innerHTML = model.requirements.map(r =>
      `<li class="${r.ok ? "ok" : ""}"><span class="tick">${r.ok ? "✓" : ""}</span><span>${r.label}</span></li>`
    ).join("");
  }

  function renderRoles() {
    el("roles").innerHTML = ROLES.map(r => {
      const cs = model.checks.filter(c => c.role === r);
      const ok = cs.every(c => c.ok);
      return `<div class="role ${ok ? "ok" : ""}"><i class="dot ${ok ? "ok" : "bad"}"></i>${r}</div>`;
    }).join("");
  }

  function renderTicker() {
    const t = el("warn-ticker");
    if (model.blockers.length) {
      const b = model.blockers[0];
      t.innerHTML = `<span class="bad">■ ${b.label}:</span> ${b.why}`;
    } else if (model.warnings.length) {
      const w = model.warnings[0];
      t.innerHTML = `<span class="warn">▲ ${w.label}:</span> ${w.why}`;
    } else {
      t.innerHTML = `<span class="ok">● All checks pass.</span> ${model.o.brief}`;
    }
  }

  function flashTicker() {
    const t = el("warn-ticker");
    t.animate(
      [{ transform:"translateX(0)" }, { transform:"translateX(-6px)" },
       { transform:"translateX(6px)" }, { transform:"translateX(0)" }],
      { duration:260, easing:"ease-in-out" }
    );
  }

  function renderLaunchBtn() {
    const b = el("btn-launch");
    const blocked = model.blockers.length > 0;
    const warnings = model.warnings.length;
    b.classList.toggle("blocked", blocked);
    b.classList.toggle("caution", !blocked && warnings > 0);
    el("launch-sub").textContent = blocked
      ? model.blockers.length + " blocking issue" + (model.blockers.length > 1 ? "s" : "")
      : warnings
        ? warnings + " risk" + (warnings > 1 ? "s" : "") + " — can still fly"
        : "All checks pass";
  }

  /* --------------------------------------------------------------- tabs */
  function renderTabs() {
    el("tabs").innerHTML = TABS.map(t =>
      `<button data-id="${t.id}" aria-selected="${t.id === tab}">${t.label}</button>`
    ).join("");
  }

  function opt(kind, item, selected, title, meta, note) {
    return `<button class="opt" data-kind="${kind}" data-id="${item.id}" aria-pressed="${selected}">
      <div class="o-name">${title}${meta ? `<em>${meta}</em>` : ""}</div>
      ${note ? `<div class="o-note">${note}</div>` : ""}
    </button>`;
  }

  function renderTabBody() {
    const m = model;
    const box = el("tab-body");
    let html = "";

    if (tab === "objective") {
      html += `<p class="tab-intro">Pick what the mission is for. Every objective forces a different
        combination of payload, orbit and budget.</p>`;
      html += D.OBJ.map(o => {
        return `<button class="opt" data-kind="objective" data-id="${o.id}" aria-pressed="${o.id === state.objective}">
          <div class="o-name">${o.name}<em>${money(o.budget)}</em></div>
          <div class="o-meta">${o.years} yr · ${o.minSci} science pts · ${D.BODY[o.body].name} · needs ${o.need.join(" + ")}</div>
          <div class="o-note">${o.tagline}</div>
        </button>`;
      }).join("");
      html += `<div class="sec-label">Mission brief</div>
        <p class="tab-intro" style="color:var(--dim)">${m.o.brief}</p>`;

    } else if (tab === "craft") {
      html += `<p class="tab-intro">The bus carries everything else. Bigger buses survive radiation
        and carry more payload, and cost three times as much.</p>`;
      html += `<div class="sec-label">Spacecraft bus</div>`;
      html += D.BUS.map(b => opt("bus", b, b.id === state.bus, b.name,
        `${b.mass} kg`, `$${b.cost.toFixed(1)}M · ${b.house} W housekeeping · ${b.shield} krad shield`)).join("");
      html += `<div class="sec-label">Solar array</div>`;
      html += D.ARRAY.map(a => opt("array", a, a.id === state.array, a.name,
        `${a.w} W`, `${a.mass} kg · $${a.cost.toFixed(1)}M`)).join("");
      html += `<div class="sec-label">Battery</div>`;
      html += D.BATTERY.map(b => opt("battery", b, b.id === state.battery, b.name,
        `${b.wh} Wh`, `${b.mass} kg · $${b.cost.toFixed(1)}M`)).join("");
      html += `<div class="sec-label">Communications</div>`;
      html += D.COMMS.map(c => opt("comms", c, c.id === state.comms, c.name,
        `${c.mbps} Mb/s`, `${c.w} W · ${c.mass} kg · $${c.cost.toFixed(1)}M · ${c.note}`)).join("");

    } else if (tab === "payload") {
      html += `<p class="tab-intro">Instruments buy science, and they cost mass, power, money and
        data volume. More payload is not free.</p>`;
      html += D.INSTR.map(i => {
        const on = state.instruments.includes(i.id);
        const needed = m.o.need.includes(i.tag);
        return `<button class="opt" data-kind="instruments" data-id="${i.id}" aria-pressed="${on}">
          <div class="o-name">${i.name}${needed ? " ★" : ""}<em>${i.sci} sci</em></div>
          <div class="o-meta">${i.mass} kg · ${i.w} W · ${i.data} Gb/d · $${i.cost}M</div>
          <div class="o-note">${i.note}</div>
        </button>`;
      }).join("");
      html += `<p class="tab-intro" style="margin-top:12px">★ required by this objective</p>`;

    } else if (tab === "orbit") {
      html += `<p class="tab-intro">Orbit decides sunlight, contact time, drag and radiation — all at
        once. There is no orbit that is good at everything.</p>`;
      html += `<div class="sec-label">Orbit</div>`;
      html += D.ORBIT.map(o => {
        const wrongBody = o.body !== m.o.body;
        return `<button class="opt ${wrongBody ? "danger" : ""}" data-kind="orbit" data-id="${o.id}" aria-pressed="${o.id === state.orbit}">
          <div class="o-name">${o.name}<em>${Math.round(o.contact * 100)}% contact</em></div>
          <div class="o-meta">${D.BODY[o.body].name} · ${Math.round(o.eclipse * 100)}% eclipse · ${o.rad} krad/yr</div>
          <div class="o-note">${o.note}</div>
        </button>`;
      }).join("");

      html += `<div class="sec-label">Launch vehicle</div>`;
      html += D.LV.map(l => {
        const cap = l.leo / byId(D.ORBIT, state.orbit).launch;
        return opt("launcher", l, l.id === state.launcher, l.name,
          `${cap.toFixed(0)} kg here`, `$${l.cost}M · ${l.note}`);
      }).join("");

      html += `<div class="sec-label">Mission lifetime</div>
        <div class="years">` +
        [1,2,3,4,5,6,7,8].map(y =>
          `<button data-kind="years" data-id="${y}" aria-pressed="${y === state.years}">${y}y</button>`
        ).join("") + `</div>
        <p class="tab-intro" style="margin-top:10px">Longer life means more science, but more
        propellant, more operations cost and more radiation dose.</p>`;

    } else if (tab === "systems") {
      html += `<p class="tab-intro">The unglamorous half of a real mission: how you talk to the ground,
        what you do with data you cannot send yet, and how you survive a failure.</p>`;

      html += `<div class="sec-label">Ground station network</div>`;
      html += D.GROUND.map(g => opt("gs", g, g.id === state.gs, g.name,
        `${Math.round(byId(D.ORBIT, state.orbit).contact * g.mul * 100)}% contact`,
        `$${g.cost.toFixed(1)}M · ${g.note}`)).join("");

      html += `<div class="sec-label">Onboard data recorder</div>`;
      html += D.RECORDER.map(r => opt("rec", r, r.id === state.rec, r.name,
        r.id === "none" ? "stream only" : "buffer",
        r.id === "none"
          ? `No mass, no cost. ${r.note}`
          : `${r.mass} kg · $${r.cost.toFixed(1)}M · ${r.note}`)).join("");

      html += `<div class="sec-label">Redundancy</div>`;
      html += D.REDUNDANCY.map(r => opt("red", r, r.id === state.red, r.name,
        r.mitigate ? `−${Math.round(r.mitigate * 100)}% event damage` : "no mitigation",
        `${r.mass} kg · hardware ×${r.mul.toFixed(2)} · ${r.note}`)).join("");

      html += `<div class="sec-label">Propulsion</div>`;
      html += D.PROPULSION.map(p => opt("prop", p, p.id === state.prop, p.name,
        p.id === "ep" ? "−65% propellant" : "baseline",
        `${p.power ? p.power + " W · " : ""}${p.cost ? "$" + p.cost + "M · " : ""}${p.note}`)).join("");

      html += `<div class="sec-label">Systems readout</div>
        <div class="sys-read">
          <div><span>Dry mass</span><b>${m.dry.toFixed(0)} kg</b></div>
          <div><span>Propellant</span><b>${m.propellant.toFixed(1)} kg</b></div>
          <div><span>Array average</span><b>${m.arrayAvg.toFixed(0)} W</b></div>
          <div><span>Housekeeping</span><b>${m.bus.house} W</b></div>
          <div><span>Downlink</span><b>${m.down.toFixed(1)} Gb/d</b></div>
          <div><span>Contact</span><b>${Math.round(m.contact * 100)}%</b></div>
          <div><span>Dose</span><b>${m.dose.toFixed(0)} krad</b></div>
          <div><span>Battery need</span><b>${m.batNeed.toFixed(0)} Wh</b></div>
        </div>`;

    } else {
      html += `<p class="tab-intro">Four roles, one spacecraft. Each role owns a different budget, and
        each can block the launch.</p>`;
      html += `<div class="sec-label">Role status</div>`;
      html += ROLES.map(r => {
        const cs = m.checks.filter(c => c.role === r);
        const bad = cs.filter(c => !c.ok);
        return `<div class="opt" style="cursor:default">
          <div class="o-name">${r}<em style="color:${bad.length ? "var(--bad)" : "var(--ok)"}">${bad.length ? "BLOCKING" : "CLEAR"}</em></div>
          <div class="o-note">${bad.length ? bad[0].why : cs.map(c => c.label).join(" · ")}</div>
        </div>`;
      }).join("");
      html += `<div class="team-note">
        <b>Team mode.</b> In a room, give each player one of these four roles. They own that budget and
        they sign off before launch. The mission only flies when all four are green — which is exactly
        how a real design review works.</div>`;
    }

    box.innerHTML = html;
    box.scrollTop = 0;
  }

  /* ------------------------------------------------------------ title UI */
  function orbitMark(body) {
    return `<svg class="orbit-mark" viewBox="0 0 200 120" aria-hidden="true">
      <ellipse class="om-ring" cx="100" cy="62" rx="80" ry="30" transform="rotate(-14 100 62)"/>
      <ellipse class="om-ring om-ring--inner" cx="100" cy="62" rx="52" ry="19" transform="rotate(20 100 62)"/>
      <circle class="om-body om-${body}" cx="100" cy="62" r="20"/>
      <circle class="om-shine" cx="93" cy="55" r="6.5"/>
      <circle class="om-sat" cx="179" cy="52" r="2.8"/>
      <circle class="om-sat om-sat--alt" cx="50" cy="74" r="2"/>
      <path class="om-tick" d="M94 40h12M100 34v12"/>
    </svg>`;
  }

  function missionCard(o, i) {
    return `<button class="mission-card" data-id="${o.id}">
      <div class="mission-card__top">
        <span class="mission-card__index">M${String(i + 1).padStart(2, "0")}</span>
        <span class="mission-card__body">${D.BODY[o.body].name}</span>
      </div>
      ${orbitMark(o.body)}
      <h3>${o.name}</h3>
      <p class="mission-card__story">${o.tagline}</p>
      <dl class="mission-card__meta">
        <div><dt>Budget</dt><dd>${money(o.budget)}</dd></div>
        <div><dt>Lifetime</dt><dd>${o.years} yr</dd></div>
        <div><dt>Science</dt><dd>${o.minSci} pts</dd></div>
      </dl>
      <span class="mission-card__cta">Open brief <i>→</i></span>
    </button>`;
  }

  function renderMissionGrid() {
    el("mission-grid").innerHTML = D.OBJ.map(missionCard).join("");
  }

  function renderDifficulty() {
    el("diff-list").innerHTML = D.DIFFICULTY.map(d =>
      `<button data-id="${d.id}" aria-pressed="${d.id === difficulty}">
        <b>${d.name}</b><small>${d.note}</small>
      </button>`
    ).join("");
  }

  function boardData() {
    try { return JSON.parse(localStorage.getItem("mc_board") || "[]"); }
    catch (e) { return []; }
  }

  function saveBoard(entry) {
    try {
      const list = boardData();
      list.push(entry);
      list.sort((a, b) => b.score - a.score);
      localStorage.setItem("mc_board", JSON.stringify(list.slice(0, 8)));
      return list.findIndex(e => e === entry) + 1;
    } catch (e) { return 0; }
  }

  function renderBoard() {
    const list = boardData().slice(0, 5);
    el("board-list").innerHTML = list.length
      ? list.map((e, i) => `<li><b>${i + 1}</b><span>${e.code}</span><b>${e.score}</b></li>`).join("")
      : `<li class="empty">No missions flown yet.</li>`;
  }

  /* -------------------------------------------------------------- launch */
  async function startLaunch() {
    launching = true;
    skipCinematic = false;
    el("btn-launch").disabled = true;
    el("btn-rec").disabled = true;

    const diff = byId(D.DIFFICULTY, difficulty);
    const events = SIM.rollEvents(diff.events);
    const result = SIM.evaluate(state, difficulty, events);

    S.startLaunch();
    A.launch();

    const screen = el("screen-launch");
    const log = el("launch-log");
    const bar = el("launch-bar");
    const count = el("launch-count");
    log.innerHTML = "";
    bar.style.transition = "none";
    bar.style.width = "0%";

    screen.classList.add("show");
    screen.classList.remove("ops-mode");
    el("launch-hud").classList.remove("hidden");
    el("ops-hud").classList.remove("show");

    const setCount = txt => {
      count.textContent = txt;
      count.style.animation = "none";
      void count.offsetWidth;
      count.style.animation = "";
    };
    const addLine = (tag, txt, cls) => {
      const d = document.createElement("div");
      if (cls) d.className = cls;
      d.innerHTML = `<b>${tag}</b><span>${txt}</span>`;
      log.appendChild(d);
      A.tick();
    };

    const beats = [
      ["T+00", "Ignition. Vehicle has cleared the tower."],
      ["T+01", "Max-Q. Peak aerodynamic pressure."],
      ["T+02", "Stage separation. Fairing jettison."],
      ["T+03", "Orbit insertion. Spacecraft is on its own."],
      ["T+04", "Solar arrays deployed. Systems nominal."],
    ];

    for (const c of ["3", "2", "1"]) {
      if (skipCinematic) break;
      setCount(c); A.tick();
      await sleep(560);
    }
    if (!skipCinematic) {
      setCount("LIFTOFF");
      bar.style.transition = "width .4s";
      bar.style.width = "8%";
      await sleep(520);
    }

    for (let i = 0; i < beats.length; i++) {
      if (skipCinematic) break;
      addLine(beats[i][0], beats[i][1]);
      bar.style.transition = "width .5s";
      bar.style.width = (12 + (i + 1) * (54 / beats.length)) + "%";
      await sleep(420);
    }

    for (const ev of events) {
      if (skipCinematic) break;
      addLine("EVENT", `${ev.name} — ${ev.text}`, "ok");
      await sleep(520);
    }

    // ---- mission operations: the spacecraft actually does the work
    if (!skipCinematic) {
      bar.style.width = "100%";
      setCount("ON ORBIT");
      await sleep(420);
      screen.classList.add("ops-mode");
      el("launch-hud").classList.add("hidden");
      el("ops-hud").classList.add("show");
      S.startOps();
      await runOps(result);
      S.stopOps();
    }

    screen.classList.remove("show", "ops-mode");
    el("launch-hud").classList.remove("hidden");
    el("ops-hud").classList.remove("show");
    S.stopLaunch();
    el("btn-launch").disabled = false;
    el("btn-rec").disabled = false;
    launching = false;

    showReport(result);
  }

  /* ----------------------------------------------------------- ops phase */
  const ALT_KM = {
    sso: 550, polar: 800, meo: 20200, geo: 35786, lunar: 100, mars: 400,
    h_leo: 550, h_sso: 700, h_geo: 35786,
    h_polar: 100, h_frozen: 300, h_halo: 384400,
    h_low: 400, h_msso: 800, h_areo: 17000,
  };
  const VEL_KMS = {
    sso: 7.59, polar: 7.45, meo: 3.07, geo: 3.07, lunar: 1.63, mars: 3.36,
    h_leo: 7.59, h_sso: 7.51, h_geo: 3.07,
    h_polar: 1.63, h_frozen: 1.63, h_halo: 1.02,
    h_low: 3.36, h_msso: 3.36, h_areo: 1.45,
  };

  async function runOps(m) {
    const clockEl = el("ops-clock");
    const readouts = el("ops-readouts");
    const log = el("ops-log");
    log.innerHTML = "";

    const alt = ALT_KM[m.orb.id] || 500;
    const vel = VEL_KMS[m.orb.id] || 7.5;

    readouts.innerHTML = `
      <div class="ro"><span>ALT</span><b id="ro-alt">${alt} km</b></div>
      <div class="ro"><span>VEL</span><b id="ro-vel">${vel.toFixed(2)} km/s</b></div>
      <div class="ro"><span>PWR</span><b id="ro-pwr">${Math.round(m.arrayAvg - m.load)} W</b></div>
      <div class="ro"><span>DATA</span><b id="ro-data">${m.gen.toFixed(1)} Gb/d</b></div>
      <div class="ro"><span>LINK</span><b id="ro-link">${m.com.mbps} Mb/s</b></div>
    `;

    const lines = [
      ["T+04", "Spacecraft separation confirmed. Arrays deployed, attitude captured."],
      ["T+11", `${m.ins.length} instrument${m.ins.length === 1 ? "" : "s"} powered. Starting calibration.`],
      ["T+23", `Scanning target swath at ${alt.toLocaleString()} km.`],
      ["T+38", m.rec.id === "none"
        ? "No recorder: data can only leave while the ground is in view."
        : `${m.rec.name} capturing. Buffer holding science data.`],
      ["T+52", `Downlink pass through ${m.gs.name}. Lock acquired.`],
      ["T+66", `Link budget closes at ${m.com.mbps} Mb/s — ${Math.round(m.delivery * 100)}% of data gets home.`],
      ["T+79", "Eclipse entry. On battery, instruments in low-power hold."],
      ["T+88", "Eclipse exit. Arrays restored, battery recharging."],
      ["T+104", "Survey complete. Archive closed, spacecraft safed."],
    ];

    const t0 = performance.now();
    const TOTAL = 8800;
    let nextLine = 0;
    let lastLog = 0;

    while (!skipCinematic) {
      const ms = performance.now() - t0;
      if (ms >= TOTAL) break;
      const s = ms / 1000;

      const mm = String(Math.floor(s / 60)).padStart(2, "0");
      const ss = String(Math.floor(s % 60)).padStart(2, "0");
      clockEl.textContent = `T+${mm}:${ss}`;

      const j = () => (Math.random() - 0.5);
      const pwr = m.arrayAvg - m.load + j() * 8;
      el("ro-alt").textContent = Math.round(alt + j() * 3).toLocaleString() + " km";
      el("ro-vel").textContent = (vel + j() * 0.02).toFixed(2) + " km/s";
      el("ro-pwr").textContent = Math.round(pwr) + " W";
      el("ro-data").textContent = (m.gen * (0.92 + Math.random() * 0.12)).toFixed(1) + " Gb/d";
      el("ro-link").textContent = m.com.mbps + " Mb/s";

      if (nextLine < lines.length && ms >= lastLog) {
        const d = document.createElement("div");
        d.innerHTML = `<b>${lines[nextLine][0]}</b><span>${lines[nextLine][1]}</span>`;
        log.appendChild(d);
        while (log.children.length > 5) log.removeChild(log.firstChild);
        A.tick();
        nextLine++;
        lastLog += 980;
      }

      await sleep(90);
    }
    clockEl.textContent = "T+02:00";
  }

  /* -------------------------------------------------------------- report */
  function showReport(m) {
    el("screen-game").classList.remove("show");
    const rep = el("screen-report");
    rep.classList.add("show");

    const status = el("rep-status");
    status.className = "rep-status " + (m.success ? "win" : "lose");
    status.textContent = m.success ? "Mission success" : "Mission failure";

    el("rep-stars").innerHTML = [1,2,3,4,5].map(i =>
      `<i class="${i <= m.stars ? "on" : ""}" style="transition-delay:${300 + i * 90}ms">★</i>`
    ).join("");

    countUp(el("rep-score"), m.score, 900, 250);

    const parts = m.success
      ? [
          ["Science", 60 * Math.min(1, m.delivered / m.o.minSci), 60],
          ["Budget", 20 * Math.max(0, 1 - m.cost / m.budget), 20],
          ["Mass margin", 10 * Math.max(0, 1 - m.wet / m.cap), 10],
          ["Data return", 10 * m.delivery, 10],
        ]
      : [["Science", 30 * Math.min(1, m.delivered / m.o.minSci), 30]];

    el("rep-bars").innerHTML = parts.map(([label, val, max]) =>
      `<div class="rb"><span>${label}</span>
        <div class="bar"><i class="${val / max > .6 ? "ok" : val / max > .3 ? "warn" : "bad"}"
          style="width:${Math.round(val / max * 100)}%"></i></div>
        <b>${val.toFixed(0)}/${max}</b></div>`
    ).join("");

    // why
    const rows = [];
    if (m.success) {
      rows.push(["ok", "✓", `<b>Objective met.</b> ${m.delivered.toFixed(0)} science points delivered against a target of ${m.o.minSci}.`]);
    } else {
      m.blockers.forEach(c => rows.push(["bad", "✕", `<b>${c.label}.</b> ${c.why} <em>${c.role} owns this.</em>`]));
      if (!m.blockers.length) {
        const sr = m.checks.find(c => c.label === "Science return");
        rows.push(["bad", "✕", `<b>Science return.</b> ${sr.why}`]);
      }
    }
    if (m.delivery < 0.95) rows.push(["warn", "!", `<b>Data is the bottleneck.</b> ${m.checks.find(c => c.label === "Data downlink").why} Instruments generate faster than you can talk to Earth.`]);
    if (m.lifeFactor < 1) rows.push(["warn", "!", `<b>Radiation shortened the mission.</b> ${m.dose.toFixed(0)} krad against ${m.bus.shield} krad of shielding. Higher orbits escape drag but pay in dose.`]);
    if (state.years < m.o.years) rows.push(["warn", "!", `<b>Not enough time.</b> A ${m.o.years}-year survey flown for ${state.years} year${state.years > 1 ? "s" : ""} collects only ${Math.round(m.timeFactor * 100)}% of the science.`]);
    if (m.success && m.wet <= m.cap && m.cost <= m.budget)
      rows.push(["ok", "✓", `<b>Reserves held.</b> ${(m.cap - m.wet).toFixed(0)} kg of launch margin and ${money(m.budget - m.cost)} unspent.`]);

    el("rep-why").innerHTML = rows.map(([k, ic, txt], i) =>
      `<li style="animation-delay:${120 + i * 70}ms"><span class="ic ${k}">${ic}</span><span>${txt}</span></li>`
    ).join("");

    const baseline = SIM.evaluate(state, difficulty, []);
    const delta = m.score - baseline.score;
    el("rep-events").innerHTML = m.events.length
      ? `<div class="ev-head">${delta < 0
            ? `Random events cost you <b>${-delta} point${delta === -1 ? "" : "s"}</b>.`
            : `Random events hit you — your margins absorbed them.`}</div>` +
        m.events.map((e, i) =>
          `<div class="ev" style="animation-delay:${200 + i * 80}ms"><b>${e.icon} ${e.name}</b> — ${e.text}</div>`
        ).join("")
      : "";

    const rank = saveBoard({ code: missionCode, score: m.score, objective: m.o.id, difficulty, at: Date.now() });
    renderBoard();
    el("rep-grade").parentElement.innerHTML =
      `GRADE <b id="rep-grade">${m.grade}</b>` +
      (rank > 0 ? `<span class="rank">RANK #${rank}</span>` : "");
    el("rep-meta").textContent =
      `${missionCode} · ${m.o.name} · ${byId(D.DIFFICULTY, difficulty).name} · ${m.rec.name} · ${m.gs.name}`;

    if (m.success) A.success(); else A.fail();
  }

  function countUp(node, target, dur, delay) {
    node.textContent = "0";
    setTimeout(() => { node.textContent = target; }, (delay || 0) + dur + 120);
    setTimeout(() => {
      const t0 = performance.now();
      const step = now => {
        const p = Math.min(1, (now - t0) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        node.textContent = Math.round(target * eased);
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, delay || 0);
  }

  /* ---------------------------------------------------------------- bridge
     Integration hook. Mission Architect's launch sequence ends in orbit; the
     merged site prepares this scene while the rocket is still climbing, then
     starts operations at the exact beat the ascent reaches orbit. Splitting the
     two lets the host crossfade between the frames instead of cutting to a
     loading screen. The orbit-to-end code below is the game's own: startOps,
     runOps, showReport. */
  window.MC_READY = false;

  function prepareOps(payload) {
    if (!payload || !payload.state) return false;
    state = Object.assign({}, DEFAULT_STATE, payload.state);
    state.instruments = (payload.state.instruments || ["h_cam"]).slice();
    designCraft = payload.craft || null;
    if (payload.difficulty) difficulty = payload.difficulty;
    missionCode = newCode();

    el("screen-title").classList.remove("show");
    el("screen-game").classList.remove("show");
    el("screen-report").classList.remove("show");
    syncCraft();
    S.setTarget(state.orbit);

    const screen = el("screen-launch");
    el("launch-log").innerHTML = "";
    el("launch-hud").classList.add("hidden");
    el("ops-hud").classList.add("show");
    screen.classList.add("show", "ops-mode");

    /* Park the orbit scene in a wide arrival shot. The host releases the camera
       when the crossfade starts, so it settles into the chase view rather than
       snapping there while the frame is still hidden. */
    S.startOps();
    S.setArrival(1, true);
    return true;
  }

  window.MC_ORBIT_PREPARE = function (payload) {
    if (!prepareOps(payload)) return false;
    if (window.parent !== window) {
      window.parent.postMessage({ type: "mc:orbit-prepared" }, "*");
    }
    return true;
  };

  window.MC_ORBIT_GO = async function () {
    skipCinematic = false;
    A.resume();
    S.releaseArrival();

    const diff = byId(D.DIFFICULTY, difficulty);
    const events = SIM.rollEvents(diff.events);
    const result = SIM.evaluate(state, difficulty, events);

    if (window.parent !== window) {
      window.parent.postMessage({ type: "mc:orbit-entered" }, "*");
    }

    await runOps(result);
    S.stopOps();
    el("screen-launch").classList.remove("show", "ops-mode");
    el("ops-hud").classList.remove("show");
    showReport(result);
  };

  /* Compatibility path: prepare and run in one call. */
  window.MC_ORBIT = function (payload) {
    if (!prepareOps(payload)) return Promise.resolve();
    return window.MC_ORBIT_GO();
  };

  /* ---------------------------------------------------------------- init */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
