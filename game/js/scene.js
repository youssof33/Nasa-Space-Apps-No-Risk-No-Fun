/* ==========================================================================
   MISSION CONTROL — 3D scene
   three.js r160 (vendored). Real NASA imagery, no external assets beyond
   textures/ and vendor/. Works from file://.
   ========================================================================== */
window.Scene = (function () {
  const T = window.THREE;
  const D = window.DATA;

  let renderer, scene, camera, clock, canvas;
  let W = 1, H = 1, running = false;

  let sun, ambient, hemi, rim, camFill;
  let planetGroup, planet, clouds, atmo, nightLights;
  let orbitGroup, ring, ringGlow, craftHolder, craft, trail, plume;
  let stars, sunSprite;
  let station, stationHalo, beam, beamDots, scanCone, scanRing;

  let parts = null;
  let popT = 1;
  let wingSpan = 0.5, wingSpanTarget = 0.5;
  let dishT = 0, dishTarget = 0;
  let instShown = 1;
  let craftBase = 0.8;
  let designCraft = false;

  let flash = 0, shake = 0;
  let launchT = -1;
  let launchP = 0, launchPhase = "IGNITION";
  let launchPad = null, launchRig = null, launchFlags = null, launchDebris = [];
  let lastSpec = null;
  let opsActive = false;
  let opsT = 0;
  let shadow = 0;

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const camPos = new T.Vector3(0, 3.2, 9.4);
  const camLook = new T.Vector3(0, 0, 0);
  const tmpV = new T.Vector3();
  const tmpV2 = new T.Vector3();
  const UP = new T.Vector3(0, 1, 0);
  const NOSE = new T.Vector3(0, 0, 1);
  const SUN_DIR = new T.Vector3(9, 4.5, 7).normalize();

  const st = {
    body: "earth", orbit: "sso",
    bodyRNow: 1.5, bodyRTarget: 1.5,
    rNow: 2.3, rTarget: 2.3,
    angle: -0.5,
    ox: 0, oxTarget: 0,
    zoom: 1, zoomTarget: 1,
    lift: 0, liftTarget: 0,
    spin: 0.03,
  };

  const LAUNCH_DUR = 7.4;

  /* Arrival shot: 1 = wide orbit framing, 0 = normal chase camera. The merged
     site holds this wide while its crossfade runs, then releases it. */
  let arrival = 0;
  let arrivalHold = false;

  /* ------------------------------------------------------------- textures */
  const TEX = {};
  let loadTotal = 0, loadDone = 0, loadResolve = null;

  const FILES = {
    earthDay:    "textures/earth_atmos_4096.jpg",
    earthNormal: "textures/earth_normal_2048.jpg",
    earthSpec:   "textures/earth_specular_2048.jpg",
    clouds:      "textures/earth_clouds_1024.png",
    lights:      "textures/earth_lights_2048.png",
    moon:        "textures/moon_1024.jpg",
    mars:        "textures/mars_sss.jpg",
  };

  function preload(onProgress) {
    const loader = new T.TextureLoader();
    // undefined (not "anonymous") so file:// images are not blocked
    loader.crossOrigin = undefined;

    const keys = Object.keys(FILES);
    loadTotal = keys.length;
    loadDone = 0;

    return new Promise(resolve => {
      loadResolve = resolve;
      keys.forEach(k => {
        loader.load(FILES[k],
          tex => {
            tex.colorSpace = (k === "earthNormal" || k === "earthSpec")
              ? T.NoColorSpace : T.SRGBColorSpace;
            tex.anisotropy = 4;
            TEX[k] = tex;
            done();
          },
          undefined,
          () => { TEX[k] = fallbackTexture(k); done(); }
        );
      });
      // never hang the boot screen
      setTimeout(() => { if (loadDone < loadTotal) { loadDone = loadTotal; finish(); } }, 12000);
    });

    function done() {
      loadDone++;
      if (onProgress) onProgress(loadDone / loadTotal);
      if (loadDone >= loadTotal) finish();
    }
    function finish() {
      if (loadResolve) { const r = loadResolve; loadResolve = null; r(); }
    }
  }

  function fallbackTexture(kind) {
    const c = document.createElement("canvas");
    c.width = 512; c.height = 256;
    const g = c.getContext("2d");
    const base = kind === "mars" ? "#8c3b22" : kind === "moon" ? "#8f8f8f" : "#123a63";
    g.fillStyle = base; g.fillRect(0, 0, 512, 256);
    let seed = kind.length * 7919;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 160; i++) {
      const x = rnd() * 512, y = rnd() * 256, r = 6 + rnd() * 40;
      g.globalAlpha = 0.12 + rnd() * 0.22;
      g.fillStyle = kind === "earth"
        ? (rnd() > 0.55 ? "#2f6b3a" : "#0d2c4d")
        : (rnd() > 0.5 ? "#a5563a" : "#5e2a18");
      g.beginPath(); g.ellipse(x, y, r, r * 0.6, rnd() * 6.28, 0, 6.283); g.fill();
    }
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    return t;
  }

  /* --------------------------------------------------------------- helpers */
  function easeInOut(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }
  function smoothstep(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

  /* ------------------------------------------------------------- materials */
  function planetMaterials() {
    return {
      earth: new T.MeshPhongMaterial({
        map: TEX.earthDay || fallbackTexture("earth"),
        normalMap: TEX.earthNormal || null,
        normalScale: new T.Vector2(0.9, 0.9),
        specularMap: TEX.earthSpec || null,
        specular: new T.Color(0x2e5a86),
        shininess: 26,
      }),
      moon: new T.MeshPhongMaterial({
        map: TEX.moon || fallbackTexture("moon"),
        specular: new T.Color(0x111111),
        shininess: 3,
      }),
      mars: new T.MeshPhongMaterial({
        map: TEX.mars || fallbackTexture("mars"),
        specular: new T.Color(0x1a0d08),
        shininess: 5,
      }),
    };
  }

  const MATS = {};

  const ATMO = {
    earth: { color: 0x5aa9ff, intensity: 1.15, power: 3.0 },
    moon:  { color: 0x9a9a9a, intensity: 0.14, power: 3.4 },
    mars:  { color: 0xe08a58, intensity: 0.62, power: 3.2 },
  };

  // fill light is tuned per body: blue around Earth, neutral at the Moon, dusty
  // warm at Mars, so the spacecraft never looks like it is lit by Earth sky
  const LIGHTS = {
    earth: { amb: 0x24405f, ambI: 0.9,  hemi: 0x6f9fd8, hemiI: 0.55, fill: 0xa8c8ee, fillI: 0.9,  rim: 0x4a7fd4, rimI: 18 },
    moon:  { amb: 0x3b3b42, ambI: 0.55, hemi: 0x9a9aa2, hemiI: 0.30, fill: 0xcfd4dd, fillI: 0.75, rim: 0x8a8f9c, rimI: 8 },
    mars:  { amb: 0x4a2e26, ambI: 0.60, hemi: 0xc08a70, hemiI: 0.35, fill: 0xe8b596, fillI: 0.75, rim: 0xb06a44, rimI: 10 },
  };

  /* --------------------------------------------------------------- craft */
  function buildCraft(spec) {
    const g = new T.Group();
    const s = spec.busSize;

    const hull = new T.MeshStandardMaterial({ color: 0x93a1b6, metalness: 0.42, roughness: 0.52 });
    const gold = new T.MeshStandardMaterial({ color: 0xd8a63c, metalness: 0.9, roughness: 0.32, emissive: 0x1a1204 });
    const dark = new T.MeshStandardMaterial({ color: 0x2b3444, metalness: 0.6, roughness: 0.5 });
    const panelMat = new T.MeshStandardMaterial({
      color: 0x102c55, metalness: 0.5, roughness: 0.34,
      emissive: 0x0f3060, emissiveIntensity: 1.0,
    });

    const bw = 0.22 * s, bh = 0.19 * s, bd = 0.34 * s;

    const core = new T.Mesh(new T.BoxGeometry(bw, bh, bd), hull);
    g.add(core);

    const foil = new T.Mesh(new T.BoxGeometry(bw * 1.02, bh * 0.34, bd * 1.01), gold);
    foil.position.y = bh * 0.16;
    g.add(foil);

    // radiator fins
    [-1, 1].forEach(side => {
      const fin = new T.Mesh(new T.BoxGeometry(0.006, bh * 0.5, bd * 0.7), dark);
      fin.position.set(side * bw * 0.51, 0, 0);
      g.add(fin);
    });

    // solar wings — pivot at the hull edge, panel extends outward
    const wings = [];
    [-1, 1].forEach(side => {
      const pivot = new T.Group();
      pivot.position.set(side * bw * 0.5, 0, 0);
      const panel = new T.Mesh(new T.BoxGeometry(1, 0.014 * s, bd * 0.42), panelMat);
      panel.position.x = side * 0.5;
      pivot.add(panel);
      // cell lines
      for (let i = 1; i < 6; i++) {
        const line = new T.Mesh(new T.BoxGeometry(0.004, 0.011 * s, bd * 0.42), dark);
        line.position.x = side * (i / 6);
        pivot.add(line);
      }
      g.add(pivot);
      wings.push({ pivot, side });
    });

    // high-gain dish
    const dishGrp = new T.Group();
    dishGrp.position.set(0, bh * 0.52, 0);
    const dishMat = new T.MeshStandardMaterial({
      color: 0xd7dfea, metalness: 0.5, roughness: 0.4, side: T.DoubleSide,
    });
    const dish = new T.Mesh(new T.ConeGeometry(0.13 * s, 0.055 * s, 26, 1, true), dishMat);
    dish.rotation.x = Math.PI;          // concave side faces up
    dishGrp.add(dish);
    const feed = new T.Mesh(new T.CylinderGeometry(0.008 * s, 0.008 * s, 0.13 * s, 8), dark);
    feed.position.y = 0.075 * s;
    dishGrp.add(feed);
    const feedTip = new T.Mesh(new T.SphereGeometry(0.016 * s, 8, 6), gold);
    feedTip.position.y = 0.14 * s;
    dishGrp.add(feedTip);
    g.add(dishGrp);

    // instrument deck
    const instruments = [];
    for (let i = 0; i < 4; i++) {
      const box = new T.Mesh(new T.BoxGeometry(0.05 * s, 0.05 * s, 0.05 * s), dark);
      box.position.set((i - 1.5) * 0.058 * s, -bh * 0.62, 0);
      box.scale.setScalar(0.001);
      g.add(box);
      instruments.push(box);
    }

    // engine
    const nozzle = new T.Mesh(new T.ConeGeometry(0.055 * s, 0.1 * s, 16, 1, true), dark);
    nozzle.position.set(0, 0, -bd * 0.62);
    nozzle.rotation.x = -Math.PI / 2;
    g.add(nozzle);

    // RCS quads
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const th = new T.Mesh(new T.BoxGeometry(0.02 * s, 0.02 * s, 0.02 * s), dark);
      th.position.set(Math.cos(a) * bw * 0.55, Math.sin(a) * bh * 0.55, bd * 0.42);
      g.add(th);
    }

    // exhaust plume
    const pm = new T.MeshBasicMaterial({
      color: 0x8fd0ff, transparent: true, opacity: 0,
      blending: T.AdditiveBlending, depthWrite: false,
    });
    const plumeMesh = new T.Mesh(new T.ConeGeometry(0.07 * s, 0.4 * s, 14, 1, true), pm);
    plumeMesh.position.set(0, 0, -bd * 0.62 - 0.2 * s);
    plumeMesh.rotation.x = -Math.PI / 2;
    g.add(plumeMesh);

    return { group: g, wings, dishGrp, instruments, plume: plumeMesh };
  }

  function setCraft(spec) {
    // spec: { busSize, arrayW, commsMbps, instrumentCount, prop }
    // spec.design: the workbench's own assembly, rebuilt by design-craft.js
    if (!craftHolder) return;
    lastSpec = spec;

    designCraft = Boolean(spec.design && window.MCDesignCraft);
    const built = designCraft
      ? window.MCDesignCraft.build(spec.design)
      : buildCraft(spec);
    if (craft) {
      craftHolder.remove(craft);
      // every part is built fresh, so free the old GPU buffers — hover previews
      // rebuild the craft often
      craft.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
      });
    }
    craft = built.group;
    parts = built;
    craftHolder.add(craft);

    if (designCraft) {
      craftBase = 0.42;
      wingSpanTarget = Math.max(0.04, spec.design.solarDeploy || 0.04);
      dishTarget = spec.design.antennaGain != null ? 1 : 0;
      instShown = spec.design.instruments.filter(Boolean).length;
      wingSpan = wingSpanTarget;
      dishT = dishTarget;
    } else {
      craftBase = 0.8;
      wingSpanTarget = 0.3 + Math.min(0.45, spec.arrayW / 3000 * 0.45);
      dishTarget = spec.commsMbps >= 50 ? 1 : spec.commsMbps >= 2 ? 0.55 : 0;
      instShown = Math.max(1, Math.min(4, spec.instrumentCount));
      if (wingSpan < 0.2) wingSpan = wingSpanTarget;
    }
    popT = 0;

    if (parts.plume) {
      parts.plume.material.color.setHex(spec.prop === "ep" ? 0x9ad6ff : 0xffb066);
    }
    // dt 0 keeps popT at the start of the spring so the next frames animate the
    // change instead of snapping to the final size
    applyCraftVisual(0, 0);
  }

  function applyCraftVisual(dt, t) {
    if (!parts || !craft) return;

    // elastic pop when the design changes
    popT = Math.min(1, popT + dt * 2.6);
    const e = popT < 1 ? 1 + 0.16 * Math.sin(popT * Math.PI) * (1 - popT) * 3 : 1;
    craft.scale.setScalar(craftBase * (popT < 1 ? (0.82 + 0.18 * (1 - Math.pow(1 - popT, 3))) * e : 1));

    // the workbench model has its own slow spin and wing tilt
    if (designCraft && parts.spin) {
      parts.spin.rotation.y += dt * 0.045;
      parts.spin.rotation.z = Math.sin(t * 0.22) * 0.018;
      if (parts.solarTilt) parts.solarTilt.rotation.x = Math.sin(t * 0.32) * 0.09;
    }

    // wings deploy (and stay folded while the payload fairing is on)
    const stowed = launchT >= 0 && launchRig && launchRig.fairing.length > 0;
    wingSpan += ((stowed ? 0.02 : wingSpanTarget) - wingSpan) * Math.min(1, dt * (stowed ? 22 : 6));
    parts.wings.forEach(w => { w.pivot.scale.x = Math.max(0.001, wingSpan); });

    // dish rotates up into place
    if (parts.dishGrp) {
      dishT += (dishTarget - dishT) * Math.min(1, dt * 5);
      parts.dishGrp.scale.setScalar(Math.max(0.001, dishT));
      parts.dishGrp.rotation.z = (1 - dishT) * 0.8;
    }

    // instruments appear one by one
    parts.instruments.forEach((box, i) => {
      box.visible = i < instShown;
      const target = i < instShown ? 1 : 0;
      box.scale.lerp(new T.Vector3(target, target, target), Math.min(1, dt * 8));
    });

    // plume flicker
    if (parts.plume) {
      const active = launchT >= 0 || opsActive;
      const flick = 0.72 + Math.random() * 0.28;
      parts.plume.material.opacity = active ? (launchT >= 0 ? 0.85 : 0.28) * flick : 0;
      parts.plume.scale.set(flick, 1 + Math.random() * 0.3, flick);
    }
  }

  /* --------------------------------------------------------------- build */
  function init(cv) {
    canvas = cv;
    renderer = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;

    scene = new T.Scene();
    camera = new T.PerspectiveCamera(40, 1, 0.05, 600);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    clock = new T.Clock();

    sun = new T.DirectionalLight(0xfff6e8, 2.9);
    sun.position.copy(SUN_DIR).multiplyScalar(30);
    scene.add(sun);

    ambient = new T.AmbientLight(0x24405f, 0.9);
    scene.add(ambient);

    hemi = new T.HemisphereLight(0x6f9fd8, 0x0a1018, 0.55);
    scene.add(hemi);

    // headlight so the camera-facing side of the spacecraft is never black
    scene.add(camera);
    camFill = new T.DirectionalLight(0xa8c8ee, 0.9);
    camFill.position.set(0, 0, 1);
    camFill.target.position.set(0, 0, -1);
    camera.add(camFill);
    camera.add(camFill.target);

    rim = new T.PointLight(0x4a7fd4, 18, 60, 2);
    rim.position.set(-9, -4, -10);
    scene.add(rim);

    // ---- stars
    const N = 3200;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    let seed = 12345;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < N; i++) {
      const r = 90 + rnd() * 160;
      const th = rnd() * Math.PI * 2;
      const ph = Math.acos(2 * rnd() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph);
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
      const t = 0.6 + rnd() * 0.4;
      col[i * 3] = t * (0.86 + rnd() * 0.14);
      col[i * 3 + 1] = t * (0.9 + rnd() * 0.1);
      col[i * 3 + 2] = t;
    }
    const sg = new T.BufferGeometry();
    sg.setAttribute("position", new T.BufferAttribute(pos, 3));
    sg.setAttribute("color", new T.BufferAttribute(col, 3));
    stars = new T.Points(sg, new T.PointsMaterial({
      size: 0.55, sizeAttenuation: true, vertexColors: true,
      transparent: true, opacity: 0.95, depthWrite: false,
    }));
    scene.add(stars);

    // ---- planet
    Object.assign(MATS, planetMaterials());

    planetGroup = new T.Group();
    scene.add(planetGroup);

    planet = new T.Mesh(new T.SphereGeometry(1, 128, 96), MATS.earth);
    planetGroup.add(planet);

    // night lights, masked to the dark hemisphere
    nightLights = new T.Mesh(
      new T.SphereGeometry(1.002, 96, 64),
      new T.ShaderMaterial({
        uniforms: {
          uMap: { value: TEX.lights || fallbackTexture("earth") },
          uSun: { value: SUN_DIR.clone() },
          uIntensity: { value: 3.1 },
        },
        vertexShader: `
          varying vec2 vUv; varying vec3 vN;
          void main(){
            vUv = uv;
            vN = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
          }`,
        fragmentShader: `
          uniform sampler2D uMap; uniform vec3 uSun; uniform float uIntensity;
          varying vec2 vUv; varying vec3 vN;
          void main(){
            float d = dot(normalize(vN), normalize(uSun));
            float night = smoothstep(0.12, -0.28, d);
            vec3 c = texture2D(uMap, vUv).rgb;
            gl_FragColor = vec4(c * night * uIntensity, 1.0);
          }`,
        transparent: true, blending: T.AdditiveBlending, depthWrite: false,
      })
    );
    nightLights.renderOrder = 1;
    planetGroup.add(nightLights);

    clouds = new T.Mesh(
      new T.SphereGeometry(1.012, 96, 64),
      new T.MeshLambertMaterial({
        map: TEX.clouds || null,
        transparent: true, opacity: 0.9, depthWrite: false,
      })
    );
    clouds.renderOrder = 2;
    planetGroup.add(clouds);

    atmo = new T.Mesh(
      new T.SphereGeometry(1, 96, 64),
      new T.ShaderMaterial({
        uniforms: {
          uColor: { value: new T.Color(ATMO.earth.color) },
          uPower: { value: ATMO.earth.power },
          uIntensity: { value: ATMO.earth.intensity },
          uSun: { value: SUN_DIR.clone() },
        },
        vertexShader: `
          varying vec3 vN; varying vec3 vW;
          void main(){
            vN = normalize(mat3(modelMatrix) * normal);
            vec4 w = modelMatrix * vec4(position,1.0);
            vW = w.xyz;
            gl_Position = projectionMatrix * viewMatrix * w;
          }`,
        fragmentShader: `
          uniform vec3 uColor; uniform float uPower; uniform float uIntensity; uniform vec3 uSun;
          varying vec3 vN; varying vec3 vW;
          void main(){
            vec3 v = normalize(cameraPosition - vW);
            float rim = pow(1.0 - abs(dot(normalize(vN), v)), uPower);
            float lit = smoothstep(-0.45, 0.5, dot(normalize(vN), normalize(uSun)));
            gl_FragColor = vec4(uColor, rim * uIntensity * (0.3 + 0.7 * lit));
          }`,
        transparent: true, blending: T.AdditiveBlending, depthWrite: false,
      })
    );
    atmo.renderOrder = 3;
    planetGroup.add(atmo);

    buildStation();

    // ---- orbit
    orbitGroup = new T.Group();
    scene.add(orbitGroup);

    ring = new T.Mesh(
      new T.TorusGeometry(1, 0.0055, 8, 260),
      new T.MeshBasicMaterial({ color: 0x4f96e0, transparent: true, opacity: 0.42,
        blending: T.AdditiveBlending, depthWrite: false })
    );
    ring.rotation.x = Math.PI / 2;
    orbitGroup.add(ring);

    ringGlow = new T.Mesh(
      new T.TorusGeometry(1, 0.026, 8, 260),
      new T.MeshBasicMaterial({ color: 0x2f6fb8, transparent: true, opacity: 0.13,
        blending: T.AdditiveBlending, depthWrite: false })
    );
    ringGlow.rotation.x = Math.PI / 2;
    orbitGroup.add(ringGlow);

    craftHolder = new T.Group();
    orbitGroup.add(craftHolder);

    // ---- trail
    const tgeo = new T.BufferGeometry();
    tgeo.setAttribute("position", new T.BufferAttribute(new Float32Array(220 * 3), 3));
    tgeo.setAttribute("color", new T.BufferAttribute(new Float32Array(220 * 3), 3));
    tgeo.setDrawRange(0, 0);
    trail = new T.Line(
      tgeo,
      new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7,
        blending: T.AdditiveBlending, depthWrite: false })
    );
    trail.frustumCulled = false;
    orbitGroup.add(trail);

    // ---- ops props
    buildBeam();
    buildScan();

    setTarget("sso");
    setCraft({ busSize: 0.85, arrayW: 60, commsMbps: 0.1, instrumentCount: 1, prop: "chem" });

    window.addEventListener("resize", resize);
    canvas.addEventListener("pointermove", onPointer);
    canvas.addEventListener("pointerleave", () => { pointer.tx = 0; pointer.ty = 0; });

    resize();
    running = true;
    loop();
    return Scene;
  }

  /* ------------------------------------------------------------- station */
  function buildStation() {
    station = new T.Group();
    const s = 0.1;
    const metal = new T.MeshStandardMaterial({ color: 0xb8c4d6, metalness: 0.6, roughness: 0.45 });
    const glow = new T.MeshBasicMaterial({ color: 0x5aa9ff, transparent: true, opacity: 0.85,
      blending: T.AdditiveBlending, depthWrite: false });

    const base = new T.Mesh(new T.CylinderGeometry(0.3 * s, 0.42 * s, 0.12 * s, 16), metal);
    base.position.y = 0.06 * s;
    station.add(base);

    const mast = new T.Mesh(new T.CylinderGeometry(0.035 * s, 0.045 * s, 0.7 * s, 10), metal);
    mast.position.y = 0.45 * s;
    station.add(mast);

    const dish = new T.Mesh(new T.SphereGeometry(0.26 * s, 20, 12, 0, Math.PI * 2, 0, 1.0), metal);
    dish.position.set(0, 0.8 * s, 0.04 * s);
    dish.rotation.x = -0.9;
    station.add(dish);

    const halo = new T.Mesh(new T.TorusGeometry(0.55 * s, 0.022 * s, 8, 48), glow);
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 0.02 * s;
    station.add(halo);
    stationHalo = halo;

    // placed on the surface at ~28°N
    station.userData.lat = 28 * Math.PI / 180;
    station.userData.lon = -0.4;
    planetGroup.add(station);
    placeStation();
  }

  function placeStation() {
    if (!station) return;
    const lat = station.userData.lat, lon = station.userData.lon;
    // planetGroup is scaled to the body radius, so this is in unit-sphere space
    const p = new T.Vector3(
      Math.cos(lat) * Math.cos(lon),
      Math.sin(lat),
      Math.cos(lat) * Math.sin(lon)
    );
    station.position.copy(p);
    station.quaternion.setFromUnitVectors(UP, p.clone().normalize());
    station.scale.setScalar(0.42);
    station.visible = true;
  }

  /* ---------------------------------------------------------------- beam */
  function buildBeam() {
    const N = 48;
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.BufferAttribute(new Float32Array(N * 3), 3));
    g.setDrawRange(0, N);
    beam = new T.Line(g, new T.LineBasicMaterial({
      color: 0x7fe3ff, transparent: true, opacity: 0,
      blending: T.AdditiveBlending, depthWrite: false,
    }));
    beam.frustumCulled = false;
    scene.add(beam);

    // data packets running down the link
    const DOTS = 22;
    const dg = new T.BufferGeometry();
    dg.setAttribute("position", new T.BufferAttribute(new Float32Array(DOTS * 3), 3));
    beamDots = new T.Points(dg, new T.PointsMaterial({
      color: 0xaef0ff, size: 0.09, sizeAttenuation: true,
      transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false,
    }));
    beamDots.frustumCulled = false;
    beamDots.userData.count = DOTS;
    scene.add(beamDots);
  }

  function buildScan() {
    scanCone = new T.Mesh(
      new T.ConeGeometry(1, 1, 48, 1, true),
      new T.ShaderMaterial({
        uniforms: {
          uColor: { value: new T.Color(0x6fdcff) },
          uI: { value: 0 },
        },
        vertexShader: `
          varying vec3 vLocal;
          void main(){
            vLocal = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          uniform vec3 uColor; uniform float uI;
          varying vec3 vLocal;
          void main(){
            // y runs -0.5 (ground footprint) to +0.5 (spacecraft)
            float t = clamp(vLocal.y + 0.5, 0.0, 1.0);
            float fade = pow(1.0 - t, 1.7);
            float band = 0.55 + 0.45 * sin(t * 14.0);
            gl_FragColor = vec4(uColor * (0.7 + 0.5 * band), fade * uI);
          }`,
        transparent: true, blending: T.AdditiveBlending,
        depthWrite: false, side: T.DoubleSide,
      })
    );
    scanCone.frustumCulled = false;
    scene.add(scanCone);

    scanRing = new T.Mesh(
      new T.TorusGeometry(1, 0.02, 8, 64),
      new T.MeshBasicMaterial({
        color: 0x9be8ff, transparent: true, opacity: 0,
        blending: T.AdditiveBlending, depthWrite: false,
      })
    );
    scanRing.frustumCulled = false;
    scene.add(scanRing);
  }

  /* ---------------------------------------------------------------- orbit */
  function applyOrbit() {
    const orb = D.ORBIT.find(o => o.id === st.orbit) || D.ORBIT[0];
    st.inc = orb.inc;
    orbitGroup.rotation.set(
      T.MathUtils.degToRad(90 - orb.inc),
      0,
      T.MathUtils.degToRad(orb.inc * 0.12)
    );
    ring.scale.setScalar(st.rNow);
    ringGlow.scale.setScalar(st.rNow);
  }

  function setTarget(orbitId) {
    const orb = D.ORBIT.find(o => o.id === orbitId) || D.ORBIT[0];
    const body = D.BODY[orb.body];
    st.orbit = orbitId;
    st.body = orb.body;
    st.rTarget = body.radius * orb.rMul;
    st.bodyRTarget = body.radius;
    st.spin = body.spin;

    planet.material = MATS[orb.body] || MATS.earth;
    planet.material.needsUpdate = true;

    clouds.visible = orb.body === "earth";
    nightLights.visible = orb.body === "earth";

    const a = ATMO[orb.body] || ATMO.earth;
    atmo.material.uniforms.uColor.value.setHex(a.color);
    atmo.material.uniforms.uIntensity.value = a.intensity;
    atmo.material.uniforms.uPower.value = a.power;

    const L = LIGHTS[orb.body] || LIGHTS.earth;
    ambient.color.setHex(L.amb); ambient.intensity = L.ambI;
    hemi.color.setHex(L.hemi); hemi.intensity = L.hemiI;
    camFill.color.setHex(L.fill); camFill.intensity = L.fillI;
    rim.color.setHex(L.rim); rim.intensity = L.rimI;

    if (orb.body !== st.bodyPrev) {
      flash = 1;
      shake = 0.4;
    }
    st.bodyPrev = orb.body;

    applyOrbit();
    placeStation();
  }

  /* --------------------------------------------------------------- camera */
  function onPointer(e) {
    const r = canvas.getBoundingClientRect();
    pointer.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    pointer.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
  }

  function resize() {
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  }

  /* ----------------------------------------------------------------- loop */
  let trailPts = [];

  function loop() {
    if (!running) return;
    requestAnimationFrame(loop);
    step(Math.min(0.05, clock.getDelta()));
  }

  let simTime = 0;

  function step(dt) {
    simTime += dt;
    const t = simTime;

    if (!arrivalHold && arrival > 0.001) {
      arrival += (0 - arrival) * Math.min(1, dt * 1.15);
    }

    st.bodyRNow += (st.bodyRTarget - st.bodyRNow) * Math.min(1, dt * 4);
    st.rNow += (st.rTarget - st.rNow) * Math.min(1, dt * 3);
    planetGroup.scale.setScalar(st.bodyRNow);
    atmo.scale.setScalar(1.055);
    clouds.scale.setScalar(1.012);
    nightLights.scale.setScalar(1.002);
    ring.scale.setScalar(st.rNow);
    ringGlow.scale.setScalar(st.rNow);

    planetGroup.rotation.y += dt * st.spin;
    stars.rotation.y += dt * 0.0025;

    // ---- craft motion
    let pos, dir;
    const r = st.rNow;

    if (launchT >= 0) {
      launchT += dt / LAUNCH_DUR;
      const p = Math.min(1, launchT);
      // Shady's sequence holds the vehicle down for the first 11% of the clock
      const q = Math.max(0, (p - 0.11) / 0.89);
      const alt = st.bodyRNow * 1.04 + (r - st.bodyRNow * 1.04) * easeInOut(q);
      const ang = q * q * 2.4;
      st.angle = ang;
      pos = new T.Vector3(Math.cos(ang) * alt, 0, Math.sin(ang) * alt);
      const tangent = new T.Vector3(-Math.sin(ang), 0, Math.cos(ang));
      const up = pos.clone().normalize();
      dir = up.lerp(tangent, smoothstep(0.02, 0.4, q)).normalize();
      stepLaunchProps(dt, p);
      if (p >= 1) { launchT = -1; trailPts = []; }
    } else {
      const speed = opsActive ? 0.30 : 0.17;
      st.angle += dt * speed;
      const a = st.angle;
      pos = new T.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
      dir = new T.Vector3(-Math.sin(a), 0, Math.cos(a));
    }

    craft.position.copy(pos);
    // stable attitude: nose along velocity, wings rolled to catch the light
    const fwd = dir.clone().normalize();
    const upRef = Math.abs(fwd.dot(UP)) > 0.98 ? new T.Vector3(1, 0, 0) : UP;
    const right = new T.Vector3().crossVectors(upRef, fwd).normalize();
    const realUp = new T.Vector3().crossVectors(fwd, right).normalize();
    craft.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(right, realUp, fwd));
    craft.rotateZ(0.18 + Math.sin(t * 0.5) * 0.04);

    applyCraftVisual(dt, t);

    // world-space position, used by the ops props and the camera (the craft
    // lives inside the rotated orbitGroup)
    const craftWorld = new T.Vector3();
    craft.getWorldPosition(craftWorld);

    // ---- trail
    if (launchT >= 0 || opsActive) {
      trailPts.push(pos.clone());
      if (trailPts.length > 220) trailPts.shift();
      const arr = trail.geometry.attributes.position.array;
      const col = trail.geometry.attributes.color.array;
      const n = trailPts.length;
      trailPts.forEach((p, i) => {
        arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z;
        // additive fade: the tail dissolves into black instead of ending in a hard line
        const k = Math.pow(i / Math.max(1, n - 1), 2.1);
        col[i * 3] = 0.42 * k;
        col[i * 3 + 1] = 0.78 * k;
        col[i * 3 + 2] = 1.0 * k;
      });
      trail.geometry.setDrawRange(0, n);
      trail.geometry.attributes.position.needsUpdate = true;
      trail.geometry.attributes.color.needsUpdate = true;
      trail.material.opacity = launchT >= 0 ? 0.85 : 0.3;
    } else if (trailPts.length) {
      trailPts = [];
      trail.geometry.setDrawRange(0, 0);
    }

    // ---- shadow (is the craft behind the planet?)
    tmpV.copy(pos).normalize();
    const sunDot = tmpV.dot(SUN_DIR);
    const wantShadow = opsActive && sunDot < -0.05 ? 1 : 0;
    shadow += (wantShadow - shadow) * Math.min(1, dt * 2.5);
    // keep the planet readable in eclipse — this is a game, not a photometer
    sun.intensity = 2.9 - shadow * 0.85;
    ambient.intensity = 0.9 + shadow * 0.25;
    hemi.intensity = 0.55 - shadow * 0.12;

    // ---- ops props
    updateOps(dt, t, pos);

    // ---- camera
    updateCamera(dt, t, craftWorld);

    flash *= 0.9;
    renderer.toneMappingExposure = 1.12 + flash * 0.55;

    renderer.render(scene, camera);
  }

  function updateOps(dt, t, craftLocal) {
    const on = opsActive && launchT < 0;
    opsT += dt;

    // the craft lives inside orbitGroup, which is rotated — everything drawn in
    // the scene root must be in world space or the cone/beam miss it entirely
    const craftPos = new T.Vector3();
    craft.getWorldPosition(craftPos);

    const bodyR = st.bodyRNow;
    const up = craftPos.clone().normalize();
    const surface = up.clone().multiplyScalar(bodyR);

    // the ground station slides under the pass while the spacecraft is working,
    // a little behind the ground track so the downlink reads as its own line
    if (on && station) {
      const fwd = new T.Vector3(0, 0, 1).applyQuaternion(craft.quaternion);
      const dir = up.clone().addScaledVector(fwd, -0.34).normalize();
      const local = dir.applyQuaternion(planetGroup.quaternion.clone().invert());
      station.position.lerp(local, Math.min(1, dt * 1.6));
      station.quaternion.setFromUnitVectors(UP, station.position.clone().normalize());
    }

    // scan cone from the craft to the ground
    if (on) {
      const h = Math.max(0.15, craftPos.length() - bodyR);
      const radius = h * 0.52;
      scanCone.visible = true;
      scanCone.scale.set(radius, h, radius);
      scanCone.position.copy(craftPos).addScaledVector(up, -h * 0.5);
      scanCone.quaternion.setFromUnitVectors(UP, up);
      const pulse = 0.5 + 0.5 * Math.sin(t * 3.1);
      scanCone.material.uniforms.uI.value = 0.34 + pulse * 0.16;

      // expanding ring on the surface beneath the craft
      const ringPhase = (t * 0.55) % 1;
      scanRing.visible = true;
      scanRing.position.copy(surface).addScaledVector(up, 0.002);
      scanRing.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), up);
      const rs = radius * (0.45 + ringPhase * 1.15);
      scanRing.scale.setScalar(Math.max(0.001, rs));
      scanRing.material.opacity = (1 - ringPhase) * 0.45;
    } else {
      scanCone.visible = false;
      scanRing.visible = false;
    }

    // downlink beam to the ground station
    if (on && station) {
      const a = new T.Vector3();
      station.getWorldPosition(a);
      const b = craftPos.clone();
      const mid = a.clone().add(b).multiplyScalar(0.5).normalize().multiplyScalar(
        Math.max(a.length(), b.length()) * 1.06
      );
      // craft -> station, so the packets visibly stream toward the ground
      const curve = new T.QuadraticBezierCurve3(b, mid, a);
      const N = 48;
      const arr = beam.geometry.attributes.position.array;
      for (let i = 0; i < N; i++) {
        const p = curve.getPoint(i / (N - 1));
        arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z;
      }
      beam.geometry.attributes.position.needsUpdate = true;
      beam.material.opacity = (0.45 + 0.35 * Math.sin(t * 5.5)) * (1 - shadow * 0.7);

      // packets streaming toward the ground
      const dn = beamDots.userData.count;
      const da = beamDots.geometry.attributes.position.array;
      for (let i = 0; i < dn; i++) {
        const u = ((i / dn) + (t * 0.22) % 1) % 1;
        const p = curve.getPoint(u);
        da[i * 3] = p.x; da[i * 3 + 1] = p.y; da[i * 3 + 2] = p.z;
      }
      beamDots.geometry.attributes.position.needsUpdate = true;
      beamDots.material.opacity = 0.85 * (1 - shadow * 0.7);
    } else {
      beam.material.opacity = 0;
      if (beamDots) beamDots.material.opacity = 0;
    }

    // station halo pulse
    if (stationHalo) {
      const s = 1 + Math.sin(t * 2.4) * 0.12;
      stationHalo.scale.setScalar(s);
      stationHalo.material.opacity = on ? 0.6 + 0.3 * Math.sin(t * 2.4) : 0.25;
    }
  }

  const camUp = new T.Vector3(0, 1, 0);
  const wantUp = new T.Vector3(0, 1, 0);

  /* ------------------------------------------------------------ embed framing
     The merged site places its own panel next to the scene, so it asks for a
     composition instead of the game's default camera. The camera is placed from
     the body itself: the whole planet stays in frame and the craft sits in the
     middle of the free space. The standalone game never sets this. */
  let embedFocus = null;

  function setEmbedFocus(cfg) {
    embedFocus = cfg && cfg.mode ? cfg : null;
    if (embedFocus && camera) camera.updateProjectionMatrix();
  }

  function composeEmbedView(craftPos) {
    const cfg = embedFocus;
    const band = cfg.band || { left: 0, top: 0, right: W, bottom: H };
    const bandW = Math.max(120, band.right - band.left);
    const bandH = Math.max(120, band.bottom - band.top);
    const R = st.bodyRNow;
    const focal = H / 2 / Math.tan((camera.fov * Math.PI) / 360);

    /* Fit the orbit rather than the sphere in the brief, so the satellite and
       its ring never run under the panel. In orbit the sphere fills the frame. */
    const anchorR = cfg.fit === "orbit"
      ? Math.max(R, craftPos.length())
      : R;
    const radiusPx = Math.min(bandW * 0.43, bandH * 0.38);
    const dist = Math.max(anchorR * 1.6, (focal * anchorR) / radiusPx);

    const pos = new T.Vector3();
    const look = new T.Vector3();

    if (cfg.mode === "orbit") {
      /* Orbit shot: the camera sits on the craft's radial axis, so the craft
         reads dead centre with the whole body behind it. The distance comes
         from the disc size, not from the craft, so the planet is never cropped
         by the atmosphere glow. */
      const up = craftPos.clone().normalize();
      if (!isFinite(up.x) || up.lengthSq() < 0.5) up.set(0, 0, 1);
      const rc = Math.max(R * 1.05, craftPos.length());
      const discPx = Math.min(bandH * 0.34, bandW * 0.36);
      const D = Math.max(rc * 1.35, (focal * R) / Math.max(80, discPx));

      const side = new T.Vector3().crossVectors(up, UP);
      if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
      side.normalize();
      pos.copy(up).multiplyScalar(D).addScaledVector(side, D * 0.04);
      look.copy(up).multiplyScalar(rc);
      camera.up.set(0, 1, 0).applyQuaternion(craft.quaternion);
    } else {
      const dir = new T.Vector3(0.14, 0.44, 0.89).normalize();
      pos.copy(dir).multiplyScalar(dist);
      look.set(0, 0, 0);
      camera.up.set(0, 1, 0);
    }

    camera.position.copy(pos);
    camera.lookAt(look);
    camera.updateMatrixWorld();

    /* Slide the projection so the body sits in the free band, not the middle of
       the screen. A zero shift keeps the plain centred view. */
    camera.setViewOffset(
      W,
      H,
      Math.round(W / 2 - (band.left + band.right) / 2),
      Math.round(H / 2 - (band.top + band.bottom) / 2),
      W,
      H,
    );
    camera.updateProjectionMatrix();
  }

  function updateCamera(dt, t, craftPos) {
    const k = 1 - Math.exp(-dt * 2.6);
    st.ox += (st.oxTarget - st.ox) * Math.min(1, dt * 3);
    st.zoom += (st.zoomTarget - st.zoom) * Math.min(1, dt * 3);
    st.lift += (st.liftTarget - st.lift) * Math.min(1, dt * 3);

    if (!embedFocus && camera && camera.view && camera.view.enabled) {
      /* leaving the embed composition: drop the panel-aware projection */
      camera.clearViewOffset();
    }

    if (embedFocus && launchT < 0 && camera) {
      composeEmbedView(craftPos);
      return;
    }

    let targetPos = new T.Vector3();
    let targetLook = new T.Vector3();
    wantUp.set(0, 1, 0);

    if (launchT >= 0 || opsActive) {
      // camera rides in the craft's own frame, so the wings always sit level in
      // frame no matter where the orbit is pointing
      const q = craft.quaternion;
      const off = launchT >= 0
        ? new T.Vector3(0.9, 1.35, 4.0)
        : new T.Vector3(0.45, 1.75, 4.4);
      targetPos.copy(craftPos).add(off.applyQuaternion(q));
      targetLook.copy(craftPos);
      wantUp.set(0, 1, 0).applyQuaternion(q);

      if (launchT >= 0) {
        // drift out to a wide shot as the vehicle climbs
        const p = Math.min(1, launchT);
        targetPos.lerp(
          new T.Vector3(0, st.rNow * 1.1 + 2.4, st.rNow * 1.9 + 3.6),
          smoothstep(0.6, 1, p) * 0.7
        );
      } else if (arrival > 0.001) {
        // pull back to the ascent's orbit framing, then settle into the chase
        targetPos.sub(craftPos).multiplyScalar(1 + arrival * 1.08).add(craftPos);
      }
    } else {
      // hero view: above and behind the parked craft, planet in the background.
      // st.zoom pulls the camera in while the builder is open so every design
      // change reads clearly.
      const q = craft.quaternion;
      const ang = t * 0.1;
      const off = new T.Vector3(0.6 + Math.sin(ang) * 0.8, 2.4, 6.0)
        .multiplyScalar(st.zoom).applyQuaternion(q);
      targetPos.copy(craftPos).add(off);
      targetLook.copy(craftPos).multiplyScalar(1 - 0.28 * st.zoom);
      // compact layout: pitch down so the craft sits in the strip above the
      // builder instead of behind it
      targetLook.addScaledVector(wantUp, -st.lift);
      wantUp.set(0, 1, 0).applyQuaternion(q);
    }

    // pointer parallax
    pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 3);
    pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 3);
    targetPos.x += pointer.x * (opsActive ? 0.5 : 1.3);
    targetPos.y += -pointer.y * (opsActive ? 0.4 : 0.9);
    targetPos.x += st.ox;
    targetLook.x += st.ox;

    camPos.lerp(targetPos, k);
    camLook.lerp(targetLook, k);

    shake *= 0.92;
    camera.position.set(
      camPos.x + (Math.random() - 0.5) * shake * 0.28,
      camPos.y + (Math.random() - 0.5) * shake * 0.28,
      camPos.z + (Math.random() - 0.5) * shake * 0.28
    );
    camUp.lerp(wantUp, k).normalize();
    camera.up.copy(camUp);
    camera.lookAt(camLook);
  }

  /* ------------------------------------------------------------- controls */
  function pulse(strength) { flash = Math.min(1, strength || 0.6); }
  function setOffset(v) { st.oxTarget = v; }
  function setZoom(v) { st.zoomTarget = v; }
  function setLift(v) { st.liftTarget = v; }
  function setArrival(v, hold) {
    arrival = Math.max(0, Math.min(1, v || 0));
    arrivalHold = !!hold;
  }
  function releaseArrival() { arrivalHold = false; }

  /* ------------------------------------------------------- launch props */
  // Pad, lower stage and fairing are built for one launch only and torn down
  // afterwards, so the parked-craft scene stays exactly as it was.
  function buildPad() {
    const g = new T.Group();
    const R = st.bodyRNow;
    g.position.set(R * 1.04, 0, 0);

    const metal = new T.MeshStandardMaterial({ color: 0x3a4658, metalness: 0.5, roughness: 0.6 });
    const dark = new T.MeshStandardMaterial({ color: 0x1a2230, metalness: 0.4, roughness: 0.7 });

    const deck = new T.Mesh(new T.CylinderGeometry(0.2, 0.24, 0.03, 24), metal);
    deck.rotation.z = -Math.PI / 2;
    g.add(deck);

    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = new T.Mesh(new T.CylinderGeometry(0.012, 0.018, R * 0.04, 6), dark);
      leg.position.set(-R * 0.02, Math.cos(a) * 0.16, Math.sin(a) * 0.16);
      g.add(leg);
    }

    const tower = new T.Mesh(new T.BoxGeometry(0.02, 0.34, 0.05), metal);
    tower.position.set(0.17, 0.2, 0.2);
    g.add(tower);

    const beacon = new T.Mesh(
      new T.SphereGeometry(0.014, 8, 6),
      new T.MeshBasicMaterial({ color: 0xff6f6f, transparent: true, opacity: 0.9 })
    );
    beacon.position.set(0.34, 0.2, 0.2);
    g.add(beacon);
    g.userData.beacon = beacon;

    g.userData.rings = [];
    [0.28, 0.42].forEach((rad, i) => {
      const rg = new T.Group();
      rg.rotation.y = Math.PI / 2;
      rg.position.x = 0.012 + i * 0.004;
      const ring = new T.Mesh(
        new T.TorusGeometry(rad, 0.004, 6, 48),
        new T.MeshBasicMaterial({
          color: 0x9be8ff, transparent: true, opacity: 0.35,
          blending: T.AdditiveBlending, depthWrite: false,
        })
      );
      rg.add(ring);
      g.add(rg);
      g.userData.rings.push(ring);
    });

    return g;
  }

  function buildLaunchRig(spec) {
    if (!craft || !spec) return null;
    const s = spec.busSize;
    const bd = 0.34 * s;
    const hull = new T.MeshStandardMaterial({ color: 0xd8dde6, metalness: 0.55, roughness: 0.45 });
    const dark = new T.MeshStandardMaterial({ color: 0x2b3444, metalness: 0.6, roughness: 0.5 });
    const rig = { stage: null, fairing: [] };

    const stage = new T.Group();
    const tank = new T.Mesh(new T.CylinderGeometry(0.085 * s, 0.085 * s, 0.42 * s, 18), hull);
    tank.rotation.x = Math.PI / 2;
    stage.add(tank);
    const bell = new T.Mesh(new T.ConeGeometry(0.06 * s, 0.1 * s, 14, 1, true), dark);
    bell.rotation.x = Math.PI / 2;
    bell.position.z = -0.25 * s;
    stage.add(bell);
    // strap-on boosters ride with the stage
    [-1, 1].forEach(side => {
      const b = new T.Mesh(new T.CylinderGeometry(0.034 * s, 0.034 * s, 0.3 * s, 12), hull);
      b.rotation.x = Math.PI / 2;
      b.position.set(side * 0.115 * s, 0, 0.02 * s);
      stage.add(b);
      const nose = new T.Mesh(new T.ConeGeometry(0.034 * s, 0.07 * s, 12), dark);
      nose.rotation.x = Math.PI / 2;
      nose.position.set(side * 0.115 * s, 0, 0.195 * s);
      stage.add(nose);
    });
    stage.position.z = -bd * 0.62 - 0.21 * s;
    craft.add(stage);
    rig.stage = stage;

    // two fairing halves; the wings stay folded until they come off
    const fMat = new T.MeshStandardMaterial({
      color: 0xe8eef6, metalness: 0.3, roughness: 0.5, side: T.DoubleSide,
    });
    [1, -1].forEach(dir => {
      const half = new T.Group();
      const shell = new T.Mesh(
        new T.CylinderGeometry(0.19 * s, 0.19 * s, 0.56 * s, 18, 1, true, dir > 0 ? 0 : Math.PI, Math.PI),
        fMat
      );
      shell.rotation.x = Math.PI / 2;
      half.add(shell);
      half.position.z = -0.02 * s;
      craft.add(half);
      rig.fairing.push(half);
    });

    return rig;
  }

  function detachPart(obj, vel, spin) {
    if (!obj || !obj.parent) return;
    craftHolder.attach(obj);
    launchDebris.push({ obj, vel, spin, age: 0 });
  }

  function dropStage() {
    if (!launchRig || !launchRig.stage) return;
    const back = new T.Vector3(0, 0, -1).applyQuaternion(craft.quaternion);
    detachPart(launchRig.stage, back.clone().multiplyScalar(1.1), new T.Vector3(0.6, 0.3, 0.9));
    launchRig.stage = null;
  }

  function dropFairing() {
    if (!launchRig) return;
    launchRig.fairing.forEach((h, i) => {
      const dir = new T.Vector3(i ? 1 : -1, 0, 0).applyQuaternion(craft.quaternion);
      detachPart(h, dir.multiplyScalar(1.5), new T.Vector3(i ? 1.2 : -1.2, 0.8, 0.4));
    });
    launchRig.fairing = [];
  }

  function disposeObj(obj) {
    obj.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
    });
    if (obj.parent) obj.parent.remove(obj);
  }

  function updateLaunchDebris(dt) {
    if (!launchDebris.length) return;
    launchDebris = launchDebris.filter(d => {
      d.age += dt;
      d.obj.position.addScaledVector(d.vel, dt);
      d.obj.rotation.x += d.spin.x * dt;
      d.obj.rotation.y += d.spin.y * dt;
      d.obj.rotation.z += d.spin.z * dt;
      if (d.age > 2.6) d.obj.visible = false;
      if (d.age > 3.6) {
        disposeObj(d.obj);
        return false;
      }
      return true;
    });
  }

  function stepLaunchProps(dt, p) {
    launchP = p;
    if (launchPad) {
      launchPad.userData.beacon.material.opacity = 0.55 + Math.sin(simTime * 6) * 0.4;
      launchPad.userData.rings.forEach((r, i) => { r.rotation.z += dt * (i ? -0.5 : 0.9); });
    }
    if (p >= 0.47 && !launchFlags.staged) {
      launchFlags.staged = true;
      dropStage();
      shake = Math.max(shake, 0.34);
    }
    if (p >= 0.59 && !launchFlags.fared) {
      launchFlags.fared = true;
      dropFairing();
      shake = Math.max(shake, 0.18);
    }
    launchPhase = p >= 0.85 ? "PAYLOAD DEPLOY"
      : p >= 0.72 ? "ORBIT INSERTION"
      : p >= 0.59 ? "FAIRING DEPLOY"
      : p >= 0.47 ? "STAGE SEP"
      : p >= 0.33 ? "MAX-Q"
      : p >= 0.11 ? "LIFTOFF"
      : "IGNITION";
    updateLaunchDebris(dt);
  }

  function clearLaunchProps() {
    if (launchPad) disposeObj(launchPad);
    launchPad = null;
    if (launchRig) {
      if (launchRig.stage) disposeObj(launchRig.stage);
      launchRig.fairing.forEach(h => disposeObj(h));
    }
    launchRig = null;
    launchFlags = null;
    launchDebris.forEach(d => disposeObj(d.obj));
    launchDebris = [];
  }

  function startLaunch() {
    launchT = 0;
    launchP = 0;
    launchPhase = "IGNITION";
    trailPts = [];
    shake = 0.7;
    flash = 0.9;

    clearLaunchProps();
    launchPad = buildPad();
    orbitGroup.add(launchPad);
    launchFlags = { staged: false, fared: false };
    launchRig = buildLaunchRig(lastSpec);
  }

  function stopLaunch() {
    launchT = -1;
    clearLaunchProps();
  }

  function launchTelemetry() {
    return { p: launchP, phase: launchPhase, done: launchT < 0 };
  }

  function startOps() {
    opsActive = true;
    opsT = 0;
  }

  function stopOps() {
    opsActive = false;
    beam.material.opacity = 0;
    scanCone.visible = false;
    scanRing.visible = false;
  }

  function dispose() {
    running = false;
    window.removeEventListener("resize", resize);
    if (renderer) renderer.dispose();
  }

  function stats() {
    if (!renderer) return null;
    const r = renderer.info;
    return {
      calls: r.render.calls,
      triangles: r.render.triangles,
      frame: r.render.frame,
      textures: r.memory.textures,
      geometries: r.memory.geometries,
      craftVisible: !!(craft && craft.visible),
      ops: opsActive,
      launch: launchT >= 0,
    };
  }

  // renders one frame at a fixed size and returns a JPEG data URL (used for
  // contact sheets and for checking the scene when the browser is headless)
  function snapshot(w, h) {
    if (!renderer) return null;
    w = w || 720; h = h || 405;
    const oldW = W, oldH = H, oldAspect = camera.aspect, oldPR = renderer.getPixelRatio();
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    const url = canvas.toDataURL("image/jpeg", 0.72);
    renderer.setPixelRatio(oldPR);
    renderer.setSize(oldW, oldH, false);
    camera.aspect = oldAspect;
    camera.updateProjectionMatrix();
    return url;
  }

  return {
    preload, init, setTarget, setCraft, pulse, setOffset, setZoom, setLift,
    setArrival, releaseArrival,
    /* integration: the merged site asks for a panel-aware composition */
    setEmbedFocus,
    startLaunch, stopLaunch, launchTelemetry, startOps, stopOps, resize, dispose,
    // dev helpers: used by the offline contact-sheet tooling, never called by the game
    stats, snapshot,
    tick: dt => step(dt || 1 / 60),
    _dbg: () => ({ cone: scanCone, ring: scanRing, beam, beamDots, station, planet, atmo, clouds, camera }),
    debug: () => {
      if (!craft) return null;
      const p = new T.Vector3(); craft.getWorldPosition(p);
      return {
        cam: camera.position.toArray().map(v => +v.toFixed(2)),
        craft: p.toArray().map(v => +v.toFixed(2)),
        dist: +camera.position.distanceTo(p).toFixed(2),
        scale: +craft.scale.x.toFixed(3),
        wingSpan: +wingSpan.toFixed(3),
        up: camera.up.toArray().map(v => +v.toFixed(2)),
        fov: camera.fov,
      };
    },
  };
})();
