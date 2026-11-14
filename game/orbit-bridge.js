/* ==========================================================================
   Integration adapter — Mission Control's orbit-to-end phase, entered from the
   host page once Mission Architect's ascent reaches orbit.

   The scene is prepared while the rocket is still climbing, then released on
   the host's cue so the two frames can crossfade. The flight configuration is
   used exactly as the workbench sent it: the player's launcher choice is part
   of the design, so nothing is re-fitted here.
   ========================================================================== */
(function () {
  "use strict";

  var params = new URLSearchParams(location.search);
  if (params.get("embed") !== "orbit") return;

  function post(message) {
    if (window.parent && window.parent !== window) window.parent.postMessage(message, "*");
  }

  var sent = false;
  var tries = 0;
  /* Repeat the ready notice: the host may still be mounting its listener. */
  var timer = window.setInterval(function () {
    if (sent || !window.MC_READY) return;
    if (++tries > 200) { window.clearInterval(timer); return; }
    post({ type: "mc:orbit-ready" });
  }, 300);

  var prepared = false;
  var seed = 0;

  function settle() {
    sent = true;
    window.clearInterval(timer);
  }

  /* A party flies one mission, so the random events must be the same in every
     tab: the room code seeds them and every member reads the same report. */
  function mulberry32(value) {
    var a = value >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seedEvents(value) {
    var data = window.DATA;
    if (!value || !data || !data.EVENTS || !window.SIM || window.SIM.__spacexSeeded) return;
    var random = mulberry32(value);
    window.SIM.rollEvents = function (n) {
      var pool = data.EVENTS.map(function (event) {
        return event.id;
      });
      var out = [];
      while (out.length < n && pool.length) {
        out.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
      }
      return out;
    };
    window.SIM.__spacexSeeded = true;
  }

  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data) return;

    if (data.type === "mc:orbit-prepare" && window.MC_ORBIT_PREPARE) {
      settle();
      seed = data.payload && typeof data.payload.seed === "number" ? data.payload.seed : 0;
      prepared = window.MC_ORBIT_PREPARE(data.payload) !== false;
      return;
    }

    if (data.type === "mc:orbit-go") {
      settle();
      seedEvents(seed);
      if (prepared && window.MC_ORBIT_GO) {
        window.MC_ORBIT_GO();
      } else if (window.MC_ORBIT && data.payload) {
        /* Safety path: the scene never finished preparing. Run it directly so
           the launch still ends in orbit instead of on an empty frame. */
        window.MC_ORBIT(data.payload);
      }
    }
  });

  /* The report is the end of the journey: hand the two actions back to the host. */
  document.addEventListener(
    "click",
    function (event) {
      var target = event.target;
      if (target.closest("#btn-again")) {
        event.preventDefault();
        event.stopPropagation();
        post({ type: "mc:fly-again" });
      } else if (target.closest("#btn-new")) {
        event.preventDefault();
        event.stopPropagation();
        post({ type: "mc:home" });
      }
    },
    true,
  );
})();
