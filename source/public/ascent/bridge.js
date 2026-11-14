/* ==========================================================================
   Integration adapter — Mission Architect's take-off as the launch stage of
   the merged site. No markup, style or behaviour of the game is changed here;
   the adapter only trims the app chrome and relays messages to the host.
   ========================================================================== */
(function () {
  "use strict";

  document.body.classList.add("mc-embed");

  function post(message) {
    if (window.parent && window.parent !== window) window.parent.postMessage(message, "*");
  }

  var readySent = false;
  var orbitSent = false;
  var started = false;
  var tries = 0;

  function announce() {
    if (started || !window.MA_BRIDGE) return;
    var scene = window.MissionScene;
    if (!scene || !scene.isReady()) return;
    if (!readySent) {
      readySent = true;
      window.MA_BRIDGE.onOrbit = function () {
        /* The scene calls this at orbit insertion; finishLaunch() calls it again
           at 100%. The host must only see the hand-off once. */
        if (orbitSent) return;
        orbitSent = true;
        document.body.classList.add("mc-handoff");
        post({ type: "mc:orbit" });
      };
    }
    /* Repeat until the host answers with mc:ascent-start: it may still be
       mounting its listener when this frame finishes loading. */
    post({ type: "mc:ascent-ready" });
  }

  var timer = window.setInterval(function () {
    if (started || ++tries > 200) { window.clearInterval(timer); return; }
    announce();
  }, 200);

  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || data.type !== "mc:ascent-start") return;
    started = true;
    window.clearInterval(timer);
    window.MA_BRIDGE.start(data.payload);
  });
})();
