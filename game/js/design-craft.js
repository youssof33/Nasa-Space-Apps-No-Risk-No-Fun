/* ==========================================================================
   The workbench spacecraft, rebuilt inside Mission Control.

   This is a direct port of the workbench's `viz/spacecraft/Spacecraft.ts` geometry.
   The workbench and the flight scene therefore show the same hull, the same
   solar wings, the same dish and the same payload bays — only the camera and
   the lighting change between design and flight.
   ========================================================================== */
window.MCDesignCraft = (function () {
  "use strict";

  var DECK_Y = 0.42;
  var BAY_POSITIONS = [
    [-0.19, DECK_Y, 0.17],
    [0.19, DECK_Y, 0.17],
    [-0.19, DECK_Y, -0.14],
    [0.19, DECK_Y, -0.14],
  ];
  var solarTexture = null;

  function addMesh(parent, geometry, material, position) {
    var mesh = new THREE.Mesh(geometry, material);
    if (position) mesh.position.set(position[0], position[1], position[2]);
    parent.add(mesh);
    return mesh;
  }

  function gold() {
    return new THREE.MeshStandardMaterial({ color: 0xb99148, metalness: 0.45, roughness: 0.42 });
  }

  function panelWhite() {
    return new THREE.MeshStandardMaterial({ color: 0xd4e0ea, metalness: 0.18, roughness: 0.52 });
  }

  function darkMetal() {
    return new THREE.MeshStandardMaterial({ color: 0x27394a, metalness: 0.55, roughness: 0.45 });
  }

  function nearBlack() {
    return new THREE.MeshStandardMaterial({ color: 0x0d1822, metalness: 0.3, roughness: 0.7 });
  }

  function emissive(color, intensity) {
    return new THREE.MeshStandardMaterial({
      color: 0x05090d,
      emissive: color,
      emissiveIntensity: intensity == null ? 1.6 : intensity,
      roughness: 0.5,
      metalness: 0.2,
    });
  }

  function getSolarTexture() {
    if (solarTexture) return solarTexture;
    var canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 112;
    var context = canvas.getContext("2d");
    if (context) {
      var gradient = context.createLinearGradient(0, 0, 160, 112);
      gradient.addColorStop(0, "#123a5c");
      gradient.addColorStop(0.55, "#0b2947");
      gradient.addColorStop(1, "#071d34");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 160, 112);
      context.strokeStyle = "rgba(104, 180, 220, 0.32)";
      context.lineWidth = 1;
      for (var x = 0; x <= 160; x += 16) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, 112);
        context.stroke();
      }
      for (var y = 0; y <= 112; y += 14) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(160, y);
        context.stroke();
      }
      context.fillStyle = "rgba(150, 220, 255, 0.18)";
      context.fillRect(0, 0, 160, 2);
    }
    solarTexture = new THREE.CanvasTexture(canvas);
    solarTexture.colorSpace = THREE.SRGBColorSpace;
    solarTexture.anisotropy = 4;
    return solarTexture;
  }

  function solarMaterial() {
    return new THREE.MeshStandardMaterial({
      map: getSolarTexture(),
      color: 0xd6efff,
      metalness: 0.28,
      roughness: 0.38,
      emissive: 0x123a5e,
      emissiveIntensity: 0.85,
    });
  }

  function buildDeck(structure) {
    var deck = addMesh(
      structure,
      new THREE.BoxGeometry(0.88, 0.045, 0.62),
      darkMetal(),
      [0, DECK_Y - 0.02, 0.01]
    );
    deck.userData.part = "structure";
    var rim = addMesh(
      structure,
      new THREE.BoxGeometry(0.94, 0.012, 0.68),
      panelWhite(),
      [0, DECK_Y - 0.045, 0.01]
    );
    rim.userData.part = "structure";

    var core = addMesh(
      structure,
      new THREE.CylinderGeometry(0.4, 0.44, 0.66, 6),
      gold(),
      [0, 0.03, 0]
    );
    core.rotation.y = Math.PI / 6;
    core.userData.part = "structure";

    var collar = addMesh(
      structure,
      new THREE.CylinderGeometry(0.46, 0.46, 0.06, 6),
      darkMetal(),
      [0, DECK_Y - 0.075, 0]
    );
    collar.rotation.y = Math.PI / 6;
    collar.userData.part = "structure";

    var lower = addMesh(
      structure,
      new THREE.CylinderGeometry(0.42, 0.34, 0.26, 6),
      panelWhite(),
      [0, -0.38, 0]
    );
    lower.rotation.y = Math.PI / 6;
    lower.userData.part = "structure";

    [-1, 1].forEach(function (side) {
      var rail = addMesh(
        structure,
        new THREE.BoxGeometry(0.03, 0.62, 0.03),
        darkMetal(),
        [side * 0.4, 0.02, 0.27]
      );
      rail.userData.part = "structure";
    });
  }

  function buildWing(side, deploy) {
    var wing = new THREE.Group();
    wing.position.set(side * 0.46, 0.22, 0);
    var boom = addMesh(
      wing,
      new THREE.BoxGeometry(0.32, 0.04, 0.04),
      darkMetal(),
      [side * 0.16, 0, 0]
    );
    boom.userData.part = "solarPanel";

    var hinge = addMesh(
      wing,
      new THREE.CylinderGeometry(0.035, 0.035, 0.09, 12),
      panelWhite(),
      [side * 0.02, 0, 0]
    );
    hinge.rotation.x = Math.PI / 2;
    hinge.userData.part = "solarPanel";

    var panelGroup = new THREE.Group();
    panelGroup.position.set(side * 0.3, 0, 0);
    panelGroup.scale.x = deploy;
    panelGroup.userData.deploy = true;

    var substrate = addMesh(
      panelGroup,
      new THREE.BoxGeometry(0.58, 0.02, 0.5),
      nearBlack(),
      [side * 0.29, -0.014, 0]
    );
    substrate.userData.part = "solarPanel";

    var cells = addMesh(
      panelGroup,
      new THREE.PlaneGeometry(0.56, 0.48),
      solarMaterial(),
      [side * 0.29, 0.003, 0]
    );
    cells.rotation.x = -Math.PI / 2;
    cells.rotation.z = side > 0 ? 0 : Math.PI;
    cells.userData.part = "solarPanel";

    [-1, 1].forEach(function (edge) {
      var frame = addMesh(
        panelGroup,
        new THREE.BoxGeometry(0.6, 0.014, 0.025),
        panelWhite(),
        [side * 0.29, 0.006, edge * 0.255]
      );
      frame.userData.part = "solarPanel";
    });

    var tip = addMesh(
      panelGroup,
      new THREE.BoxGeometry(0.025, 0.014, 0.52),
      panelWhite(),
      [side * 0.585, 0.006, 0]
    );
    tip.userData.part = "solarPanel";

    wing.add(panelGroup);
    return { group: wing, panelGroup: panelGroup };
  }

  function buildBatteries(group, capacity) {
    [-1, 1].forEach(function (side) {
      var pack = new THREE.Group();
      pack.position.set(0, -0.16, side * 0.34);
      var body = addMesh(
        pack,
        new THREE.CylinderGeometry(0.1, 0.1, 0.3, 16),
        panelWhite(),
        [0, 0, 0]
      );
      body.rotation.x = Math.PI / 2;
      body.userData.part = "battery";
      var band = addMesh(
        pack,
        new THREE.CylinderGeometry(0.106, 0.106, 0.05, 16),
        darkMetal(),
        [0, 0, 0]
      );
      band.rotation.x = Math.PI / 2;
      band.userData.part = "battery";
      var led = addMesh(
        pack,
        new THREE.CylinderGeometry(0.028, 0.028, 0.012, 12),
        emissive(0x63dfa4),
        [0, 0, side * 0.16]
      );
      led.rotation.x = Math.PI / 2;
      led.userData.part = "battery";
      pack.scale.y = capacity > 150 ? 1.18 : 0.94;
      group.add(pack);
    });
  }

  function buildComputer(group, hardened) {
    var box = addMesh(
      group,
      new THREE.BoxGeometry(0.26, 0.18, 0.09),
      panelWhite(),
      [0, 0.12, 0.45]
    );
    box.userData.part = "computer";
    var face = addMesh(
      group,
      new THREE.BoxGeometry(0.22, 0.14, 0.012),
      nearBlack(),
      [0, 0.12, 0.499]
    );
    face.userData.part = "computer";
    var led = emissive(hardened ? 0x63dfa4 : 0xf0b45c, 1.4);
    for (var index = 0; index < 3; index += 1) {
      var dot = addMesh(
        group,
        new THREE.BoxGeometry(0.014, 0.014, 0.01),
        led,
        [-0.06 + index * 0.035, 0.15, 0.508]
      );
      dot.userData.part = "computer";
    }
    var shield = addMesh(
      group,
      new THREE.BoxGeometry(0.29, 0.015, 0.1),
      darkMetal(),
      [0, 0.215, 0.45]
    );
    shield.userData.part = "computer";
  }

  function buildAdcs(group, precise) {
    var trackerBody = addMesh(
      group,
      new THREE.CylinderGeometry(0.045, 0.05, 0.09, 12),
      darkMetal(),
      [0.33, DECK_Y + 0.045, -0.24]
    );
    trackerBody.userData.part = "adcs";
    var hood = addMesh(
      group,
      new THREE.CylinderGeometry(0.06, 0.05, 0.03, 12),
      panelWhite(),
      [0.33, DECK_Y + 0.1, -0.24]
    );
    hood.userData.part = "adcs";

    for (var index = 0; index < 3; index += 1) {
      var wheel = addMesh(
        group,
        new THREE.TorusGeometry(0.075, 0.012, 6, 20),
        darkMetal(),
        [0, -0.34, 0]
      );
      wheel.rotation.x = Math.PI / 2;
      wheel.rotation.z = (index * Math.PI) / 3;
      wheel.userData.part = "adcs";
    }
    group.scale.setScalar(precise ? 1.08 : 0.95);
  }

  function buildRecorder(group, storageGB) {
    var body = addMesh(
      group,
      new THREE.BoxGeometry(0.2, 0.12, 0.08),
      darkMetal(),
      [0, -0.05, 0.45]
    );
    body.userData.part = "dataStorage";
    for (var index = 0; index < 3; index += 1) {
      var slot = addMesh(
        group,
        new THREE.BoxGeometry(0.17, 0.016, 0.006),
        panelWhite(),
        [0, 0.005 - index * 0.032, 0.492]
      );
      slot.userData.part = "dataStorage";
    }
    group.scale.y = storageGB > 300 ? 1.25 : 0.92;
  }

  function buildPropulsion(group) {
    var cap = addMesh(
      group,
      new THREE.CylinderGeometry(0.16, 0.2, 0.1, 16),
      darkMetal(),
      [0, -0.57, 0]
    );
    cap.userData.part = "propulsion";

    var nozzle = addMesh(
      group,
      new THREE.CylinderGeometry(0.08, 0.16, 0.18, 18, 1, true),
      nearBlack(),
      [0, -0.68, 0]
    );
    nozzle.userData.part = "propulsion";

    /* the flight model's own nozzle + throat, exactly as Spacecraft.syncPropulsion
       adds them on top of the base assembly */
    var flightNozzle = addMesh(
      group,
      new THREE.CylinderGeometry(0.07, 0.17, 0.2, 18, 1, true),
      nearBlack(),
      [0, -0.7, 0]
    );
    flightNozzle.userData.nozzle = true;
    flightNozzle.userData.part = "propulsion";
    var throat = addMesh(
      group,
      new THREE.CylinderGeometry(0.1, 0.07, 0.08, 16),
      darkMetal(),
      [0, -0.59, 0]
    );
    throat.userData.nozzle = true;
    throat.userData.part = "propulsion";

    var plume = new THREE.Mesh(
      new THREE.ConeGeometry(0.11, 0.6, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x7ce9ff,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    plume.position.set(0, -1.0, 0);
    plume.rotation.z = Math.PI;
    plume.userData.plume = true;
    plume.visible = false;
    group.add(plume);
    return plume;
  }

  function buildAntenna(group, gain) {
    var mount = new THREE.Group();
    mount.position.set(0.31, DECK_Y + 0.02, -0.2);
    group.add(mount);

    var mast = addMesh(
      mount,
      new THREE.CylinderGeometry(0.016, 0.02, 0.26, 10),
      darkMetal(),
      [0, 0.13, 0]
    );
    mast.userData.part = "antenna";

    var dishGroup = new THREE.Group();
    dishGroup.position.set(0, 0.27, 0);
    dishGroup.rotation.x = -0.3;
    mount.add(dishGroup);

    var radius = Math.max(0.11, Math.min(0.24, 0.1 + gain * 0.0075));
    var points = [];
    var segments = 16;
    for (var index = 0; index <= segments; index += 1) {
      var t = index / segments;
      points.push(new THREE.Vector2(t * radius, (t * t * radius) / 2.4));
    }
    var dish = new THREE.Mesh(
      new THREE.LatheGeometry(points, 24),
      new THREE.MeshStandardMaterial({
        color: 0xcfdae4,
        metalness: 0.35,
        roughness: 0.4,
        side: THREE.DoubleSide,
      })
    );
    dish.rotation.x = Math.PI;
    dish.userData.part = "antenna";
    dishGroup.add(dish);

    var feed = addMesh(
      dishGroup,
      new THREE.CylinderGeometry(0.012, 0.012, radius * 1.5, 8),
      darkMetal(),
      [0, -radius * 0.55, 0]
    );
    feed.userData.part = "antenna";
    var horn = addMesh(
      dishGroup,
      new THREE.CylinderGeometry(0.026, 0.016, 0.04, 10),
      emissive(0x55d9e8, 0.9),
      [0, -radius * 1.28, 0]
    );
    horn.userData.part = "antenna";
    return dishGroup;
  }

  function buildInstrument(instrument) {
    var group = new THREE.Group();
    var tags = instrument.scienceTags || [];
    var mass = instrument.massKg || 10;
    var scale = Math.max(0.74, Math.min(1.18, 0.72 + mass / 55));
    var body = new THREE.MeshStandardMaterial({
      color: 0xd8e4ee,
      metalness: 0.22,
      roughness: 0.46,
    });
    var trim = new THREE.MeshStandardMaterial({
      color: 0x2a3d4e,
      metalness: 0.5,
      roughness: 0.42,
    });
    var accentColor = tags.indexOf("earth-imaging") >= 0
      ? 0x55d9e8
      : tags.indexOf("magnetic-fields") >= 0 || tags.indexOf("space-weather") >= 0
        ? 0x6aa8ff
        : tags.indexOf("atmosphere") >= 0 || tags.indexOf("temperature") >= 0
          ? 0x2aa7b8
          : 0xf0b45c;
    var accent = emissive(accentColor, 1.1);

    addMesh(group, new THREE.CylinderGeometry(0.072, 0.08, 0.026, 14), trim, [0, 0.013, 0]);

    if (tags.indexOf("astronomy") >= 0) {
      var yoke = addMesh(group, new THREE.BoxGeometry(0.1, 0.05, 0.04), trim, [0, 0.05, 0]);
      yoke.rotation.y = Math.PI / 2;
      var tube = addMesh(
        group,
        new THREE.CylinderGeometry(0.05, 0.058, 0.26, 16),
        body,
        [0, 0.14, 0]
      );
      tube.rotation.z = Math.PI / 2.6;
      var lens = addMesh(
        group,
        new THREE.CylinderGeometry(0.052, 0.052, 0.012, 16),
        accent,
        [0.105, 0.19, 0]
      );
      lens.rotation.z = Math.PI / 2.6;
    } else if (tags.indexOf("magnetic-fields") >= 0) {
      addMesh(group, new THREE.CylinderGeometry(0.012, 0.014, 0.3, 8), trim, [0, 0.16, 0]);
      addMesh(group, new THREE.SphereGeometry(0.038, 12, 10), body, [0, 0.32, 0]);
      addMesh(group, new THREE.BoxGeometry(0.11, 0.012, 0.012), trim, [0, 0.24, 0]);
      addMesh(group, new THREE.SphereGeometry(0.015, 8, 6), accent, [0.06, 0.24, 0]);
    } else if (tags.indexOf("earth-imaging") >= 0 || tags.indexOf("imaging") >= 0) {
      addMesh(group, new THREE.BoxGeometry(0.15, 0.16, 0.12), body, [0, 0.1, 0]);
      var cameraLens = addMesh(
        group,
        new THREE.CylinderGeometry(0.045, 0.05, 0.06, 14),
        trim,
        [0, 0.1, 0.08]
      );
      cameraLens.rotation.x = Math.PI / 2;
      addMesh(
        group,
        new THREE.CylinderGeometry(0.032, 0.032, 0.008, 14),
        accent,
        [0, 0.1, 0.113]
      ).rotation.x = Math.PI / 2;
      addMesh(group, new THREE.BoxGeometry(0.11, 0.02, 0.02), accent, [0, 0.195, 0.03]);
    } else if (tags.indexOf("atmosphere") >= 0 || tags.indexOf("minerals") >= 0) {
      addMesh(group, new THREE.BoxGeometry(0.16, 0.15, 0.13), body, [0, 0.09, 0]);
      for (var strip = 0; strip < 3; strip += 1) {
        addMesh(
          group,
          new THREE.BoxGeometry(0.1, 0.008, 0.004),
          accent,
          [0, 0.06 + strip * 0.03, 0.067]
        );
      }
      addMesh(group, new THREE.BoxGeometry(0.07, 0.03, 0.05), trim, [0, 0.18, -0.02]);
    } else if (tags.indexOf("temperature") >= 0) {
      addMesh(group, new THREE.CylinderGeometry(0.07, 0.08, 0.13, 14), body, [0, 0.08, 0]);
      var hood = addMesh(
        group,
        new THREE.CylinderGeometry(0.085, 0.06, 0.05, 14, 1, true),
        trim,
        [0, 0.17, 0]
      );
      hood.rotation.x = Math.PI;
      addMesh(group, new THREE.BoxGeometry(0.1, 0.012, 0.012), accent, [0, 0.06, 0.075]);
    } else if (tags.indexOf("radiation") >= 0 || tags.indexOf("solar-wind") >= 0) {
      addMesh(group, new THREE.SphereGeometry(0.065, 14, 10), body, [0, 0.08, 0]);
      for (var fin = 0; fin < 4; fin += 1) {
        var blade = addMesh(
          group,
          new THREE.BoxGeometry(0.012, 0.1, 0.05),
          trim,
          [0, 0.08, 0]
        );
        blade.rotation.y = (fin * Math.PI) / 2;
        blade.position.x = Math.sin(blade.rotation.y) * 0.075;
        blade.position.z = Math.cos(blade.rotation.y) * 0.075;
      }
      addMesh(group, new THREE.SphereGeometry(0.02, 10, 8), accent, [0, 0.15, 0]);
    } else {
      addMesh(group, new THREE.BoxGeometry(0.15, 0.14, 0.12), body, [0, 0.08, 0]);
      addMesh(group, new THREE.CylinderGeometry(0.035, 0.035, 0.02, 12), accent, [0, 0.16, 0]);
    }

    addMesh(group, new THREE.BoxGeometry(0.02, 0.006, 0.006), accent, [0.06, 0.04, 0.065]);
    group.scale.setScalar(scale);
    return group;
  }

  function build(spec) {
    spec = spec || {};
    var root = new THREE.Group();
    var spin = new THREE.Group();
    root.add(spin);

    var structure = new THREE.Group();
    var solarTilt = new THREE.Group();
    var batteries = new THREE.Group();
    var computer = new THREE.Group();
    var adcs = new THREE.Group();
    var antenna = new THREE.Group();
    var recorder = new THREE.Group();
    var propulsion = new THREE.Group();
    spin.add(structure);
    spin.add(solarTilt);
    spin.add(batteries);
    spin.add(computer);
    spin.add(adcs);
    spin.add(antenna);
    spin.add(recorder);
    spin.add(propulsion);

    buildDeck(structure);
    spin.scale.setScalar((spec.structureMass || 6) > 10 ? 1.02 : 0.97);

    var deploy = Math.max(0.04, Math.min(1, spec.solarDeploy || 0.04));
    var wings = [];
    [-1, 1].forEach(function (side) {
      var wing = buildWing(side, deploy);
      solarTilt.add(wing.group);
      wings.push({ pivot: wing.panelGroup });
    });

    if (spec.batteryWh) {
      buildBatteries(batteries, spec.batteryWh);
    } else {
      batteries.visible = false;
    }

    buildComputer(computer, !!spec.computerHardened);
    buildAdcs(adcs, !!spec.adcsPrecision);

    var dishGrp = null;
    if (spec.antennaGain != null) {
      dishGrp = buildAntenna(antenna, spec.antennaGain);
    } else {
      antenna.visible = false;
    }

    if (spec.storageGB != null) {
      buildRecorder(recorder, spec.storageGB);
    } else {
      recorder.visible = false;
    }

    var plume = null;
    if (spec.propulsion) {
      plume = buildPropulsion(propulsion);
    } else {
      propulsion.visible = false;
    }

    var instruments = [];
    for (var bay = 0; bay < 4; bay += 1) {
      var bayGroup = new THREE.Group();
      var position = BAY_POSITIONS[bay];
      bayGroup.position.set(position[0], position[1], position[2]);
      spin.add(bayGroup);
      var entry = spec.instruments ? spec.instruments[bay] : null;
      if (entry) {
        var model = buildInstrument(entry);
        model.position.y = 0.01;
        bayGroup.add(model);
        instruments.push(bayGroup);
      } else {
        var pad = new THREE.Mesh(
          new THREE.CylinderGeometry(0.066, 0.066, 0.012, 16),
          new THREE.MeshStandardMaterial({
            color: 0x0e1f2c,
            emissive: 0x147a8c,
            emissiveIntensity: 0.3,
            roughness: 0.65,
          })
        );
        pad.position.y = 0.006;
        bayGroup.add(pad);
      }
    }

    return {
      group: root,
      spin: spin,
      solarTilt: solarTilt,
      wings: wings,
      dishGrp: dishGrp,
      instruments: instruments,
      plume: plume,
    };
  }

  return { build: build };
})();
