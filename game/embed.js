/* ==========================================================================
   Integration adapter — Mission Control as the Brief step of the merged site.
   This file is additive: it does not change the game's own markup, styles or
   behaviour, it only selects a mission, trims the design tabs that the merged
   site replaces with its own workbench, and forwards messages to the host page.
   ========================================================================== */
(function () {
  "use strict";

  var params = new URLSearchParams(location.search);
  var mode = params.get("embed");
  if (!mode) return;

  var objective = params.get("objective") || "crops";

  function post(msg) {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(msg, "*");
    }
  }

  /* Handshake: the host may still be mounting when this frame becomes ready, so
     the ready notice repeats until the host acknowledges it. */
  var briefAcked = false;
  var briefTimer = 0;

  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data) return;
    if (data.type === "mc:brief-ack") {
      briefAcked = true;
      if (briefTimer) window.clearInterval(briefTimer);
      return;
    }
    if (data.type === "mc:select-objective" && typeof data.objective === "string") {
      selectObjective(data.objective);
    }
  });

  /* A party shares one mission: when another member picks it, the brief moves
     to the same option instead of drifting out of sync. */
  function selectObjective(id) {
    var button = document.querySelector('#tab-body [data-kind="objective"][data-id="' + id + '"]');
    if (!button) return;
    if (button.getAttribute("aria-pressed") === "true") return;
    button.click();
  }

  function whenReady(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  whenReady(function () {
    if (mode === "brief") brief();
    if (mode === "orbit") frameOrbit();
  });

  /* ------------------------------------------------------------ brief mode */

  /* The merged site flies three missions. Order and names come from the site,
     not from the game's wider catalogue. */
  var SITE = [
    { id: "polar", name: "POLAR WATCH" },
    { id: "ice", name: "LUNAR ICE" },
    { id: "dust", name: "MARS DUST" },
  ];

  /* The brief orbits the same hull the workbench builds and the flight flies.
     It is built from the shared design geometry, so the spacecraft is the same
     at every step instead of the standalone game's placeholder satellite. */
  var BRIEF_CRAFT = {
    structureMass: 120,
    solarDeploy: 1,
    batteryWh: 600,
    antennaGain: 12,
    storageGB: 64,
    computerHardened: false,
    adcsPrecision: true,
    propulsion: "chem",
    instruments: [
      { scienceTags: ["optical"], massKg: 38 },
      { scienceTags: ["spectral"], massKg: 24 },
    ],
  };

  /* The brief always shows the merged site's spacecraft. The game rebuilds its
     own craft whenever the mission changes, and that rebuild does not know
     about the shared design, so the design is injected into every rebuild. */
  function holdCraft() {
    var scene = window.Scene;
    if (!scene || typeof scene.setCraft !== "function") return;
    if (scene.setCraft.__spacexCraft) return;
    var original = scene.setCraft;
    var patched = function (spec) {
      if (!spec || !spec.design) {
        spec = Object.assign({}, spec || {}, { design: BRIEF_CRAFT });
      }
      return original.call(scene, spec);
    };
    patched.__spacexCraft = true;
    scene.setCraft = patched;
    original.call(scene, { design: BRIEF_CRAFT });
  }

  function brief() {
    var tries = 0;
    var timer = window.setInterval(function () {
      var card = document.querySelector('#mission-grid .mission-card[data-id="' + objective + '"]');
      if (!card) {
        if (++tries > 600) window.clearInterval(timer);
        return;
      }
      window.clearInterval(timer);
      card.click();          /* uses the game's own enterGame() path */
      window.setTimeout(attach, 60);
    }, 50);
  }

  function attach() {
    document.body.classList.add("mc-embed-brief");

    holdCraft();

    /* The brief's own wordmark is the way home: no extra chrome, just the text
       that was already in the top-left corner. */
    var brand = document.querySelector("#screen-game .topbar .brand");
    if (brand) {
      brand.classList.add("mc-home");
      brand.setAttribute("role", "button");
      brand.setAttribute("tabindex", "0");
      brand.setAttribute("title", "SpaceX — back to the start screen");
      brand.addEventListener("click", function () {
        post({ type: "mc:home" });
      });
      brand.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          post({ type: "mc:home" });
        }
      });
    }

    /* The design stage now belongs to the merged workbench, so the game's own
       design tabs are not part of the flow. BRIEF is the only tab. */
    var tabs = document.querySelectorAll("#tabs button");
    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i].getAttribute("data-id") !== "objective") {
        tabs[i].style.display = "none";
      }
    }

    /* Only the three site missions exist in this flow. The game's mission grid
       is behind the brief, but trim it too so a restart cannot reveal it. */
    var cards = document.querySelectorAll("#mission-grid .mission-card");
    for (var c = 0; c < cards.length; c++) {
      if (!isSite(cards[c].getAttribute("data-id"))) cards[c].remove();
    }

    var body = document.getElementById("tab-body");
    if (body) {
      decorate();
      new MutationObserver(decorate).observe(body, { childList: true });
    }

    /* The workbench owns flight readiness, so the brief's launch button must
       always be clickable: it is the "continue to design" control now. */
    var launch = document.getElementById("btn-launch");
    if (launch) {
      new MutationObserver(function () {
        if (launch.disabled) launch.disabled = false;
      }).observe(launch, { attributes: true, attributeFilter: ["disabled"] });
      launch.disabled = false;
    }

    /* Capture on the document runs before the game's own button handlers. */
    document.addEventListener("click", function (event) {
      var target = event.target;

      if (target.closest("#btn-launch")) {
        event.preventDefault();
        event.stopPropagation();
        post({ type: "mc:brief-continue", objective: current() });
        return;
      }

      if (target.closest("#btn-restart")) {
        event.preventDefault();
        event.stopPropagation();
        post({ type: "mc:home" });
        return;
      }

      var option = target.closest('[data-kind="objective"]');
      if (option) post({ type: "mc:objective", objective: option.getAttribute("data-id") });
    }, true);

    /* The brief panel sits on the right, so the live scene is framed inside the
       space the panel leaves. Below 640px the panel becomes a full-width sheet
       and the offset returns to centre. A resize event can arrive before the
       new layout is measurable, so the frame is taken twice after it settles. */
    scheduleFrame();
    window.addEventListener("resize", scheduleFrame);
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(scheduleFrame);
      var builder = document.getElementById("builder");
      if (builder) ro.observe(builder);
      ro.observe(document.documentElement);
    }

    announceBrief();
    briefTimer = window.setInterval(announceBrief, 400);
  }

  function scheduleFrame() {
    frameScene();
    window.setTimeout(frameScene, 120);
    window.setTimeout(frameScene, 420);
  }

  function announceBrief() {
    if (briefAcked) return;
    post({ type: "mc:brief-ready", objective: current() });
  }

  var frameTries = 0;

  /* Compose the scene around the brief panel: the whole orbit is framed inside
     the space the panel leaves on the right. Below 640px the panel becomes a
     full-width sheet, so the default centred view returns. */
  function frameScene() {
    var scene = window.Scene;
    var panel = document.getElementById("builder");
    if (!scene || !scene.setEmbedFocus || !panel) {
      if (++frameTries < 60) window.setTimeout(frameScene, 200);
      return;
    }
    frameTries = 0;
    /* Stacked layout: the panel becomes a sheet over the scene, so the scene is
       framed to the whole viewport and stays readable behind the glass. */
    var stacked = window.innerWidth <= 640;
    var left = stacked ? window.innerWidth : panel.getBoundingClientRect().left;
    if (left < 120) return;
    scene.setEmbedFocus({
      mode: "hero",
      fit: "orbit",
      band: { left: 0, top: 0, right: left, bottom: window.innerHeight },
    });
  }

  /* The orbit phase is a single centred shot: the craft sits in the middle of
     the frame with the whole planet behind it. */
  var orbitTries = 0;

  function frameOrbit() {
    var scene = window.Scene;
    if (!scene || !scene.setEmbedFocus || !window.MC_READY) {
      if (++orbitTries < 100) window.setTimeout(frameOrbit, 200);
      return;
    }
    orbitTries = 0;
    scene.setEmbedFocus({ mode: "orbit", fit: "body" });
  }

  function isSite(id) {
    for (var i = 0; i < SITE.length; i++) if (SITE[i].id === id) return true;
    return false;
  }

  /* Rebuild the mission list after every render: only the three site missions,
     in site order, under site names, with a single line of context. */
  function decorate() {
    var body = document.getElementById("tab-body");
    if (!body) return;

    var first = body.querySelector('[data-kind="objective"]');
    if (!first) return;

    var wrap = body.querySelector(".mc-missions");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "mc-missions";
      var hint = document.createElement("p");
      hint.className = "mc-brief-hint";
      hint.textContent = "Pick a mission. Its brief and selection carry straight into the design workbench.";
      wrap.appendChild(hint);
      first.parentNode.insertBefore(wrap, first);
    }

    for (var i = 0; i < SITE.length; i++) {
      var site = SITE[i];
      var btn = body.querySelector('[data-kind="objective"][data-id="' + site.id + '"]');
      if (!btn) continue;

      var name = btn.querySelector(".o-name");
      if (name && name.firstChild && name.firstChild.nodeType === 3) {
        name.firstChild.nodeValue = site.name;
      }
      btn.setAttribute("data-site", site.id);
      btn.classList.add("mc-site-option");
      if (btn.parentNode !== wrap) wrap.appendChild(btn);       /* moves it into site order */
    }

    var options = body.querySelectorAll('[data-kind="objective"]');
    for (var o = 0; o < options.length; o++) {
      if (!options[o].classList.contains("mc-site-option")) options[o].remove();
    }

    var launch = document.getElementById("btn-launch");
    if (launch) {
      var label = launch.querySelector("span");
      var sub = launch.querySelector("small");
      if (label) label.textContent = "Continue to design";
      if (sub) sub.textContent = "Brief ready";
      launch.disabled = false;
    }
  }

  function current() {
    var on = document.querySelector('#tab-body [data-kind="objective"][aria-pressed="true"]');
    return on ? on.getAttribute("data-id") : objective;
  }
})();
