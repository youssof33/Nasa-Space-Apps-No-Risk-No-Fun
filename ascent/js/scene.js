/* Mission Architect — 3D mission scene (Three.js r128, no build step). */
(function () {
  "use strict";

  const D = window.MA.DATA;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const damp = (a, b, l, dt) => lerp(a, b, 1 - Math.exp(-l * dt));
  const rand = (a, b) => a + Math.random() * (b - a);

  const THREE = window.THREE;
  let renderer, scene, camera, canvas, stage, fadeEl;
  let W = 1, H = 1, dpr = 1;
  let ready = false, running = false, lowFX = false, reduced = false;
  let raf = 0, last = 0, clock = 0;
  let onFail = null, telemetryCb = null, phaseCb = null, completeCb = null;

  const PAD_TOP = 0.46;
  const comp = { x: 1.35 };
  let camMode = "pad", yaw = 0.58, pitch = 0.2, orbitYaw = 0.55;
  let camDist = 1;
  const camPos = new THREE.Vector3(9, 6, 12);
  const camLook = new THREE.Vector3(1.3, 4.2, 0);
  const wantPos = new THREE.Vector3();
  const wantLook = new THREE.Vector3();

  let stars, sunSprite, padWorld, orbitWorld, skyDome;
  let padRings = [], towerBeacon = null, vapor = [];
  let rocketRoot = null, lowerStage = null, upperStack = null, rocket = null;
  let boosters = [], fairingHalves = [], plume = null, engineLight = null, padLights = [];
let lights = null;
  let debris = [];
  let padSmoke = null, smokeLife = null, smokeVel = null, smokePos = null, smokeSize = 0;
  let padGroup = null, clamps = [], arms = [];
  let orbitPlane = null, bodyMesh = null, bodyMat = null, atmo = null, atmoMat = null;
  let cloudMesh = null, cloudMat = null, cloud2 = null, cloud2Mat = null;
  let fovBoost = 0;
  let satellite = null, satArrays = [], satDish = null, satBeacon = null;
  let orbitRings = [];
  let currentBody = "earth";
  let textureCache = {};

  let mission = null, design = null, vehicle = null;
  let launch = null;
  let dragging = false, lastPX = 0, lastPY = 0;
  let shake = 0;
  let resizeObs = null, visObs = null;

  /* ---------- helpers ---------- */
  function col(v) {
    return new THREE.Color(v).convertSRGBToLinear();
  }
  function std(color, o) {
    return new THREE.MeshStandardMaterial(Object.assign({
      color: col(color), metalness: 0.55, roughness: 0.4,
    }, o || {}));
  }
  function basic(color, o) {
    return new THREE.MeshBasicMaterial(Object.assign({
      color: col(color), transparent: true, opacity: 0.4,
    }, o || {}));
  }
  function addBox(parent, w, h, d, x, y, z, m) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }
  function addCyl(parent, rt, rb, h, x, y, z, m, seg) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 32, 1), m);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }
  function addSphere(parent, r, x, y, z, m, w, h) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, w || 24, h || 16), m);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }
  function torus(parent, r, t, x, y, z, m, seg) {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(r, t, 6, seg || 48), m);
    mesh.position.set(x, y, z);
    mesh.rotation.x = Math.PI / 2;
    parent.add(mesh);
    return mesh;
  }
  function disposeGroup(g) {
    if (!g) return;
    g.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach((m) => {
          if (m.__shared) return;
          if (m.dispose) m.dispose();
        });
      }
    });
    if (g.parent) g.parent.remove(g);
  }
  function makeCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  }
  function softTexture() {
    const c = makeCanvas(64, 64);
    const x = c.getContext("2d");
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,.7)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }
  /* Tapered exhaust column: bright at the nozzle, converging to a point. */
  function plumeTexture() {
    if (textureCache.plume) return textureCache.plume;
    const c = makeCanvas(128, 256);
    const x = c.getContext("2d");
    x.clearRect(0, 0, 128, 256);
    const shape = () => {
      x.beginPath();
      x.moveTo(45, 0);
      x.bezierCurveTo(28, 34, 16, 122, 50, 252);
      x.lineTo(78, 252);
      x.bezierCurveTo(112, 122, 100, 34, 83, 0);
      x.closePath();
    };
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.2, "rgba(255,255,255,.98)");
    g.addColorStop(0.45, "rgba(255,255,255,.9)");
    g.addColorStop(0.7, "rgba(255,255,255,.58)");
    g.addColorStop(0.88, "rgba(255,255,255,.26)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.save();
    x.shadowColor = "rgba(255,190,120,.95)";
    x.shadowBlur = 22;
    shape();
    x.fillStyle = g;
    x.fill();
    x.restore();
    // brighter axial filaments
    x.globalCompositeOperation = "lighter";
    for (let i = 0; i < 6; i++) {
      const w = 1 + Math.random() * 3;
      x.fillStyle = `rgba(255,247,220,${0.1 + Math.random() * 0.18})`;
      x.fillRect(62 - w / 2 + Math.random() * 6 - 3, 10 + Math.random() * 60, w, 120 + Math.random() * 90);
    }
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    // Mipmaps average the flame into its transparent margins at distance.
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
    textureCache.plume = t;
    return t;
  }

  function gridTexture() {
    const c = makeCanvas(512, 512);
    const x = c.getContext("2d");
    x.fillStyle = "#0a121c"; x.fillRect(0, 0, 512, 512);
    x.strokeStyle = "rgba(95,211,255,.16)"; x.lineWidth = 2;
    for (let i = 0; i <= 512; i += 64) {
      x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 512); x.stroke();
      x.beginPath(); x.moveTo(0, i); x.lineTo(512, i); x.stroke();
    }
    x.strokeStyle = "rgba(95,211,255,.05)"; x.lineWidth = 1;
    for (let i = 0; i <= 512; i += 16) {
      x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 512); x.stroke();
      x.beginPath(); x.moveTo(0, i); x.lineTo(512, i); x.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(4, 4);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }
  function flameTexture() {
    if (textureCache.flame) return textureCache.flame;
    const c = makeCanvas(64, 256);
    const x = c.getContext("2d");
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "rgba(255,255,246,1)");
    g.addColorStop(0.18, "rgba(255,232,176,.96)");
    g.addColorStop(0.5, "rgba(255,176,86,.72)");
    g.addColorStop(0.82, "rgba(255,128,48,.32)");
    g.addColorStop(1, "rgba(255,138,61,0)");
    x.fillStyle = g; x.fillRect(0, 0, 64, 256);
    x.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 14; i++) {
      const w = 1 + Math.random() * 4;
      x.fillStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.12})`;
      x.fillRect(Math.random() * 64, 0, w, 256);
    }
    x.globalCompositeOperation = "source-over";
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    textureCache.flame = t;
    return t;
  }
  function panelTexture() {
    const c = makeCanvas(256, 256);
    const x = c.getContext("2d");
    x.fillStyle = "#071b2e"; x.fillRect(0, 0, 256, 256);
    const g = x.createLinearGradient(0, 0, 256, 256);
    g.addColorStop(0, "rgba(50,110,170,.55)");
    g.addColorStop(0.5, "rgba(20,60,110,.35)");
    g.addColorStop(1, "rgba(60,130,190,.5)");
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    x.strokeStyle = "rgba(135,210,255,.35)"; x.lineWidth = 2;
    for (let i = 0; i <= 256; i += 32) {
      x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.stroke();
      x.beginPath(); x.moveTo(0, i); x.lineTo(256, i); x.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }
  function decalTexture(title, sub, accent) {
    const c = makeCanvas(512, 128);
    const x = c.getContext("2d");
    x.clearRect(0, 0, 512, 128);
    x.fillStyle = accent; x.fillRect(0, 0, 10, 128);
    x.fillStyle = "rgba(235,245,255,.96)";
    x.font = "700 78px 'Space Grotesk', sans-serif";
    x.fillText(title, 26, 86);
    x.fillStyle = "rgba(160,210,245,.8)";
    x.font = "500 27px 'JetBrains Mono', monospace";
    x.fillText(sub, 30, 120);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    return t;
  }
  function bodyTexture(body) {
    if (textureCache[body]) return textureCache[body];
    const src = { earth: "assets/img/earth-map.webp", moon: "assets/img/moon-map.webp", mars: "assets/img/mars-map.webp" }[body];
    const tex = new THREE.TextureLoader().load(src);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 1;
    tex.__shared = true;
    textureCache[body] = tex;
    return tex;
  }

  /* Painted vehicle skin: panel seams, weld rings, rivets, stencils.
     Reused as a bump map so the seams catch the key light. */
  function skinTexture() {
    if (textureCache.skin) return textureCache.skin;
    const c = makeCanvas(512, 512);
    const x = c.getContext("2d");
    x.fillStyle = "#eef4fb"; x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 30; i++) {
      x.fillStyle = `rgba(${196 + (Math.random() * 40 | 0)},${208 + (Math.random() * 32 | 0)},${222 + (Math.random() * 24 | 0)},${0.05 + Math.random() * 0.07})`;
      x.fillRect(Math.random() * 512, Math.random() * 512, 40 + Math.random() * 130, 50 + Math.random() * 190);
    }
    x.strokeStyle = "rgba(116,138,161,.55)"; x.lineWidth = 2.4;
    for (let u = 0; u <= 512; u += 128) {
      x.beginPath(); x.moveTo(u + 0.5, 0); x.lineTo(u + 0.5, 512); x.stroke();
    }
    x.strokeStyle = "rgba(138,158,180,.34)"; x.lineWidth = 1.4;
    for (let v = 32; v < 512; v += 64) {
      x.beginPath(); x.moveTo(0, v + 0.5); x.lineTo(512, v + 0.5); x.stroke();
    }
    x.fillStyle = "rgba(110,132,156,.5)";
    for (let v = 32; v < 512; v += 64) {
      for (let u = 6; u < 512; u += 16) x.fillRect(u, v - 2, 1.6, 1.6);
    }
    x.fillStyle = "rgba(86,107,130,.55)";
    x.font = "600 9px 'JetBrains Mono', monospace";
    const stamps = ["NO STEP", "LOX VENT", "ACCESS 04", "GSE", "T-0", "AVIONICS"];
    for (let i = 0; i < 8; i++) {
      x.save();
      x.translate(20 + Math.random() * 460, 40 + Math.random() * 430);
      x.rotate(Math.random() < 0.5 ? 0 : -Math.PI / 2);
      x.fillText(stamps[i % stamps.length], 0, 0);
      x.restore();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 1;
    textureCache.skin = t;
    return t;
  }

  /* Exhaust scorch: dark at the engine end, fading along the body. */
  function sootTexture() {
    if (textureCache.soot) return textureCache.soot;
    const c = makeCanvas(128, 256);
    const x = c.getContext("2d");
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.55, "rgba(18,14,10,.16)");
    g.addColorStop(0.86, "rgba(22,16,11,.5)");
    g.addColorStop(1, "rgba(12,9,6,.72)");
    x.fillStyle = g; x.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 22; i++) {
      x.fillStyle = `rgba(10,8,6,${0.04 + Math.random() * 0.1})`;
      x.fillRect(Math.random() * 128, 150 + Math.random() * 106, 3 + Math.random() * 12, 30 + Math.random() * 70);
    }
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    textureCache.soot = t;
    return t;
  }

  /* Deck plating: mottled steel with scorch and wear. */
  function deckTexture() {
    if (textureCache.deck) return textureCache.deck;
    const c = makeCanvas(512, 512);
    const x = c.getContext("2d");
    x.fillStyle = "#1b2a38"; x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 90; i++) {
      x.fillStyle = `rgba(${30 + (Math.random() * 46 | 0)},${44 + (Math.random() * 46 | 0)},${58 + (Math.random() * 44 | 0)},${0.16 + Math.random() * 0.24})`;
      const w = 18 + Math.random() * 120, h = 18 + Math.random() * 120;
      x.fillRect(Math.random() * 512, Math.random() * 512, w, h);
    }
    const g = x.createRadialGradient(256, 256, 10, 256, 256, 250);
    g.addColorStop(0, "rgba(6,8,12,.62)");
    g.addColorStop(0.55, "rgba(9,13,19,.28)");
    g.addColorStop(1, "rgba(9,13,19,0)");
    x.fillStyle = g; x.fillRect(0, 0, 512, 512);
    x.strokeStyle = "rgba(64,86,108,.4)"; x.lineWidth = 2;
    for (let u = 0; u <= 512; u += 64) {
      x.beginPath(); x.moveTo(u + 0.5, 0); x.lineTo(u + 0.5, 512); x.stroke();
    }
    x.strokeStyle = "rgba(120,160,190,.12)"; x.lineWidth = 1;
    for (let i = 0; i < 40; i++) {
      x.beginPath();
      x.moveTo(Math.random() * 512, Math.random() * 512);
      x.lineTo(Math.random() * 512, Math.random() * 512);
      x.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 1;
    textureCache.deck = t;
    return t;
  }

  /* Drifting cloud systems: clustered blobs with clear gaps, tileable in u. */
  function cloudTexture() {
    if (textureCache.cloud) return textureCache.cloud;
    const c = makeCanvas(1024, 512);
    const x = c.getContext("2d");
    x.clearRect(0, 0, 1024, 512);
    const bands = [0.16, 0.3, 0.44, 0.58, 0.72, 0.86];
    const blob = (cx, cy, r, a) => {
      for (const dx of [-1024, 0, 1024]) {
        x.save();
        x.translate(cx + dx, cy);
        x.scale(1.9, 0.62);
        const g = x.createRadialGradient(0, 0, 0, 0, 0, r);
        g.addColorStop(0, `rgba(255,255,255,${a})`);
        g.addColorStop(0.55, `rgba(246,250,255,${a * 0.55})`);
        g.addColorStop(1, "rgba(255,255,255,0)");
        x.fillStyle = g;
        x.beginPath(); x.arc(0, 0, r, 0, Math.PI * 2); x.fill();
        x.restore();
      }
    };
    for (let s = 0; s < 80; s++) {
      const band = bands[(Math.random() * bands.length) | 0];
      const cx = Math.random() * 1024;
      const cy = (band + (Math.random() - 0.5) * 0.07) * 512;
      const spreadX = 24 + Math.random() * 70;
      const spreadY = 8 + Math.random() * 20;
      const puffs = 5 + (Math.random() * 9 | 0);
      for (let i = 0; i < puffs; i++) {
        blob(
          cx + (Math.random() - 0.5) * spreadX * 2,
          cy + (Math.random() - 0.5) * spreadY * 2,
          7 + Math.random() * 15,
          0.16 + Math.random() * 0.22
        );
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 1;
    textureCache.cloud = t;
    return t;
  }

  /* ---------- world setup ---------- */
  /* Deep-field backdrop: a milky band with dust lanes, coloured emission
     nebulae and a bright bulge. Equirectangular, so it wraps the whole scene. */
  function nebulaTexture() {
    if (textureCache.nebula) return textureCache.nebula;
    // Draw in a 2048-wide space, then supersample on desktop: the sky is
    // magnified 3-4x on screen, and a low-res canvas shows as visible noise.
    const S = lowFX ? 1 : 2, W = 2048, H = 1024;
    const c = makeCanvas(W * S, H * S);
    const x = c.getContext("2d");
    x.scale(S, S);

    const base = x.createLinearGradient(0, 0, 0, H);
    base.addColorStop(0, "#02030a");
    base.addColorStop(0.3, "#040716");
    base.addColorStop(0.5, "#060b1e");
    base.addColorStop(0.72, "#03050f");
    base.addColorStop(1, "#010207");
    x.fillStyle = base;
    x.fillRect(0, 0, W, H);

    // Band centreline. Whole cycles, so the seam at x=0 is invisible.
    const bandY = (px) =>
      438 + Math.sin((px / W) * Math.PI * 4) * 34 + Math.sin((px / W) * Math.PI * 10 + 1.2) * 13;

    const glow = (cx, cy, r, rgb, a) => {
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `rgba(${rgb},${a})`);
      g.addColorStop(0.45, `rgba(${rgb},${a * 0.4})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      x.fillStyle = g;
      x.beginPath();
      x.arc(cx, cy, r, 0, Math.PI * 2);
      x.fill();
    };

    // Wide haze under sharp clumps: the layering is what reads as a galaxy.
    for (let i = 0; i < 90; i++) {
      const px = Math.random() * W;
      glow(px, bandY(px) + (Math.random() - 0.5) * 120, 140 + Math.random() * 190, "88,120,200", 0.016);
    }
    for (let i = 0; i < 260; i++) {
      const px = Math.random() * W;
      glow(px, bandY(px) + (Math.random() - 0.5) * 96, 26 + Math.random() * 86, "176,198,255", 0.03 + Math.random() * 0.05);
    }
    // Bright bulge.
    glow(1210, bandY(1210), 320, "226,232,255", 0.2);
    glow(1210, bandY(1210), 130, "255,240,222", 0.16);

    // Emission nebulae: magenta and teal clouds inside the band.
    const nebulae = [
      [330, 402, 260, "255,96,190", 0.18], [430, 452, 170, "255,150,214", 0.14],
      [1660, 470, 250, "70,220,255", 0.16], [1570, 500, 140, "150,255,238", 0.12],
      [820, 380, 170, "150,170,255", 0.1],
    ];
    nebulae.forEach((n) => glow(n[0], n[1], n[2], n[3], n[4]));
    // A few coloured clumps so the band itself is not monochrome.
    for (let i = 0; i < 46; i++) {
      const px = Math.random() * W;
      const rgb = Math.random() < 0.5 ? "255,140,205" : "120,230,255";
      glow(px, bandY(px) + (Math.random() - 0.5) * 70, 22 + Math.random() * 70, rgb, 0.03 + Math.random() * 0.04);
    }

    // Dust lanes cut the band into strips.
    for (let i = 0; i < 90; i++) {
      const px = Math.random() * W;
      x.save();
      x.translate(px, bandY(px) + (Math.random() - 0.5) * 90);
      x.rotate((Math.random() - 0.5) * 0.5);
      x.fillStyle = `rgba(2,3,9,${0.06 + Math.random() * 0.16})`;
      x.beginPath();
      x.ellipse(0, 0, 30 + Math.random() * 190, 4 + Math.random() * 16, 0, 0, Math.PI * 2);
      x.fill();
      x.restore();
    }

    // Distant star dust.
    for (let i = 0; i < 2600; i++) {
      const a = 0.08 + Math.random() * 0.4;
      const s = Math.random() < 0.94 ? 1 : 1.7;
      x.fillStyle = `rgba(${210 + Math.random() * 45 | 0},${224 + Math.random() * 31 | 0},255,${a})`;
      x.fillRect(Math.random() * W, Math.random() * H, s, s);
    }
    // A handful of bright stars with a soft bloom.
    for (let i = 0; i < 34; i++) {
      const cx = Math.random() * W, cy = Math.random() * H;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, 9);
      g.addColorStop(0, "rgba(255,255,255,.9)");
      g.addColorStop(0.3, "rgba(200,226,255,.3)");
      g.addColorStop(1, "rgba(160,200,255,0)");
      x.fillStyle = g;
      x.beginPath();
      x.arc(cx, cy, 9, 0, Math.PI * 2);
      x.fill();
    }

    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.mapping = THREE.EquirectangularReflectionMapping;
    textureCache.nebula = t;
    return t;
  }

  function makeEnv() {
    const c = makeCanvas(512, 256);
    const x = c.getContext("2d");
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "#03050a");
    g.addColorStop(0.45, "#060d18");
    g.addColorStop(0.52, "#0b1b2b");
    g.addColorStop(0.58, "#05090f");
    g.addColorStop(1, "#020408");
    x.fillStyle = g; x.fillRect(0, 0, 512, 256);
    const sun = x.createRadialGradient(360, 96, 0, 360, 96, 60);
    sun.addColorStop(0, "rgba(255,220,180,.55)");
    sun.addColorStop(0.4, "rgba(255,170,110,.14)");
    sun.addColorStop(1, "rgba(255,170,110,0)");
    x.fillStyle = sun; x.fillRect(0, 0, 512, 256);
    const t = new THREE.CanvasTexture(c);
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.encoding = THREE.sRGBEncoding;
    return t;
  }

  function buildSky() {
    const mat = new THREE.MeshBasicMaterial({
      map: nebulaTexture(), side: THREE.BackSide, depthWrite: false, fog: false,
    });
    skyDome = new THREE.Mesh(new THREE.SphereGeometry(420, 48, 32), mat);
    skyDome.renderOrder = -1;
    scene.add(skyDome);
  }

  function buildStars() {
    const N = lowFX ? 900 : 1700;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const u = Math.random() * Math.PI * 2;
      const v = Math.acos(2 * Math.random() - 1);
      const r = rand(120, 300);
      pos[i * 3] = Math.sin(v) * Math.cos(u) * r;
      pos[i * 3 + 1] = Math.cos(v) * r;
      pos[i * 3 + 2] = Math.sin(v) * Math.sin(u) * r;
      const t = Math.random();
      const c = new THREE.Color(t > 0.92 ? 0xffc99a : t > 0.78 ? 0x9ad8ff : 0xeaf4ff);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 2.2, map: softTexture(), transparent: true, opacity: 1,
      vertexColors: true, depthWrite: false, blending: THREE.AdditiveBlending,
      sizeAttenuation: false, fog: false,
    });
    stars = new THREE.Points(geo, mat);
    scene.add(stars);

    const sunMat = new THREE.SpriteMaterial({
      map: softTexture(), color: 0xffd9b0, transparent: true, opacity: 0.65,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    sunSprite = new THREE.Sprite(sunMat);
    sunSprite.scale.setScalar(16);
    sunSprite.position.set(120, 70, -190);
    scene.add(sunSprite);
  }

  function buildPad() {
    padWorld = new THREE.Group();
    scene.add(padWorld);

    const groundMat = new THREE.MeshStandardMaterial({
      map: gridTexture(), color: col(0x16222e), metalness: 0.1, roughness: 0.98,
    });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(70, 72), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    padWorld.add(ground);

    padGroup = new THREE.Group();
    padWorld.add(padGroup);

    const deckTex = deckTexture();
    // The dark plating map must not double as roughnessMap: dark pixels read as
    // near-zero roughness and turn the deck into a mirror.
    const deckMat = new THREE.MeshStandardMaterial({
      map: deckTex, bumpMap: deckTex, bumpScale: 0.012,
      metalness: 0.06, roughness: 0.94, envMapIntensity: 0.32,
    });
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(4.3, 4.7, 0.46, 8), deckMat);
    deck.position.y = 0.23;
    deck.receiveShadow = true;
    deck.castShadow = true;
    padGroup.add(deck);

    const lipMat = basic(0x5fd3ff, { opacity: 0.55 });
    torus(padGroup, 4.22, 0.018, 0, PAD_TOP + 0.01, 0, lipMat, 64);
    const hazardMatA = basic(0xff8a3d, { opacity: 0.75 });
    const hazardMatB = basic(0x14202e, { opacity: 0.9 });
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      const b = addBox(padGroup, 0.55, 0.035, 0.16, Math.cos(a) * 3.92, PAD_TOP + 0.015, Math.sin(a) * 3.92, i % 2 ? hazardMatA : hazardMatB);
      b.rotation.y = -a;
    }

    const trench = addBox(padGroup, 1.25, 0.16, 4.6, 0, 0.55, 0, std(0x0a0e14, { metalness: 0, roughness: 1, envMapIntensity: 0.15 }));
    trench.receiveShadow = true;
    addBox(padGroup, 0.5, 0.02, 4.1, 0, 0.64, 0, basic(0xff8a3d, { opacity: 0.22 }));

    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const g = new THREE.Group();
      g.position.set(Math.cos(a) * 0.72, PAD_TOP, Math.sin(a) * 0.72);
      g.rotation.y = -a;
      const m = addBox(g, 0.22, 0.3, 0.22, 0, 0, 0, std(0x253544, { metalness: 0.8, roughness: 0.3 }));
      m.castShadow = true;
      clamps.push(g);
      padGroup.add(g);
    }

    for (let i = 0; i < 2; i++) {
      const g = new THREE.Group();
      g.position.set(i ? 3.1 : -3.1, 0, i ? 2.1 : -2.3);
      addCyl(g, 0.07, 0.09, 3.6, 0, 1.8, 0, std(0x1b2836, { metalness: 0.7, roughness: 0.5 }));
      addBox(g, 0.5, 0.14, 0.5, 0, 3.6, 0, std(0x0e1722));
      const lamp = addSphere(g, 0.17, 0, 3.6, 0, basic(i ? 0xff8a3d : 0x5fd3ff, { opacity: 1, transparent: false }), 12, 8);
      lamp.material.transparent = true;
      const pl = new THREE.PointLight(i ? 0xff8a3d : 0x5fd3ff, 1.2, 15, 2);
      pl.position.set(0, 3.4, 0);
      g.add(pl);
      padLights.push(pl);
      padWorld.add(g);
    }

    // strongback
    const tower = new THREE.Group();
    tower.position.set(-3.25, 0, 0);
    const steel = std(0x536577, { metalness: 0.8, roughness: 0.36 });
    const dark = std(0x1a2735, { metalness: 0.7, roughness: 0.5 });
    for (const dx of [-0.42, 0.42]) for (const dz of [-0.42, 0.42]) {
      addBox(tower, 0.09, 10.2, 0.09, dx, 5.1, dz, steel).castShadow = true;
    }
    for (let lvl = 0; lvl < 10; lvl++) {
      const y = 0.55 + lvl * 1.02;
      addBox(tower, 0.92, 0.05, 0.05, 0, y, -0.42, steel);
      addBox(tower, 0.92, 0.05, 0.05, 0, y, 0.42, steel);
      addBox(tower, 0.05, 0.05, 0.92, -0.42, y, 0, steel);
      addBox(tower, 0.05, 0.05, 0.92, 0.42, y, 0, steel);
      if (lvl < 9) {
        const a = addBox(tower, 0.045, 1.35, 0.045, 0, y + 0.5, -0.42, dark);
        a.rotation.z = Math.PI / 4;
        const b = addBox(tower, 0.045, 1.35, 0.045, 0, y + 0.5, 0.42, dark);
        b.rotation.z = -Math.PI / 4;
      }
    }
    addBox(tower, 0.6, 0.14, 0.6, 0, 10.3, 0, dark);
    towerBeacon = addSphere(tower, 0.09, 0, 10.45, 0, basic(0xff5b4a, { opacity: 1, transparent: false }), 10, 8);
    towerBeacon.material.transparent = true;
    padWorld.add(tower);

    // service arms
    for (const [y, len] of [[3.55, 2.25], [5.5, 2.05]]) {
      const pivot = new THREE.Group();
      pivot.position.set(-2.85, y, 0);
      addBox(pivot, len, 0.1, 0.2, len / 2, 0, 0, std(0x394b5e, { metalness: 0.8, roughness: 0.35 }));
      addBox(pivot, 0.3, 0.3, 0.26, len - 0.1, 0, 0, std(0x162330));
      arms.push(pivot);
      padWorld.add(pivot);
    }

    // distant ridge line
    const ridgeMat = std(0x060c14, { metalness: 0, roughness: 1 });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3;
      const r = rand(58, 80);
      const h = rand(3.5, 8);
      const c = new THREE.Mesh(new THREE.ConeGeometry(h * 2.8, h, 6, 1), ridgeMat);
      c.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      c.rotation.y = rand(0, Math.PI);
      padWorld.add(c);
    }

    padRings = [];
    for (let i = 0; i < 2; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(5.4 + i * 1.1, 0.008, 4, 96),
        basic(i ? 0xff8a3d : 0x5fd3ff, { opacity: i ? 0.18 : 0.28 })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.03;
      padRings.push(ring);
      padWorld.add(ring);
    }

    buildSmoke();
  }

  function buildSmoke() {
    padSmoke = { n: lowFX ? 55 : 110 };
    smokePos = new Float32Array(padSmoke.n * 3);
    smokeVel = new Float32Array(padSmoke.n * 3);
    smokeLife = new Float32Array(padSmoke.n);
    smokeSize = lowFX ? 1.1 : 0.9;
    for (let i = 0; i < padSmoke.n; i++) {
      smokePos[i * 3 + 1] = -999;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(smokePos, 3));
    geo.setAttribute("aLife", new THREE.BufferAttribute(smokeLife, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: softTexture() }, uSize: { value: smokeSize } },
      vertexShader: `
        attribute float aLife;
        varying float vLife;
        uniform float uSize;
        void main(){
          vLife = aLife;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = uSize * (90.0 / max(1.0, -mv.z)) * (0.5 + aLife * 0.9);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uMap;
        varying float vLife;
        void main(){
          vec4 t = texture2D(uMap, gl_PointCoord);
          gl_FragColor = vec4(0.62, 0.72, 0.84, t.a * vLife * 0.5);
        }`,
      transparent: true, depthWrite: false,
    });
    padSmoke.points = new THREE.Points(geo, mat);
    padSmoke.points.frustumCulled = false;
    padWorld.add(padSmoke.points);
  }

  function spawnSmoke(x, y, z, n, spread, power) {
    for (let k = 0; k < n; k++) {
      const i = padSmoke.next = ((padSmoke.next || 0) + 1) % padSmoke.n;
      smokeLife[i] = rand(0.6, 1.5);
      smokePos[i * 3] = x + rand(-spread, spread);
      smokePos[i * 3 + 1] = y + rand(-0.15, 0.35);
      smokePos[i * 3 + 2] = z + rand(-spread, spread);
      const a = rand(0, Math.PI * 2);
      const s = rand(0.3, 1) * power;
      smokeVel[i * 3] = Math.cos(a) * s;
      smokeVel[i * 3 + 1] = rand(0.2, 0.9) * power;
      smokeVel[i * 3 + 2] = Math.sin(a) * s;
    }
    padSmoke.points.geometry.attributes.aLife.needsUpdate = true;
  }

  function updateSmoke(dt) {
    if (!padSmoke) return;
    for (let i = 0; i < padSmoke.n; i++) {
      if (smokeLife[i] <= 0) continue;
      smokeLife[i] -= dt;
      if (smokeLife[i] <= 0) {
        smokePos[i * 3 + 1] = -999;
        continue;
      }
      smokePos[i * 3] += smokeVel[i * 3] * dt;
      smokePos[i * 3 + 1] += smokeVel[i * 3 + 1] * dt;
      smokePos[i * 3 + 2] += smokeVel[i * 3 + 2] * dt;
      smokeVel[i * 3] *= 0.985;
      smokeVel[i * 3 + 2] *= 0.985;
      smokeVel[i * 3 + 1] += 0.28 * dt;
    }
    padSmoke.points.geometry.attributes.position.needsUpdate = true;
    padSmoke.points.geometry.attributes.aLife.needsUpdate = true;
  }

  /* ---------- rocket ---------- */
  const ACCENT = { earth: "#5fd3ff", moon: "#9d8cff", mars: "#ff8a3d" };

  function dimsFor(size) {
    if (size === "l") return { r: 0.34, low: 3.2, up: 1.35, fair: 1.55, fairR: 0.44, engines: 1, boosters: 0 };
    if (size === "h") return { r: 0.55, low: 4.7, up: 1.85, fair: 2.05, fairR: 0.72, engines: 5, boosters: 2 };
    return { r: 0.44, low: 4.05, up: 1.6, fair: 1.8, fairR: 0.58, engines: 3, boosters: 0 };
  }

  function moduleMesh(p, scale, forSat) {
    scale = scale || 1;
    const g = new THREE.Group();
    const accent = new THREE.Color({
      cam: 0x5fd3ff, spec: 0x46e6a0, dish: 0xffd166, can: 0xff8a3d,
      rad: 0xff6b6b, mag: 0x9d8cff, lidar: 0x7fe3ff, bio: 0x7dffb0,
    }[p.id] || 0x9db4cc);
    const shell = std(0x2a3a4b, { metalness: 0.65, roughness: 0.4 });
    const tint = std(accent, { metalness: 0.45, roughness: 0.42, emissive: accent, emissiveIntensity: 0.18 });
    addBox(g, 0.34 * scale, 0.24 * scale, 0.3 * scale, 0, 0, 0, shell);
    addBox(g, 0.36 * scale, 0.04 * scale, 0.32 * scale, 0, 0.12 * scale, 0, tint);
    if (p.id === "cam") {
      addCyl(g, 0.075 * scale, 0.075 * scale, 0.1 * scale, 0, 0, 0.2 * scale, tint, 18).rotation.x = Math.PI / 2;
    } else if (p.id === "spec") {
      addCyl(g, 0.09 * scale, 0.09 * scale, 0.08 * scale, 0, 0, 0.19 * scale, tint, 18).rotation.x = Math.PI / 2;
    } else if (p.id === "dish") {
      const mast = addCyl(g, 0.025 * scale, 0.025 * scale, 0.34 * scale, 0, 0.24 * scale, 0, std(0x9fb4c8));
      mast.rotation.z = 0.2;
      const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.18 * scale, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), std(0xe8eef7, { metalness: 0.4, roughness: 0.3, side: THREE.DoubleSide }));
      bowl.position.set(0.02 * scale, 0.4 * scale, 0);
      bowl.rotation.x = Math.PI / 2.4;
      g.add(bowl);
    } else if (p.id === "can") {
      addCyl(g, 0.11 * scale, 0.11 * scale, 0.3 * scale, 0, 0, 0, tint, 20);
    } else if (p.id === "rad") {
      addCyl(g, 0.02 * scale, 0.02 * scale, 0.34 * scale, 0, 0.24 * scale, 0, std(0x9fb4c8), 10);
      addSphere(g, 0.055 * scale, 0, 0.42 * scale, 0, tint, 12, 8);
    } else if (p.id === "mag") {
      const boom = addBox(g, 0.5 * scale, 0.03 * scale, 0.03 * scale, 0.24 * scale, 0.18 * scale, 0, std(0x9fb4c8));
      boom.rotation.z = 0.15;
      addSphere(g, 0.06 * scale, 0.48 * scale, 0.23 * scale, 0, tint, 12, 8);
    } else if (p.id === "lidar") {
      addCyl(g, 0.075 * scale, 0.075 * scale, 0.14 * scale, 0, 0.17 * scale, 0, tint, 14);
    } else if (p.id === "bio") {
      addCyl(g, 0.1 * scale, 0.1 * scale, 0.32 * scale, 0, 0, 0, std(0x2b5d47, { metalness: 0.3, roughness: 0.5, emissive: 0x1f7a55, emissiveIntensity: 0.25 }), 18);
      torus(g, 0.105 * scale, 0.012 * scale, 0, 0.15 * scale, 0, basic(0x7dffb0, { opacity: 0.9 }), 20);
    }
    return g;
  }

  function buildRocket(missionDef, designObj) {
    if (rocketRoot) {
      disposeGroup(rocketRoot);
      rocketRoot = null;
    }
    boosters = [];
    fairingHalves = [];
    plume = null;
    engineLight = null;

    const v = window.MA.Model.find(D.vehicles, designObj.vehicle);
    vehicle = v;
    const dim = dimsFor(v.size);
    const accent = ACCENT[missionDef.body] || ACCENT.earth;

    rocketRoot = new THREE.Group();
    rocketRoot.position.y = PAD_TOP + 0.02;
    padWorld.add(rocketRoot);

    const skin = skinTexture();
    const white = new THREE.MeshStandardMaterial({
      map: skin, bumpMap: skin, bumpScale: 0.018,
      color: col(0xd5e1ee), metalness: 0.22, roughness: 0.44,
    });
    const white2 = std(0xc6d3e0, { metalness: 0.22, roughness: 0.54 });
    const dark = std(0x111a25, { metalness: 0.45, roughness: 0.5 });
    const steel = std(0x6b7e91, { metalness: 0.85, roughness: 0.28 });
    const glow = std(new THREE.Color(accent), { metalness: 0.4, roughness: 0.35, emissive: col(accent), emissiveIntensity: 0.75 });

    lowerStage = new THREE.Group();
    rocketRoot.add(lowerStage);

    const body = addCyl(lowerStage, dim.r, dim.r, dim.low, 0, dim.low / 2 + 0.22, 0, white, 40);
    body.castShadow = true;
    const soot = new THREE.Mesh(
      new THREE.CylinderGeometry(dim.r * 1.004, dim.r * 1.02, dim.low * 0.34, 40, 1, true),
      new THREE.MeshBasicMaterial({ map: sootTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide })
    );
    soot.position.y = 0.22 + dim.low * 0.17;
    lowerStage.add(soot);
    addCyl(lowerStage, dim.r * 1.05, dim.r * 1.02, 0.3, 0, 0.2, 0, dark, 36);
    addCyl(lowerStage, dim.r * 1.04, dim.r * 1.02, 0.2, 0, dim.low + 0.12, 0, dark, 36);
    addBox(lowerStage, 0.055, dim.low * 0.86, 0.09, dim.r * 0.94, dim.low * 0.51, 0, white2).castShadow = true;
    for (const f of [-0.5, 0, 0.5]) {
      torus(lowerStage, dim.r * 0.995, 0.008, 0, dim.low * 0.5 + f * dim.low, 0, std(0x8fa2b5, { metalness: 0.7, roughness: 0.3 }), 40);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const fin = addBox(lowerStage, 0.18, 0.24, 0.05, Math.cos(a) * (dim.r + 0.02), dim.low * 0.94, Math.sin(a) * (dim.r + 0.02), dark);
      fin.rotation.y = -a;
      fin.rotation.z = Math.PI / 4;
    }
    const decal = new THREE.Mesh(
      new THREE.CylinderGeometry(dim.r * 1.008, dim.r * 1.008, dim.r * 0.52, 24, 1, true, -0.55, 1.1),
      new THREE.MeshBasicMaterial({ map: decalTexture(missionDef.no, missionDef.name, accent), transparent: true, depthWrite: false, side: THREE.DoubleSide })
    );
    decal.position.y = dim.low * 0.62;
    lowerStage.add(decal);

    for (let i = 0; i < dim.engines; i++) {
      const a = dim.engines === 1 ? 0 : (i / dim.engines) * Math.PI * 2;
      const rr = dim.engines === 1 ? 0 : dim.r * 0.56;
      const bell = addCyl(lowerStage, 0.11, 0.15, 0.32, Math.cos(a) * rr, 0.06, Math.sin(a) * rr, std(0x2a3746, { metalness: 0.9, roughness: 0.25 }), 16);
      bell.castShadow = true;
    }

    upperStack = new THREE.Group();
    upperStack.position.y = dim.low + 0.22;
    rocketRoot.add(upperStack);

    const upBody = addCyl(upperStack, dim.r * 0.96, dim.r * 0.96, dim.up, 0, dim.up / 2, 0, white, 36);
    upBody.castShadow = true;
    addCyl(upperStack, dim.r * 0.82, dim.r * 0.96, 0.22, 0, dim.up + 0.1, 0, dark, 32);
    addCyl(upperStack, dim.r * 0.82, dim.r * 0.82, dim.fair * 0.5, 0, dim.up + 0.2 + dim.fair * 0.25, 0, basic(0x8edcff, { opacity: 0.07, side: THREE.DoubleSide }), 28);

    // payload stack, visible through the translucent fairing
    const bayH = dim.fair * 0.55;
    const n = designObj.payloads.length;
    const gap = n ? Math.min(0.26, bayH / n) : 0.2;
    const modScale = Math.min(0.85, gap / 0.28);
    const startY = dim.up + 0.2 + bayH * 0.5;
    designObj.payloads.forEach((id, i) => {
      const p = window.MA.Model.find(D.payloads, id);
      const m = moduleMesh(p, modScale, false);
      m.position.set(0, startY - (n > 1 ? (i - (n - 1) / 2) * gap : 0), 0);
      m.rotation.y = i * 0.6;
      upperStack.add(m);
    });

    const fairMat = new THREE.MeshStandardMaterial({
      color: col(0xbfe6ff), metalness: 0.5, roughness: 0.14,
      emissive: col(0x2b5878), emissiveIntensity: 0.55,
      transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide,
    });
    for (let h = 0; h < 2; h++) {
      const half = new THREE.Group();
      const halfCyl = new THREE.Mesh(
        new THREE.CylinderGeometry(dim.fairR, dim.fairR, dim.fair * 0.62, 32, 1, true, h * Math.PI, Math.PI),
        fairMat
      );
      halfCyl.position.y = dim.up + 0.2 + dim.fair * 0.31;
      half.add(halfCyl);
      const halfCone = new THREE.Mesh(
        new THREE.ConeGeometry(dim.fairR, dim.fair * 0.38, 32, 1, true, h * Math.PI, Math.PI),
        fairMat
      );
      halfCone.position.y = dim.up + 0.2 + dim.fair * 0.62 + dim.fair * 0.19;
      half.add(halfCone);
      const edge = new THREE.Mesh(
        new THREE.TorusGeometry(dim.fairR, 0.008, 4, 40, Math.PI),
        basic(accent, { opacity: 0.7 })
      );
      edge.rotation.x = Math.PI / 2;
      edge.rotation.z = h * Math.PI;
      edge.position.y = dim.up + 0.2 + dim.fair * 0.62;
      half.add(edge);
      half.renderOrder = 3;
      half.userData.home = { x: 0, y: 0, z: 0 };
      fairingHalves.push(half);
      upperStack.add(half);
    }

    // heavy side boosters
    if (dim.boosters) {
      for (const side of [-1, 1]) {
        const b = new THREE.Group();
        b.position.set(side * (dim.r + 0.3), 0.12, 0);
        addCyl(b, dim.r * 0.4, dim.r * 0.4, dim.low * 0.78, 0, dim.low * 0.39, 0, white, 28).castShadow = true;
        addCyl(b, dim.r * 0.4, dim.r * 0.34, 0.5, 0, dim.low * 0.78 + 0.25, 0, white2, 24);
        addCyl(b, dim.r * 0.4, dim.r * 0.44, 0.24, 0, 0.12, 0, dark, 24);
        addCyl(b, dim.r * 0.18, dim.r * 0.22, 0.3, 0, 0.02, 0, std(0x2a3746, { metalness: 0.9, roughness: 0.25 }), 14);
        addCyl(b, 0.02, 0.02, dim.low * 0.5, side * dim.r * 0.42, dim.low * 0.45, 0, steel, 8);
        b.userData.home = { x: side * (dim.r + 0.3), y: 0.12, z: 0 };
        boosters.push(b);
        rocketRoot.add(b);
      }
    }

    plume = new THREE.Group();
    const flameTex = plumeTexture();
    // Two tapered billboards: a wide orange body and a hot inner core.
    const flameLayers = [
      [0xff7a24, 5.2, 10.4, 0.9],
      [0xffb455, 3.4, 8.2, 0.9],
      [0xfff0cf, 1.9, 5.6, 1],
    ];
    flameLayers.forEach(([c, w, h, op]) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: flameTex, color: c, transparent: true, opacity: op,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      sp.scale.set(w * dim.r, h * dim.r, 1);
      sp.position.y = -(h * dim.r) / 2 + 0.06;
      sp.userData.baseOpacity = op;
      plume.add(sp);
    });

    // Mach diamonds and nozzle bloom make the exhaust read as a real plume.
    const diamonds = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      addSphere(diamonds, dim.r * 0.26 * (1 - i * 0.2), 0, -0.34 - i * 0.42, 0,
        basic(0xfff3d6, { opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }), 12, 10);
    }
    plume.add(diamonds);
    plume.userData.diamonds = diamonds;

    const nozzleGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: softTexture(), color: 0xffc98c, transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    nozzleGlow.scale.setScalar(dim.r * 3.4);
    nozzleGlow.position.y = -0.02;
    plume.add(nozzleGlow);
    plume.userData.glow = nozzleGlow;
    plume.position.y = 0.02;
    plume.visible = false;
    lowerStage.add(plume);

    engineLight = new THREE.PointLight(0xff8a3d, 0, 11, 2);
    engineLight.position.set(0, -0.4, 0);
    lowerStage.add(engineLight);

    rocket = rocketRoot;
    rocket.userData.upper = upperStack;
    rocket.userData.lower = lowerStage;
    rocket.userData.dim = dim;
  }

  /* ---------- orbit world ---------- */
  function buildOrbitWorld() {
    orbitWorld = new THREE.Group();
    orbitWorld.visible = false;
    scene.add(orbitWorld);

    bodyMat = new THREE.MeshStandardMaterial({
      color: col(0xffffff), roughness: 0.88, metalness: 0.02,
      emissive: 0x06101a, emissiveIntensity: 0.6, envMapIntensity: 0,
    });
    bodyMesh = new THREE.Mesh(new THREE.SphereGeometry(20, 64, 64), bodyMat);
    bodyMesh.rotation.y = -1.2;
    orbitWorld.add(bodyMesh);

    atmoMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0x5fd3ff) }, uPower: { value: 2.6 } },
      vertexShader: `
        varying vec3 vN; varying vec3 vV;
        void main(){
          vN = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uColor; uniform float uPower; varying vec3 vN; varying vec3 vV;
        void main(){
          float rim = pow(1.0 - abs(dot(vN, vV)), uPower);
          gl_FragColor = vec4(uColor, rim * 0.9);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide,
    });
    atmo = new THREE.Mesh(new THREE.SphereGeometry(20.55, 64, 64), atmoMat);
    orbitWorld.add(atmo);

    cloudMat = new THREE.MeshStandardMaterial({
      map: cloudTexture(), color: col(0xffffff), metalness: 0, roughness: 1,
      transparent: true, opacity: 0.85, depthWrite: false, envMapIntensity: 0,
      emissive: 0x0a1622, emissiveIntensity: 0.5,
    });
    cloudMesh = new THREE.Mesh(new THREE.SphereGeometry(20.16, 48, 48), cloudMat);
    cloudMesh.rotation.y = -0.7;
    orbitWorld.add(cloudMesh);

    // Second, slower deck at a different scale: parallax without a new asset.
    const ct = cloudTexture().clone();
    ct.wrapS = ct.wrapT = THREE.RepeatWrapping;
    ct.repeat.set(1.7, 1.4);
    ct.needsUpdate = true;
    cloud2Mat = new THREE.MeshStandardMaterial({
      map: ct, color: col(0xffffff), metalness: 0, roughness: 1,
      transparent: true, opacity: 0.34, depthWrite: false, envMapIntensity: 0,
      emissive: 0x0a1622, emissiveIntensity: 0.35,
    });
    cloud2 = new THREE.Mesh(new THREE.SphereGeometry(20.34, 40, 40), cloud2Mat);
    cloud2.rotation.y = 1.4;
    orbitWorld.add(cloud2);

    orbitPlane = new THREE.Group();
    orbitPlane.rotation.y = -0.55;
    orbitPlane.rotation.x = 0.62;
    orbitWorld.add(orbitPlane);

    const ringPts = [];
    for (let i = 0; i <= 220; i++) {
      const a = (i / 220) * Math.PI * 2;
      ringPts.push(new THREE.Vector3(Math.cos(a) * 22.35, Math.sin(a) * 22.35, 0));
    }
    const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPts);
    const ring = new THREE.LineLoop(ringGeo, new THREE.LineBasicMaterial({ color: 0x5fd3ff, transparent: true, opacity: 0.42, depthWrite: false }));
    orbitPlane.add(ring);
    orbitRings.push(ring);

    const ring2 = new THREE.LineLoop(ringGeo.clone(), new THREE.LineBasicMaterial({ color: 0x9d8cff, transparent: true, opacity: 0.1, depthWrite: false }));
    ring2.rotation.x = 1.1;
    ring2.rotation.z = 0.3;
    ring2.scale.setScalar(1.08);
    orbitWorld.add(ring2);
    orbitRings.push(ring2);

    satellite = new THREE.Group();
    satellite.position.set(0, 22.35, 0);
    orbitPlane.add(satellite);
    buildSatellite();
  }

  function buildSatellite() {
    if (satellite.userData.parts) {
      satellite.userData.parts.forEach((p) => disposeGroup(p));
    }
    const parts = [];
    satArrays = [];
    satDish = null;

    const body = new THREE.Group();
    const hull = std(0xc9a35a, { metalness: 0.75, roughness: 0.38 });
    const white = std(0xe6eef6, { metalness: 0.45, roughness: 0.4 });
    const dark = std(0x151f2b, { metalness: 0.6, roughness: 0.4 });
    addBox(body, 1.05, 0.78, 0.82, 0, 0, 0, hull).castShadow = true;
    addBox(body, 1.1, 0.1, 0.86, 0, 0.42, 0, white);
    addBox(body, 1.1, 0.1, 0.86, 0, -0.42, 0, dark);
    addBox(body, 0.62, 0.06, 0.62, 0, 0.49, 0, blackPanelMat());
    for (let i = 0; i < 4; i++) {
      addBox(body, 0.04, 0.5, 0.5, -0.54, 0, 0, white);
    }
    satellite.add(body);
    parts.push(body);

    const payloadIds = design ? design.payloads : [];
    const mods = payloadIds.map((id) => window.MA.Model.find(D.payloads, id));
    const top = new THREE.Group();
    const n = mods.length;
    mods.forEach((p, i) => {
      const m = moduleMesh(p, 0.62, true);
      const col = i % 3;
      const row = Math.floor(i / 3);
      m.position.set((col - 1) * 0.34, 0.62 + row * 0.18, 0);
      m.rotation.y = -0.3 + col * 0.3;
      top.add(m);
    });
    satellite.add(top);
    parts.push(top);

    if (payloadIds.includes("dish")) {
      satDish = new THREE.Group();
      const bowl = new THREE.Mesh(
        new THREE.SphereGeometry(0.52, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2),
        std(0xe9f1fb, { metalness: 0.5, roughness: 0.28, side: THREE.DoubleSide })
      );
      bowl.rotation.x = 0;
      bowl.position.y = -0.62;
      satDish.add(bowl);
      addCyl(satDish, 0.035, 0.035, 0.3, 0, -0.82, 0, std(0x8fa6bd), 10);
      addSphere(satDish, 0.05, 0, -0.98, 0, basic(0x5fd3ff, { opacity: 1 }), 10, 8);
      satellite.add(satDish);
      parts.push(satDish);
    }

    const foil = std(0x2a3d50, { metalness: 0.6, roughness: 0.42 });
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.58, 0, 0);
      for (let i = 0; i < 3; i++) {
        const panel = new THREE.Mesh(
          new THREE.BoxGeometry(0.86, 0.025, 0.62),
          [foil, foil, panelMat(), panelMat(), foil, foil]
        );
        panel.position.set(side * (0.47 + i * 0.88), 0, 0);
        panel.castShadow = true;
        pivot.add(panel);
      }
      addCyl(pivot, 0.035, 0.035, 0.3, side * 0.1, 0, 0, std(0x9fb4c8), 8);
      satellite.add(pivot);
      parts.push(pivot);
      satArrays.push({ group: pivot, side, deployed: false });
    }

    satBeacon = addSphere(satellite, 0.055, 0.5, 0.52, 0.36, basic(0x46e6a0, { opacity: 1 }), 10, 8);
    satBeacon.material.transparent = true;
    parts.push(satBeacon);
    satellite.userData.parts = parts;
    satellite.userData.top = top;
    satellite.userData.body = body;
  }

  function panelMat() {
    if (!panelMat._m) {
      const t = panelTexture();
      panelMat._m = new THREE.MeshStandardMaterial({
        map: t, color: col(0x9ecfff), metalness: 0.5, roughness: 0.42,
        emissive: 0x0b3350, emissiveIntensity: 0.35,
      });
      panelMat._m.__shared = true;
    }
    return panelMat._m;
  }
  function blackPanelMat() {
    if (!blackPanelMat._m) {
      blackPanelMat._m = new THREE.MeshStandardMaterial({
        map: panelTexture(), color: col(0x3a6d91), metalness: 0.55, roughness: 0.4,
      });
      blackPanelMat._m.__shared = true;
    }
    return blackPanelMat._m;
  }

  function setLighting(mode) {
    if (!lights) return;
    const orbit = mode === "orbit";
    lights.hemi.intensity = orbit ? 0.5 : 0.5;
    lights.key.intensity = orbit ? 1.35 : 1.5;
    lights.rim.intensity = orbit ? 0.5 : 1.15;
    lights.fill.intensity = orbit ? 0.06 : 0.28;
  }

  function setBody(body) {
    if (!bodyMat) return;
    currentBody = body;
    bodyMat.map = bodyTexture(body);
    bodyMat.bumpMap = bodyMat.map;
    bodyMat.bumpScale = body === "earth" ? 0.35 : body === "mars" ? 0.85 : 0.7;
    // Full-strength colour for Earth: the blue marble is already the artwork.
    bodyMat.color.set(col(body === "mars" ? 0xe8c9b0 : body === "moon" ? 0xc2c7d0 : 0xffffff));
    bodyMat.emissive.set(col(body === "mars" ? 0x1a0a06 : body === "moon" ? 0x080a0d : 0x1c3a5c));
    bodyMat.emissiveMap = body === "earth" ? bodyMat.map : null;
    bodyMat.emissiveIntensity = body === "earth" ? 0.55 : 0.3;
    bodyMat.needsUpdate = true;
    const col2 = body === "earth" ? 0x5fd3ff : body === "mars" ? 0xff8a5c : 0x9aa7b8;
    atmoMat.uniforms.uColor.value.set(col2);
    atmoMat.uniforms.uPower.value = body === "earth" ? 2.6 : 3.4;
    atmo.visible = body !== "moon";
    atmo.scale.setScalar(body === "earth" ? 1 : 1.015);
    if (cloudMesh) {
      cloudMesh.visible = body === "earth";
      cloudMat.opacity = body === "earth" ? 0.55 : 0;
    }
    if (cloud2) {
      cloud2.visible = body === "earth";
      cloud2Mat.opacity = body === "earth" ? 0.2 : 0;
    }
  }

  /* ---------- camera ---------- */
  function setComposition(mode) {
    if (mode === "title") comp.x = -3.2;
    else if (mode === "design") comp.x = 1.9;
    else comp.x = 0;
  }

  function setView(v) {
    camMode = v;
    if (v === "pad") { yaw = 0.58; pitch = 0.17; }
    if (v === "orbit") { orbitYaw = 0.9; }
  }

  /* Manual camera nudges from the on-screen rig. */
  function nudge(kind) {
    if (!ready) return;
    if (kind === "left" || kind === "right") {
      const d = kind === "left" ? 0.32 : -0.32;
      if (orbitWorld && orbitWorld.visible) orbitYaw += d;
      else yaw += d;
    } else if (kind === "in") {
      camDist = clamp(camDist - 0.1, 0.5, 1.9);
    } else if (kind === "out") {
      camDist = clamp(camDist + 0.1, 0.5, 1.9);
    } else if (kind === "reset") {
      camDist = 1;
      yaw = 0.58;
      pitch = 0.17;
      orbitYaw = 0.9;
    }
  }

  function updateCamera(dt) {
    if (launch && launch.swapped && !launch.camSnapped) {
      launch.camSnapped = true;
      const sp = new THREE.Vector3();
      if (satellite) {
        satellite.getWorldPosition(sp);
        const r = 9.9;
        const a = orbitYaw;
        camPos.set(
          sp.x + Math.sin(a) * Math.cos(0.24) * r,
          sp.y + Math.sin(0.24) * r + 0.8,
          sp.z + Math.cos(a) * Math.cos(0.24) * r
        );
        camLook.copy(sp);
      }
    }
    if (launch && launch.active) {
      const rocketPos = new THREE.Vector3();
      if (upperStack) upperStack.getWorldPosition(rocketPos);
      if (launch.phase === "ORBIT" || launch.phase === "DEPLOY" || launch.phase === "COMPLETE") {
        const sp = new THREE.Vector3();
        satellite.getWorldPosition(sp);
        const r = 9.9;
        const a = orbitYaw + (reduced ? 0 : clock * 0.09);
        wantPos.set(sp.x + Math.sin(a) * Math.cos(0.24) * r, sp.y + Math.sin(0.24) * r + 0.8, sp.z + Math.cos(a) * Math.cos(0.24) * r);
        wantLook.copy(sp);
      } else {
        const y = rocketPos.y;
        const k = clamp(launch.t / launch.dur, 0, 1);
        wantPos.set(rocketPos.x + 9.2 + k * 1.8, y + 3.2 + k * 1.8, rocketPos.z + 13.8 + k * 2.8);
        wantLook.set(rocketPos.x, y + 1.9 + k * 2.0, rocketPos.z);
        if (shake > 0.001) {
          wantPos.x += rand(-1, 1) * shake;
          wantPos.y += rand(-1, 1) * shake;
          wantLook.x += rand(-1, 1) * shake * 0.5;
        }
      }
    } else if (camMode === "chase") {
      if (orbitWorld.visible) {
        const sp = new THREE.Vector3();
        satellite.getWorldPosition(sp);
        wantPos.set(sp.x + 4.6, sp.y + 1.4, sp.z + 5.2);
        wantLook.copy(sp);
      } else {
        wantPos.set(3.1, 2.5, 5.6);
        wantLook.set(comp.x * 0.35, 3.7, 0);
      }
    } else if (camMode === "orbit") {
      if (orbitWorld.visible) {
        const sp = new THREE.Vector3();
        satellite.getWorldPosition(sp);
        const a = orbitYaw + (reduced ? 0 : clock * 0.12);
        const r = 8.5 * camDist;
        wantPos.set(sp.x + Math.sin(a) * r, sp.y + 3.2 * camDist, sp.z + Math.cos(a) * r);
        wantLook.copy(sp);
      } else {
        const a = reduced ? 0.8 : clock * 0.07;
        wantPos.set(Math.sin(a) * 15.4 * camDist + comp.x, 11.4, Math.cos(a) * 15.4 * camDist);
        wantLook.set(comp.x, 4.9, 0);
      }
    } else {
      // Phone layout stacks a sheet under the 3D view: pull back and aim low
      // so the vehicle sits in the strip above the sheet, not behind it.
      const narrow = W <= 900;
      const target = new THREE.Vector3(narrow ? 0 : comp.x, narrow ? 1.0 : 4.9, 0);
      const r = (narrow ? 30 : 17.4) * camDist;
      wantPos.set(
        target.x + Math.sin(yaw) * Math.cos(pitch) * r,
        target.y + Math.sin(pitch) * r,
        target.z + Math.cos(yaw) * Math.cos(pitch) * r
      );
      wantLook.copy(target);
    }
    const follow = launch && launch.active ? 9.5 : 3.4;
    camPos.x = damp(camPos.x, wantPos.x, follow, dt);
    camPos.y = damp(camPos.y, wantPos.y, follow, dt);
    camPos.z = damp(camPos.z, wantPos.z, follow, dt);
    camLook.x = damp(camLook.x, wantLook.x, follow, dt);
    camLook.y = damp(camLook.y, wantLook.y, follow, dt);
    camLook.z = damp(camLook.z, wantLook.z, follow, dt);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    const fovWant = (W < 640 ? 46 : 38) + fovBoost;
    if (Math.abs(camera.fov - fovWant) > 0.02) {
      camera.fov = damp(camera.fov, fovWant, 3.2, dt);
      camera.updateProjectionMatrix();
    }
    if (shake > 0.001) shake = Math.max(0, shake - dt * 1.4);
  }

  /* ---------- launch sequence ---------- */
  function launchSequence(missionDef, designObj, opts) {
    opts = opts || {};
    resetWorld(true);
    mission = missionDef;
    design = designObj;
    buildRocket(missionDef, designObj);
    launch = {
      active: true, t: 0, dur: (opts.fast || reduced) ? 2.6 : 7.0,
      fast: !!opts.fast, phase: "IGNITION", complete: false, fired: false, swapped: false,
      smokeT: 0,
    };
    setComposition("launch");
    camMode = "chase";
    yaw = 0.58; pitch = 0.2;
    camPos.set(7, 5.5, 11);
    camLook.set(0, 4, 0);
    shake = 0.16;
    fovBoost = lowFX ? 5 : 9;
    if (plume) plume.visible = true;
    spawnSmoke(0, PAD_TOP - 0.2, 0, lowFX ? 16 : 30, 1.2, 1.3);
    if (engineLight) engineLight.intensity = 2.6;
    if (phaseCb) phaseCb("IGNITION", { t: 0, label: "IGNITION" });
    if (telemetryCb) telemetryCb({ alt: 0, vel: 0, phase: "IGNITION", progress: 0 });
    if (opts.onStart) opts.onStart();
  }

  function fireComplete() {
    if (!launch || launch.fired) return;
    launch.fired = true;
    if (completeCb) window.setTimeout(completeCb, reduced ? 120 : 520);
  }

  function stepLaunch(dt) {
    const L = launch;
    L.t += dt;
    const p = clamp(L.t / L.dur, 0, 1);
    const liftoffAt = L.dur * 0.11;
    const maxQAt = L.dur * 0.33;
    const stageAt = L.dur * 0.47;
    const fairAt = L.dur * 0.59;
    const orbitAt = L.dur * 0.72;
    const deployAt = L.dur * 0.8;

    if (plume) {
      const flicker = 0.9 + Math.random() * 0.2;
      plume.scale.set(flicker, 0.94 + Math.random() * 0.16, flicker);
      plume.children.forEach((c, i) => {
        if (c.userData && c.userData.baseOpacity !== undefined) {
          c.material.opacity = c.userData.baseOpacity * (0.78 + Math.random() * 0.42);
        }
      });
      const dm = plume.userData.diamonds;
      if (dm) {
        dm.children.forEach((d, i) => {
          const s = 0.8 + Math.random() * 0.45;
          d.scale.set(s, s * 0.5, s);
          d.material.opacity = (i === dm.children.length - 1 ? 0.35 : 0.62) + Math.random() * 0.28;
        });
      }
      if (plume.userData.glow) plume.userData.glow.material.opacity = 0.42 + Math.random() * 0.2;
    }
    if (engineLight) engineLight.intensity = 3.2 + Math.random() * 1.2;

    if (towerBeacon) towerBeacon.material.opacity = 0.6 + Math.sin(clock * 6) * 0.4;
    padRings.forEach((r, i) => { r.rotation.z += dt * (i ? -0.2 : 0.35); });

    if (L.t < liftoffAt) {
      shake = 0.12;
    } else {
      const q = clamp((L.t - liftoffAt) / (L.dur * 0.34), 0, 1);
      const climb = Math.pow(q, 1.75);
      rocketRoot.position.y = PAD_TOP + 0.02 + climb * 96;
      if (L.phase === "IGNITION") {
        L.phase = "LIFTOFF"; setPhase("LIFTOFF", 0.08);
        camMode = "chase";
      }
      if (L.t > L.dur * 0.12 && L.t < L.dur * 0.32) {
        L.smokeT += dt;
        if (L.smokeT > 0.035) {
          L.smokeT = 0;
          const wp = new THREE.Vector3();
          if (lowerStage) lowerStage.getWorldPosition(wp);
          spawnSmoke(wp.x, wp.y + 0.1, wp.z, 2, 0.6, 0.4);
        }
      }
      arms.forEach((a, i) => { a.rotation.z = damp(a.rotation.z, i ? -0.9 : -1.1, 1.4, dt); });
      clamps.forEach((c) => { c.position.y = damp(c.position.y, PAD_TOP - 0.1, 2, dt); });
    }

    if (L.t >= maxQAt && L.phase === "LIFTOFF") {
      L.phase = "MAX-Q"; setPhase("MAX-Q", 0.35);
      shake = 0.24;
    }

    if (L.t >= stageAt && L.phase === "MAX-Q") {
      L.phase = "STAGE SEP"; setPhase("STAGE SEP", 0.52);
      shake = 0.34;
      separate();
    }

    if (L.t >= fairAt && L.phase === "STAGE SEP") {
      L.phase = "FAIRING"; setPhase("FAIRING DEPLOY", 0.65);
      deployFairing();
    }

    if (L.t >= orbitAt && L.phase === "FAIRING") {
      L.phase = "ORBIT"; setPhase("ORBIT INSERTION", 0.82);
      toOrbit();
    }

    if (L.t >= deployAt && L.phase === "ORBIT") {
      L.phase = "DEPLOY"; setPhase("PAYLOAD DEPLOY", 0.94);
      deployArrays();
    }

    if (L.t >= L.dur && !L.complete) {
      L.complete = true;
      L.phase = "COMPLETE";
      setPhase("MISSION COMPLETE", 1);
      if (telemetryCb) telemetryCb({ alt: 550, vel: 7600, phase: "COMPLETE", progress: 1 });
      fireComplete();
    }

    let alt = 0, vel = 0;
    if (L.t > liftoffAt) {
      const q = clamp((L.t - liftoffAt) / (L.dur * 0.5), 0, 1);
      alt = Math.round(Math.pow(q, 1.6) * 550);
      vel = Math.round(Math.pow(q, 0.62) * 7600);
    }
    if (L.phase === "ORBIT" || L.phase === "DEPLOY" || L.phase === "COMPLETE") {
      alt = 550; vel = 7600;
    }
    if (telemetryCb) telemetryCb({ alt, vel, phase: L.phase, progress: p });
    updateSeparated(dt);
    updateFairing(dt);
    updateArrays(dt);
  }

  function setPhase(name, progress) {
    if (phaseCb) phaseCb(name, { progress, t: launch ? launch.t : 0 });
  }

  function separate() {
    const detach = (obj, vel, spin) => {
      obj.updateWorldMatrix(true, false);
      padWorld.attach(obj);
      debris.push({ obj, vel, spin, age: 0 });
    };
    boosters.forEach((b, i) => {
      detach(b, new THREE.Vector3(i ? 2.4 : -2.4, 1.2, 0.6), new THREE.Vector3(rand(-1.4, 1.4), rand(-1, 1), rand(-1.4, 1.4)));
    });
    boosters = [];
    if (lowerStage && lowerStage.parent === rocketRoot) {
      detach(lowerStage, new THREE.Vector3(0.7, -1.5, 0.4), new THREE.Vector3(0.5, 0.2, 0.8));
      lowerStage = null;
    }
    if (plume) { plume.visible = false; plume = null; }
    if (engineLight) { engineLight.intensity = 0; engineLight = null; }
  }

  function updateSeparated(dt) {
    if (!debris.length) return;
    debris = debris.filter((d) => {
      d.age += dt;
      d.obj.position.addScaledVector(d.vel, dt);
      d.vel.y -= 0.7 * dt;
      d.obj.rotation.x += d.spin.x * dt;
      d.obj.rotation.y += d.spin.y * dt;
      d.obj.rotation.z += d.spin.z * dt;
      if (d.age > 3.2) d.obj.visible = false;
      if (d.age > 4.2) {
        disposeGroup(d.obj);
        return false;
      }
      return true;
    });
  }

  function deployFairing() {
    fairingHalves.forEach((h, i) => {
      h.userData.open = true;
      h.userData.dir = i ? 1 : -1;
      h.userData.age = 0;
    });
  }

  function updateFairing(dt) {
    fairingHalves.forEach((h) => {
      if (!h.userData.open) return;
      h.userData.age += dt;
      const a = Math.min(1, h.userData.age / 1.1);
      const e = 1 - Math.pow(1 - a, 3);
      h.position.x = h.userData.dir * e * 2.2;
      h.position.y = e * 0.5;
      h.position.z = -e * 0.8;
      h.rotation.z = h.userData.dir * e * 0.8;
      h.rotation.y = h.userData.dir * e * 0.5;
      if (a >= 0.7) {
        h.traverse((o) => {
          if (o.material && o.material.transparent) {
            if (o.userData.baseOpacity === undefined) o.userData.baseOpacity = o.material.opacity;
            o.material.opacity = Math.max(0, o.userData.baseOpacity * (1 - (a - 0.7) / 0.3));
          }
        });
      }
    });
  }

  function deployArrays() {
    satArrays.forEach((a) => { a.deployed = true; });
  }

  function updateArrays(dt) {
    if (!orbitWorld.visible) return;
    satArrays.forEach((a) => {
      const target = a.deployed ? 0 : a.side * Math.PI * 0.48;
      a.group.rotation.z = damp(a.group.rotation.z, target, 3.2, dt);
    });
    if (satBeacon) satBeacon.material.opacity = 0.35 + Math.abs(Math.sin(clock * 2.2)) * 0.65;
  }

  function toOrbit() {
    if (!launch || launch.swapped) return;
    launch.swapped = true;

    /* Embedded in the merged site: the host crossfades into its own orbit
       scene at this beat, so the ascent must not fade to black or swap in a
       second satellite underneath the crossfade. */
    if (document.body.classList.contains("mc-embed")) {
      if (window.MA_BRIDGE && window.MA_BRIDGE.onOrbit) window.MA_BRIDGE.onOrbit();
      return;
    }

    if (fadeEl) fadeEl.style.opacity = "1";
    window.setTimeout(() => {
      orbitWorld.visible = true;
      padWorld.visible = false;
      setComposition("orbit");
      setBody(mission.body);
      setLighting("orbit");
      if (fadeEl) fadeEl.style.opacity = "0";
    }, reduced ? 60 : 220);
  }

  /* ---------- public ---------- */
  function init(opts) {
    opts = opts || {};
    onFail = opts.onFail;
    telemetryCb = opts.onTelemetry;
    phaseCb = opts.onPhase;
    completeCb = opts.onComplete;
    canvas = opts.canvas;
    stage = opts.stage;
    fadeEl = opts.fade;
    reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    lowFX = window.matchMedia("(max-width: 760px)").matches || (navigator.deviceMemory && navigator.deviceMemory < 4);

    try {
      const test = document.createElement("canvas");
      const gl = test.getContext("webgl2") || test.getContext("webgl") || test.getContext("experimental-webgl");
      if (!gl) throw new Error("no webgl");
      if (!THREE) throw new Error("no three");
      renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowFX, alpha: true, powerPreference: "high-performance" });
    } catch (e) {
      if (onFail) onFail(String(e && e.message || e));
      return false;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowFX ? 1.25 : 1.75));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.98;
    renderer.shadowMap.enabled = !lowFX;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x04070d, 0);

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x04070d, 22, 92);

    const envTex = makeEnv();
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      pmrem.compileEquirectangularShader();
      const envRT = pmrem.fromEquirectangular(envTex);
      scene.environment = envRT.texture;
      envTex.dispose();
      pmrem.dispose();
    } catch (e) {
      scene.environment = envTex;
    }

    camera = new THREE.PerspectiveCamera(38, 1, 0.1, 700);
    camera.position.copy(camPos);

    const hemi = new THREE.HemisphereLight(0x9fc4e8, 0x0a1119, 0.5);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffe6cc, 1.5);
    key.position.set(9, 15, 9);
    key.castShadow = !lowFX;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -12;
    key.shadow.camera.right = 12;
    key.shadow.camera.top = 16;
    key.shadow.camera.bottom = -2;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 40;
    key.shadow.bias = -0.001;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x5fd3ff, 1.15);
    rim.position.set(-8, 6, -10);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(0xff8a3d, 0.28);
    fill.position.set(-4, 2, 6);
    scene.add(fill);
    lights = { hemi, key, rim, fill };
    setLighting("pad");

    buildSky();
    buildStars();
    buildPad();
    buildOrbitWorld();
    buildRocket(D.missions[0], D.missions[0].defaultDesign);
    setBody("earth");

    resize();
    if (window.ResizeObserver) {
      resizeObs = new ResizeObserver(resize);
      resizeObs.observe(stage);
    } else {
      window.addEventListener("resize", resize);
    }
    if (window.IntersectionObserver && stage) {
      visObs = new IntersectionObserver((entries) => {
        entries.forEach((en) => { if (en.isIntersecting) start(); else stop(); });
      }, { threshold: 0 });
      visObs.observe(stage);
    }

    bindDrag();
    ready = true;
    start();
    setComposition("title");
    return true;
  }

  function resize() {
    if (!renderer || !stage) return;
    W = Math.max(1, stage.clientWidth);
    H = Math.max(1, stage.clientHeight);
    camera.aspect = W / H;
    camera.fov = W < 640 ? 46 : 38;
    camera.updateProjectionMatrix();
    renderer.setSize(W, H, false);
  }

  function bindDrag() {
    canvas.addEventListener("pointerdown", (e) => {
      dragging = true;
      lastPX = e.clientX; lastPY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = "grabbing";
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastPX;
      const dy = e.clientY - lastPY;
      lastPX = e.clientX; lastPY = e.clientY;
      if (orbitWorld.visible) {
        orbitYaw -= dx * 0.006;
      } else {
        yaw -= dx * 0.006;
        pitch = clamp(pitch + dy * 0.004, -0.08, 0.72);
      }
    });
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      camDist = clamp(camDist + (e.deltaY > 0 ? 0.07 : -0.07), 0.5, 1.9);
    }, { passive: false });
    const end = (e) => {
      dragging = false;
      canvas.style.cursor = "grab";
      if (e && e.pointerId !== undefined && canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("pointerleave", (e) => { if (dragging) end(e); });
  }

  function setDesign(missionDef, designObj) {
    mission = missionDef;
    design = designObj;
    if (!ready) return;
    currentBody = missionDef.body;
    if (orbitWorld.visible) setBody(missionDef.body);
    buildRocket(missionDef, designObj);
    buildSatellite();
    setBody(missionDef.body);
  }

  function resetWorld(silent) {
    launch = null;
    debris.forEach((d) => disposeGroup(d.obj));
    debris = [];
    if (orbitWorld) orbitWorld.visible = false;
    if (padWorld) padWorld.visible = true;
    if (satArrays.length) satArrays.forEach((a) => { a.group.rotation.z = a.side * Math.PI * 0.48; a.deployed = false; });
    if (fadeEl) fadeEl.style.opacity = "0";
    shake = 0;
    fovBoost = 0;
    setLighting("pad");
    if (!silent) {
      buildRocket(mission || D.missions[0], design || D.missions[0].defaultDesign);
      setBody((mission || D.missions[0]).body);
      camMode = "pad";
      setComposition("design");
    }
  }

  function reset() {
    if (!ready) return;
    resetWorld(false);
    camPos.set(9, 6, 12);
    camLook.set(1.3, 4.2, 0);
    yaw = 0.58; pitch = 0.2;
  }

  function skip() {
    if (!launch || !launch.active) return;
    if (!launch.swapped) toOrbit();
    deployFairing();
    deployArrays();
    launch.t = launch.dur;
    launch.phase = "COMPLETE";
    launch.complete = true;
    fireComplete();
  }

  function start() {
    if (running || !ready) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }
  function tick(now) {
    if (!running) return;
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    clock += dt;

    if (launch && launch.active) {
      stepLaunch(dt);
      if (launch.complete && !launch.active) launch = null;
    } else {
      padRings.forEach((r, i) => { r.rotation.z += dt * (i ? -0.12 : 0.2); });
      if (towerBeacon) towerBeacon.material.opacity = 0.45 + Math.sin(clock * 3) * 0.35;
      if (plume) plume.visible = false;
      if (engineLight) engineLight.intensity = 0;
    }

    updateSmoke(dt);
    updateCamera(dt);
    if (orbitWorld && orbitWorld.visible) {
      bodyMesh.rotation.y += dt * 0.012;
      if (cloudMesh && cloudMesh.visible) cloudMesh.rotation.y += dt * 0.018;
      if (cloud2 && cloud2.visible) cloud2.rotation.y -= dt * 0.011;
      if (satellite) satellite.rotation.y = Math.sin(clock * 0.25) * 0.08;
      orbitRings.forEach((r, i) => { r.material.opacity = (i ? 0.1 : 0.36) + Math.sin(clock * 0.8 + i) * 0.04; });
    }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  }

  window.MissionScene = {
    init, setDesign, setView, setComposition, launch: launchSequence,
    reset, skip, start, stop, setBody, nudge,
    isReady: () => ready,
    isLowFX: () => lowFX,
    __qa: () => {
      renderer.render(scene, camera);
      return { cam: camera.position.toArray().map(n => +n.toFixed(2)), sky: skyDome && { w: skyDome.material.map && skyDome.material.map.image.width, visible: skyDome.visible } };
    },
    __qaSky: (mode) => {
      if (!skyDome) return 0;
      if (mode === "off") skyDome.visible = false;
      if (mode === "red") { skyDome.material.map = null; skyDome.material.color.setHex(0xff0000); skyDome.material.needsUpdate = true; }
      if (mode === "dump") {
        const img = document.createElement("img");
        img.src = skyDome.material.map.image.toDataURL("image/png");
        img.style.cssText = "position:fixed;inset:0;width:100%;height:100%;z-index:9999;object-fit:contain;background:#000";
        document.body.appendChild(img);
      }
      renderer.render(scene, camera);
      return 1;
    },
  };
})();
