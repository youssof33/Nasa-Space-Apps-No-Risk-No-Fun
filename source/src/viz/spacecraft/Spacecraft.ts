import * as THREE from "three";
import type {
  BusCategory,
  BusComponent,
  Instrument,
} from "../../data/types";

export const PAYLOAD_BAY_COUNT = 4;

export interface StageBay {
  instrument: Instrument;
  qty: number;
}

export interface StageModel {
  bus: Partial<Record<BusCategory, BusComponent>>;
  bays: Array<StageBay | null>;
}

export type StagePartId = BusCategory | `bay:${number}`;

const DECK_Y = 0.42;

const bayPositions: Array<[number, number, number]> = [
  [-0.19, DECK_Y, 0.17],
  [0.19, DECK_Y, 0.17],
  [-0.19, DECK_Y, -0.14],
  [0.19, DECK_Y, -0.14],
];

const gold = (): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({
    color: 0xb99148,
    metalness: 0.45,
    roughness: 0.42,
  });

const panelWhite = (): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({
    color: 0xd4e0ea,
    metalness: 0.18,
    roughness: 0.52,
  });

const darkMetal = (): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({
    color: 0x27394a,
    metalness: 0.55,
    roughness: 0.45,
  });

const nearBlack = (): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({
    color: 0x0d1822,
    metalness: 0.3,
    roughness: 0.7,
  });

const emissive = (color: number, intensity = 1.6): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({
    color: 0x05090d,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.5,
    metalness: 0.2,
  });

let solarTexture: THREE.CanvasTexture | null = null;

function getSolarTexture(): THREE.CanvasTexture {
  if (solarTexture) return solarTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 112;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createLinearGradient(0, 0, 160, 112);
    gradient.addColorStop(0, "#123a5c");
    gradient.addColorStop(0.55, "#0b2947");
    gradient.addColorStop(1, "#071d34");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 160, 112);
    context.strokeStyle = "rgba(104, 180, 220, 0.32)";
    context.lineWidth = 1;
    for (let x = 0; x <= 160; x += 16) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, 112);
      context.stroke();
    }
    for (let y = 0; y <= 112; y += 14) {
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

function solarMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: getSolarTexture(),
    color: 0xd6efff,
    metalness: 0.28,
    roughness: 0.38,
    emissive: 0x123a5e,
    emissiveIntensity: 0.85,
  });
}

function addMesh(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position?: [number, number, number],
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  if (position) mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const material = object.material;
    if (Array.isArray(material)) {
      for (const entry of material) entry.dispose();
    } else {
      material.dispose();
    }
  });
}

export class Spacecraft {
  readonly root = new THREE.Group();
  private readonly spin = new THREE.Group();
  private readonly structure = new THREE.Group();
  private readonly solarTilt = new THREE.Group();
  private readonly solarWings: THREE.Group[] = [];
  private readonly batteries = new THREE.Group();
  private readonly computer = new THREE.Group();
  private readonly adcs = new THREE.Group();
  private readonly antenna = new THREE.Group();
  private readonly recorder = new THREE.Group();
  private readonly propulsion = new THREE.Group();
  private readonly bayGroups: THREE.Group[] = [];
  private readonly bayOccupied: boolean[] = [];

  private pickables: THREE.Object3D[] = [];
  private model: StageModel = { bus: {}, bays: [null, null, null, null] };
  private readonly cachedIds = new Map<string, string>();
  private solarDeploy = 0.04;
  private solarTarget = 0.04;
  private burnTime = 0;
  private pauseSpin = 0;
  private readonly selectionBox = new THREE.Box3();
  private readonly selectionEdges: THREE.LineSegments;
  private readonly ledMaterial = emissive(0x63dfa4, 1.4);
  private selected: StagePartId | null = null;
  private readonly markers = new THREE.Group();
  private readonly heading = new THREE.Vector3();
  private dishTip: THREE.Object3D | null = null;
  private readonly proxies: THREE.Mesh[] = [];
  private severities: Partial<Record<BusCategory | "payload", "ok" | "warning" | "fail">> = {};

  constructor() {
    this.root.add(this.spin);
    this.spin.add(this.structure);
    this.spin.add(this.solarTilt);
    this.spin.add(this.batteries);
    this.spin.add(this.computer);
    this.spin.add(this.adcs);
    this.spin.add(this.antenna);
    this.spin.add(this.recorder);
    this.spin.add(this.propulsion);
    this.spin.add(this.markers);

    for (const side of [-1, 1]) {
      const wing = this.buildWing(side);
      this.solarWings.push(wing);
      this.solarTilt.add(wing);
    }

    for (let index = 0; index < PAYLOAD_BAY_COUNT; index += 1) {
      const bay = new THREE.Group();
      const [x, y, z] = bayPositions[index] ?? [0, DECK_Y, 0];
      bay.position.set(x, y, z);
      this.bayGroups.push(bay);
      this.spin.add(bay);
    }

    this.buildDeck();
    this.buildBatteries();
    this.buildComputer();
    this.buildAdcs();
    this.buildRecorder();
    this.buildPropulsion();

    const edgesGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    this.selectionEdges = new THREE.LineSegments(
      edgesGeometry,
      new THREE.LineBasicMaterial({
        color: 0x55d9e8,
        transparent: true,
        opacity: 0.72,
      }),
    );
    this.selectionEdges.visible = false;
    this.spin.add(this.selectionEdges);

    this.setModel(this.model);
  }

  setModel(model: StageModel): void {
    this.model = model;
    this.syncStructure(model.bus.structure);
    this.syncSolar(model.bus.solarPanel);
    this.syncBattery(model.bus.battery);
    this.syncComputer(model.bus.computer);
    this.syncAdcs(model.bus.adcs);
    this.syncAntenna(model.bus.antenna);
    this.syncRecorder(model.bus.dataStorage);
    this.syncPropulsion(model.bus.propulsion);
    this.syncBays(model.bays);
    this.refreshPicks();
    this.refreshSelection();
    this.positionMarkers();
  }

  setSelection(part: StagePartId | null): void {
    this.selected = part;
    this.pauseSpin = part ? 4 : 0;
    this.refreshSelection();
  }

  getSelection(): StagePartId | null {
    return this.selected;
  }

  getPartAnchor(part: StagePartId): THREE.Vector3 | null {
    const group = this.groupFor(part);
    if (!group) return null;
    const box = new THREE.Box3().setFromObject(group);
    if (box.isEmpty()) return null;
    const anchor = box.getCenter(new THREE.Vector3());
    anchor.y = box.max.y + 0.08;
    return anchor;
  }

  getDishTip(target = new THREE.Vector3()): THREE.Vector3 | null {
    if (!this.dishTip || !this.antenna.visible) return null;
    return this.dishTip.getWorldPosition(target);
  }

  burn(duration = 1.8): void {
    this.burnTime = Math.max(this.burnTime, duration);
  }

  raycast(raycaster: THREE.Raycaster): StagePartId | null {
    const hits = raycaster.intersectObjects(this.pickables, true);
    for (const hit of hits) {
      const part = hit.object.userData.part as StagePartId | undefined;
      if (part) return part;
    }
    return null;
  }

  bayAt(raycaster: THREE.Raycaster): number | null {
    let best: number | null = null;
    let bestDistance = 0.26;
    const point = new THREE.Vector3();
    for (let index = 0; index < this.bayGroups.length; index += 1) {
      const bay = this.bayGroups[index];
      if (!bay) continue;
      bay.getWorldPosition(point);
      const distance = raycaster.ray.distanceToPoint(point);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
    return best;
  }

  setEarthDirection(direction: THREE.Vector3): void {
    this.heading.copy(direction);
  }

  setFindings(severities: Partial<Record<BusCategory | "payload", "ok" | "warning" | "fail">>): void {
    this.severities = severities;
    this.applyMarkerSeverity();
  }

  update(deltaSeconds: number, elapsedSeconds: number): void {
    if (this.pauseSpin > 0) this.pauseSpin -= deltaSeconds;
    const moving = this.pauseSpin <= 0;

    if (moving) {
      this.spin.rotation.y += deltaSeconds * 0.045;
      this.spin.rotation.z = Math.sin(elapsedSeconds * 0.22) * 0.018;
    }

    const deploySpeed = Math.min(1, deltaSeconds * 3.4);
    this.solarDeploy += (this.solarTarget - this.solarDeploy) * deploySpeed;
    for (const wing of this.solarWings) {
      const panel = wing.children.find((child) => child.userData.deploy === true);
      if (panel) panel.scale.x = Math.max(0.02, this.solarDeploy);
    }
    this.solarTilt.rotation.x = Math.sin(elapsedSeconds * 0.32) * 0.09;

    if (this.antenna.visible) {
      const target = this.heading.clone().normalize();
      const mount = this.antenna.children[0];
      if (mount) {
        const desired = Math.atan2(target.x, target.z) * 0.4;
        mount.rotation.y += (desired - mount.rotation.y) * Math.min(1, deltaSeconds * 2);
        mount.rotation.x = -0.28 + Math.sin(elapsedSeconds * 0.24) * 0.05;
      }
    }

    for (const [index, wheel] of this.adcs.children.entries()) {
      if (index < 3) wheel.rotation.z += deltaSeconds * (0.9 + index * 0.35);
    }

    for (const [index, battery] of this.batteries.children.entries()) {
      const led = battery.children[2];
      if (led && led instanceof THREE.Mesh) {
        (led.material as THREE.MeshStandardMaterial).emissiveIntensity =
          0.7 + Math.max(0, Math.sin(elapsedSeconds * 1.6 + index)) * 1.3;
      }
    }

    this.ledMaterial.emissiveIntensity = 0.5 + Math.max(0, Math.sin(elapsedSeconds * 2.4)) * 1.4;

    if (this.burnTime > 0) {
      this.burnTime = Math.max(0, this.burnTime - deltaSeconds);
      const plume = this.propulsion.children.find(
        (child) => child.userData.plume === true,
      ) as THREE.Mesh | undefined;
      if (plume) {
        const strength = Math.min(1, this.burnTime * 1.6);
        plume.visible = true;
        plume.scale.set(0.6 + strength * 0.6, strength * 1.4, 0.6 + strength * 0.6);
        const material = plume.material as THREE.MeshBasicMaterial;
        material.opacity = 0.25 + strength * 0.55;
      }
    } else {
      for (const child of this.propulsion.children) {
        if (child.userData.plume === true) child.visible = false;
      }
    }

    if (this.selected) {
      const pulse = 0.55 + Math.abs(Math.sin(elapsedSeconds * 1.6)) * 0.45;
      (this.selectionEdges.material as THREE.LineBasicMaterial).opacity = pulse;
    }

    for (const marker of this.markers.children) {
      const scale = 1 + Math.sin(elapsedSeconds * 3 + marker.id) * 0.16;
      marker.scale.setScalar(scale);
    }
  }

  dispose(): void {
    disposeObject(this.spin);
    this.selectionEdges.geometry.dispose();
    (this.selectionEdges.material as THREE.Material).dispose();
    if (solarTexture) {
      solarTexture.dispose();
      solarTexture = null;
    }
    this.root.clear();
    this.spin.clear();
  }

  private buildDeck(): void {
    const deck = addMesh(
      this.structure,
      new THREE.BoxGeometry(0.88, 0.045, 0.62),
      darkMetal(),
      [0, DECK_Y - 0.02, 0.01],
    );
    deck.userData.part = "structure";
    const rim = addMesh(
      this.structure,
      new THREE.BoxGeometry(0.94, 0.012, 0.68),
      panelWhite(),
      [0, DECK_Y - 0.045, 0.01],
    );
    rim.userData.part = "structure";

    const core = addMesh(
      this.structure,
      new THREE.CylinderGeometry(0.4, 0.44, 0.66, 6),
      gold(),
      [0, 0.03, 0],
    );
    core.rotation.y = Math.PI / 6;
    core.userData.part = "structure";

    const collar = addMesh(
      this.structure,
      new THREE.CylinderGeometry(0.46, 0.46, 0.06, 6),
      darkMetal(),
      [0, DECK_Y - 0.075, 0],
    );
    collar.rotation.y = Math.PI / 6;
    collar.userData.part = "structure";

    const lower = addMesh(
      this.structure,
      new THREE.CylinderGeometry(0.42, 0.34, 0.26, 6),
      panelWhite(),
      [0, -0.38, 0],
    );
    lower.rotation.y = Math.PI / 6;
    lower.userData.part = "structure";

    for (const side of [-1, 1]) {
      const rail = addMesh(
        this.structure,
        new THREE.BoxGeometry(0.03, 0.62, 0.03),
        darkMetal(),
        [side * 0.4, 0.02, 0.27],
      );
      rail.userData.part = "structure";
    }
  }

  private buildWing(side: number): THREE.Group {
    const wing = new THREE.Group();
    wing.position.set(side * 0.46, 0.22, 0);
    const boom = addMesh(
      wing,
      new THREE.BoxGeometry(0.32, 0.04, 0.04),
      darkMetal(),
      [side * 0.16, 0, 0],
    );
    boom.userData.part = "solarPanel";

    const hinge = addMesh(
      wing,
      new THREE.CylinderGeometry(0.035, 0.035, 0.09, 12),
      panelWhite(),
      [side * 0.02, 0, 0],
    );
    hinge.rotation.x = Math.PI / 2;
    hinge.userData.part = "solarPanel";

    const panelGroup = new THREE.Group();
    panelGroup.position.set(side * 0.3, 0, 0);
    panelGroup.scale.x = 0.04;
    panelGroup.userData.deploy = true;

    const substrate = addMesh(
      panelGroup,
      new THREE.BoxGeometry(0.58, 0.02, 0.5),
      nearBlack(),
      [side * 0.29, -0.014, 0],
    );
    substrate.userData.part = "solarPanel";

    const cells = addMesh(
      panelGroup,
      new THREE.PlaneGeometry(0.56, 0.48),
      solarMaterial(),
      [side * 0.29, 0.003, 0],
    );
    cells.rotation.x = -Math.PI / 2;
    cells.rotation.z = side > 0 ? 0 : Math.PI;
    cells.userData.part = "solarPanel";

    for (const edge of [-1, 1]) {
      const frame = addMesh(
        panelGroup,
        new THREE.BoxGeometry(0.6, 0.014, 0.025),
        panelWhite(),
        [side * 0.29, 0.006, edge * 0.255],
      );
      frame.userData.part = "solarPanel";
    }

    const tip = addMesh(
      panelGroup,
      new THREE.BoxGeometry(0.025, 0.014, 0.52),
      panelWhite(),
      [side * 0.585, 0.006, 0],
    );
    tip.userData.part = "solarPanel";

    wing.add(panelGroup);
    return wing;
  }

  private buildBatteries(): void {
    for (const side of [-1, 1]) {
      const pack = new THREE.Group();
      pack.position.set(0, -0.16, side * 0.34);
      const body = addMesh(
        pack,
        new THREE.CylinderGeometry(0.1, 0.1, 0.3, 16),
        panelWhite(),
        [0, 0, 0],
      );
      body.rotation.x = Math.PI / 2;
      body.userData.part = "battery";
      const band = addMesh(
        pack,
        new THREE.CylinderGeometry(0.106, 0.106, 0.05, 16),
        darkMetal(),
        [0, 0, 0],
      );
      band.rotation.x = Math.PI / 2;
      band.userData.part = "battery";
      const led = addMesh(
        pack,
        new THREE.CylinderGeometry(0.028, 0.028, 0.012, 12),
        emissive(0x63dfa4),
        [0, 0, side * 0.16],
      );
      led.rotation.x = Math.PI / 2;
      led.userData.part = "battery";
      this.batteries.add(pack);
    }
  }

  private buildComputer(): void {
    const box = addMesh(
      this.computer,
      new THREE.BoxGeometry(0.26, 0.18, 0.09),
      panelWhite(),
      [0, 0.12, 0.45],
    );
    box.userData.part = "computer";
    const face = addMesh(
      this.computer,
      new THREE.BoxGeometry(0.22, 0.14, 0.012),
      nearBlack(),
      [0, 0.12, 0.499],
    );
    face.userData.part = "computer";
    for (let index = 0; index < 3; index += 1) {
      const led = addMesh(
        this.computer,
        new THREE.BoxGeometry(0.014, 0.014, 0.01),
        this.ledMaterial,
        [-0.06 + index * 0.035, 0.15, 0.508],
      );
      led.userData.part = "computer";
    }
    const shield = addMesh(
      this.computer,
      new THREE.BoxGeometry(0.29, 0.015, 0.1),
      darkMetal(),
      [0, 0.215, 0.45],
    );
    shield.userData.part = "computer";
  }

  private buildAdcs(): void {
    const trackerBody = addMesh(
      this.adcs,
      new THREE.CylinderGeometry(0.045, 0.05, 0.09, 12),
      darkMetal(),
      [0.33, DECK_Y + 0.045, -0.24],
    );
    trackerBody.userData.part = "adcs";
    const hood = addMesh(
      this.adcs,
      new THREE.CylinderGeometry(0.06, 0.05, 0.03, 12),
      panelWhite(),
      [0.33, DECK_Y + 0.1, -0.24],
    );
    hood.userData.part = "adcs";

    for (let index = 0; index < 3; index += 1) {
      const wheel = addMesh(
        this.adcs,
        new THREE.TorusGeometry(0.075, 0.012, 6, 20),
        darkMetal(),
        [0, -0.34, 0],
      );
      wheel.rotation.x = Math.PI / 2;
      wheel.rotation.z = (index * Math.PI) / 3;
      wheel.userData.part = "adcs";
    }
  }

  private buildRecorder(): void {
    const body = addMesh(
      this.recorder,
      new THREE.BoxGeometry(0.2, 0.12, 0.08),
      darkMetal(),
      [0, -0.05, 0.45],
    );
    body.userData.part = "dataStorage";
    for (let index = 0; index < 3; index += 1) {
      const slot = addMesh(
        this.recorder,
        new THREE.BoxGeometry(0.17, 0.016, 0.006),
        panelWhite(),
        [0, 0.005 - index * 0.032, 0.492],
      );
      slot.userData.part = "dataStorage";
    }
  }

  private buildPropulsion(): void {
    const cap = addMesh(
      this.propulsion,
      new THREE.CylinderGeometry(0.16, 0.2, 0.1, 16),
      darkMetal(),
      [0, -0.57, 0],
    );
    cap.userData.part = "propulsion";
    const nozzle = addMesh(
      this.propulsion,
      new THREE.CylinderGeometry(0.08, 0.16, 0.18, 18, 1, true),
      nearBlack(),
      [0, -0.68, 0],
    );
    nozzle.userData.part = "propulsion";

    const plume = new THREE.Mesh(
      new THREE.ConeGeometry(0.11, 0.6, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x7ce9ff,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    plume.position.set(0, -1.0, 0);
    plume.rotation.z = Math.PI;
    plume.userData.plume = true;
    plume.visible = false;
    this.propulsion.add(plume);
  }

  private syncStructure(component: BusComponent | undefined): void {
    if (!this.changed("structure", component?.id)) return;
    const heavy = component ? component.massKg > 10 : false;
    this.spin.scale.setScalar(heavy ? 1.02 : 0.97);
  }

  private syncSolar(component: BusComponent | undefined): void {
    const id = component?.id ?? "none";
    if (!this.changed("solarPanel", id)) return;
    const area = component?.performance.solarAreaM2 ?? 0.3;
    this.solarTarget = component ? Math.min(1, Math.max(0.42, area / 0.45)) : 0.04;
  }

  private syncBattery(component: BusComponent | undefined): void {
    if (!this.changed("battery", component?.id)) return;
    this.batteries.visible = Boolean(component);
    const capacity = component?.performance.batteryCapacityWh ?? 90;
    for (const pack of this.batteries.children) {
      pack.scale.y = capacity > 150 ? 1.18 : 0.94;
    }
  }

  private syncComputer(component: BusComponent | undefined): void {
    if (!this.changed("computer", component?.id)) return;
    this.computer.visible = Boolean(component);
    const hardening = component?.performance.radiationHardeningFraction ?? 0.35;
    this.ledMaterial.emissive.set(hardening > 0.6 ? 0x63dfa4 : 0xf0b45c);
  }

  private syncAdcs(component: BusComponent | undefined): void {
    if (!this.changed("adcs", component?.id)) return;
    this.adcs.visible = Boolean(component);
    const accuracy = component?.performance.pointingAccuracyArcsec ?? 600;
    this.adcs.scale.setScalar(accuracy < 100 ? 1.08 : 0.95);
  }

  private syncAntenna(component: BusComponent | undefined): void {
    if (!this.changed("antenna", component?.id)) return;
    disposeObject(this.antenna);
    this.antenna.clear();
    if (!component) {
      this.antenna.visible = false;
      return;
    }
    this.antenna.visible = true;
    const gain = component.performance.antennaGainDb ?? 3;
    const radius = THREE.MathUtils.clamp(0.1 + gain * 0.0075, 0.11, 0.24);

    const mount = new THREE.Group();
    mount.position.set(0.31, DECK_Y + 0.02, -0.2);
    this.antenna.add(mount);

    const mast = addMesh(
      mount,
      new THREE.CylinderGeometry(0.016, 0.02, 0.26, 10),
      darkMetal(),
      [0, 0.13, 0],
    );
    mast.userData.part = "antenna";

    const dishGroup = new THREE.Group();
    dishGroup.position.set(0, 0.27, 0);
    dishGroup.rotation.x = -0.3;
    mount.add(dishGroup);

    const points: THREE.Vector2[] = [];
    const segments = 16;
    for (let index = 0; index <= segments; index += 1) {
      const t = index / segments;
      points.push(new THREE.Vector2(t * radius, (t * t * radius) / 2.4));
    }
    const dish = new THREE.Mesh(
      new THREE.LatheGeometry(points, 24),
      new THREE.MeshStandardMaterial({
        color: 0xcfdae4,
        metalness: 0.35,
        roughness: 0.4,
        side: THREE.DoubleSide,
      }),
    );
    dish.rotation.x = Math.PI;
    dish.userData.part = "antenna";
    dishGroup.add(dish);

    const feed = addMesh(
      dishGroup,
      new THREE.CylinderGeometry(0.012, 0.012, radius * 1.5, 8),
      darkMetal(),
      [0, -radius * 0.55, 0],
    );
    feed.userData.part = "antenna";
    const horn = addMesh(
      dishGroup,
      new THREE.CylinderGeometry(0.026, 0.016, 0.04, 10),
      emissive(0x55d9e8, 0.9),
      [0, -radius * 1.28, 0],
    );
    horn.userData.part = "antenna";
    this.dishTip = horn;
  }

  private syncRecorder(component: BusComponent | undefined): void {
    if (!this.changed("dataStorage", component?.id)) return;
    this.recorder.visible = Boolean(component);
    const capacity = component?.performance.storageGB ?? 64;
    this.recorder.scale.y = capacity > 300 ? 1.25 : 0.92;
  }

  private syncPropulsion(component: BusComponent | undefined): void {
    if (!this.changed("propulsion", component?.id)) return;
    const existing = this.propulsion.children.find(
      (child) => child.userData.nozzle === true,
    );
    if (existing) {
      disposeObject(existing);
      this.propulsion.remove(existing);
    }
    this.propulsion.visible = Boolean(component);
    if (!component) return;
    const nozzle = addMesh(
      this.propulsion,
      new THREE.CylinderGeometry(0.07, 0.17, 0.2, 18, 1, true),
      nearBlack(),
      [0, -0.7, 0],
    );
    nozzle.userData.nozzle = true;
    nozzle.userData.part = "propulsion";
    const throat = addMesh(
      this.propulsion,
      new THREE.CylinderGeometry(0.1, 0.07, 0.08, 16),
      darkMetal(),
      [0, -0.59, 0],
    );
    throat.userData.nozzle = true;
    throat.userData.part = "propulsion";
  }

  private syncBays(bays: Array<StageBay | null>): void {
    for (let index = 0; index < PAYLOAD_BAY_COUNT; index += 1) {
      const bay = this.bayGroups[index];
      if (!bay) continue;
      const entry = bays[index] ?? null;
      const id = entry ? `${entry.instrument.id}:${entry.qty}` : "empty";
      this.bayOccupied[index] = Boolean(entry);
      if (this.changed(`bay:${index}`, id)) {
        for (const child of [...bay.children]) {
          disposeObject(child);
          bay.remove(child);
        }
        if (entry) {
          const model = buildInstrument(entry.instrument);
          model.position.y = 0.01;
          bay.add(model);
          for (let copy = 1; copy < Math.min(3, entry.qty); copy += 1) {
            const duplicate = buildInstrument(entry.instrument);
            duplicate.position.y = 0.01 + copy * 0.02;
            duplicate.position.z = copy * -0.02;
            duplicate.scale.setScalar(0.94);
            bay.add(duplicate);
          }
        } else {
          const pad = new THREE.Mesh(
            new THREE.CylinderGeometry(0.066, 0.066, 0.012, 16),
            new THREE.MeshStandardMaterial({
              color: 0x0e1f2c,
              emissive: 0x147a8c,
              emissiveIntensity: 0.3,
              roughness: 0.65,
            }),
          );
          pad.position.y = 0.006;
          bay.add(pad);
        }
      }
      for (const child of bay.children) {
        child.traverse((object) => {
          object.userData.part = `bay:${index}`;
        });
      }
    }
  }

  private changed(key: string, id: string | undefined): boolean {
    const next = id ?? "none";
    if (this.cachedIds.get(key) === next) return false;
    this.cachedIds.set(key, next);
    return true;
  }

  private groupFor(part: StagePartId): THREE.Object3D | null {
    if (part.startsWith("bay:")) {
      const index = Number(part.slice(4));
      return this.bayGroups[index] ?? null;
    }
    switch (part) {
      case "structure":
        return this.structure;
      case "solarPanel":
        return this.solarTilt;
      case "battery":
        return this.batteries;
      case "computer":
        return this.computer;
      case "adcs":
        return this.adcs;
      case "antenna":
        return this.antenna;
      case "dataStorage":
        return this.recorder;
      case "propulsion":
        return this.propulsion;
      default:
        return null;
    }
  }

  private refreshPicks(): void {
    for (const proxy of this.proxies) {
      proxy.parent?.remove(proxy);
      proxy.geometry.dispose();
      (proxy.material as THREE.Material).dispose();
    }
    this.proxies.length = 0;
    this.pickables = [];
    for (const group of [
      this.structure,
      this.solarTilt,
      this.batteries,
      this.computer,
      this.adcs,
      this.antenna,
      this.recorder,
      this.propulsion,
      ...this.bayGroups,
    ]) {
      if (!group.visible) continue;
      group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        if (!object.userData.part) return;
        this.pickables.push(object);
      });
    }

    for (const [part, size] of [
      ["battery", 0.3],
      ["computer", 0.3],
      ["adcs", 0.3],
      ["dataStorage", 0.26],
      ["propulsion", 0.3],
      ["antenna", 0.36],
    ] as Array<[BusCategory, number]>) {
      const group = this.groupFor(part);
      if (!group || !group.visible) continue;
      const proxy = new THREE.Mesh(
        new THREE.SphereGeometry(size * 0.5, 8, 6),
        new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      );
      proxy.userData.part = part;
      proxy.userData.proxy = true;
      group.add(proxy);
      this.proxies.push(proxy);
      this.pickables.push(proxy);
    }
  }

  private refreshSelection(): void {
    if (!this.selected) {
      this.selectionEdges.visible = false;
      return;
    }
    const group = this.groupFor(this.selected);
    if (!group || !group.visible) {
      this.selectionEdges.visible = false;
      return;
    }
    this.spin.updateMatrixWorld(true);
    this.selectionBox.setFromObject(group);
    if (this.selectionBox.isEmpty()) {
      this.selectionEdges.visible = false;
      return;
    }
    const size = this.selectionBox.getSize(new THREE.Vector3());
    const center = this.selectionBox.getCenter(new THREE.Vector3());
    this.selectionEdges.visible = true;
    this.selectionEdges.scale.set(
      Math.max(0.12, size.x + 0.08),
      Math.max(0.12, size.y + 0.08),
      Math.max(0.12, size.z + 0.08),
    );
    this.selectionEdges.position.copy(this.spin.worldToLocal(center));
    this.selectionEdges.quaternion.identity();
  }

  private positionMarkers(): void {
    for (const child of [...this.markers.children]) {
      this.markers.remove(child);
      disposeObject(child);
    }
    this.spin.updateMatrixWorld(true);
    for (const part of [
      "structure",
      "solarPanel",
      "battery",
      "computer",
      "adcs",
      "antenna",
      "dataStorage",
      "propulsion",
    ] as BusCategory[]) {
      const group = this.groupFor(part);
      if (!group || !group.visible) continue;
      const box = new THREE.Box3().setFromObject(group);
      if (box.isEmpty()) continue;
      const marker = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.045),
        new THREE.MeshBasicMaterial({ color: 0xff6f6f }),
      );
      const anchor = box.getCenter(new THREE.Vector3());
      anchor.y = box.max.y + 0.09;
      marker.position.copy(this.spin.worldToLocal(anchor));
      marker.visible = false;
      marker.userData.part = part;
      this.markers.add(marker);
    }
    if (this.bayOccupied.some((occupied) => occupied)) {
      const box = new THREE.Box3().setFromObject(this.structure);
      if (!box.isEmpty()) {
        const marker = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.045),
          new THREE.MeshBasicMaterial({ color: 0xff6f6f }),
        );
        const anchor = box.getCenter(new THREE.Vector3());
        anchor.y = box.max.y + 0.1;
        marker.position.copy(this.spin.worldToLocal(anchor));
        marker.visible = false;
        marker.userData.part = "payload";
        this.markers.add(marker);
      }
    }
    this.applyMarkerSeverity();
  }

  private applyMarkerSeverity(): void {
    for (const marker of this.markers.children) {
      const part = marker.userData.part as BusCategory | "payload";
      const severity = this.severities[part] ?? "ok";
      const mesh = marker as THREE.Mesh;
      const material = mesh.material as THREE.MeshBasicMaterial;
      mesh.visible = severity !== "ok";
      material.color.set(
        severity === "fail" ? 0xff6f6f : severity === "warning" ? 0xf0b45c : 0x63dfa4,
      );
    }
  }
}

function buildInstrument(instrument: Instrument): THREE.Group {
  const group = new THREE.Group();
  const scale = THREE.MathUtils.clamp(0.72 + instrument.massKg / 55, 0.74, 1.18);
  const body = new THREE.MeshStandardMaterial({
    color: 0xd8e4ee,
    metalness: 0.22,
    roughness: 0.46,
  });
  const trim = new THREE.MeshStandardMaterial({
    color: 0x2a3d4e,
    metalness: 0.5,
    roughness: 0.42,
  });
  const accentColor = instrument.scienceTags.includes("earth-imaging")
    ? 0x55d9e8
    : instrument.scienceTags.includes("magnetic-fields") ||
        instrument.scienceTags.includes("space-weather")
      ? 0x6aa8ff
      : instrument.scienceTags.includes("atmosphere") ||
          instrument.scienceTags.includes("temperature")
        ? 0x2aa7b8
        : 0xf0b45c;
  const accent = emissive(accentColor, 1.1);

  addMesh(group, new THREE.CylinderGeometry(0.072, 0.08, 0.026, 14), trim, [
    0,
    0.013,
    0,
  ]);

  const tags = instrument.scienceTags;
  if (tags.includes("astronomy")) {
    const yoke = addMesh(group, new THREE.BoxGeometry(0.1, 0.05, 0.04), trim, [
      0,
      0.05,
      0,
    ]);
    yoke.rotation.y = Math.PI / 2;
    const tube = addMesh(
      group,
      new THREE.CylinderGeometry(0.05, 0.058, 0.26, 16),
      body,
      [0, 0.14, 0],
    );
    tube.rotation.z = Math.PI / 2.6;
    const lens = addMesh(
      group,
      new THREE.CylinderGeometry(0.052, 0.052, 0.012, 16),
      accent,
      [0.105, 0.19, 0],
    );
    lens.rotation.z = Math.PI / 2.6;
  } else if (tags.includes("magnetic-fields")) {
    addMesh(
      group,
      new THREE.CylinderGeometry(0.012, 0.014, 0.3, 8),
      trim,
      [0, 0.16, 0],
    );
    addMesh(group, new THREE.SphereGeometry(0.038, 12, 10), body, [0, 0.32, 0]);
    addMesh(group, new THREE.BoxGeometry(0.11, 0.012, 0.012), trim, [0, 0.24, 0]);
    addMesh(group, new THREE.SphereGeometry(0.015, 8, 6), accent, [0.06, 0.24, 0]);
  } else if (tags.includes("earth-imaging") || tags.includes("imaging")) {
    addMesh(group, new THREE.BoxGeometry(0.15, 0.16, 0.12), body, [0, 0.1, 0]);
    const lens = addMesh(
      group,
      new THREE.CylinderGeometry(0.045, 0.05, 0.06, 14),
      trim,
      [0, 0.1, 0.08],
    );
    lens.rotation.x = Math.PI / 2;
    addMesh(
      group,
      new THREE.CylinderGeometry(0.032, 0.032, 0.008, 14),
      accent,
      [0, 0.1, 0.113],
    ).rotation.x = Math.PI / 2;
    addMesh(group, new THREE.BoxGeometry(0.11, 0.02, 0.02), accent, [0, 0.195, 0.03]);
  } else if (tags.includes("atmosphere") || tags.includes("minerals")) {
    addMesh(group, new THREE.BoxGeometry(0.16, 0.15, 0.13), body, [0, 0.09, 0]);
    for (let index = 0; index < 3; index += 1) {
      addMesh(
        group,
        new THREE.BoxGeometry(0.1, 0.008, 0.004),
        accent,
        [0, 0.06 + index * 0.03, 0.067],
      );
    }
    addMesh(group, new THREE.BoxGeometry(0.07, 0.03, 0.05), trim, [0, 0.18, -0.02]);
  } else if (tags.includes("temperature")) {
    addMesh(group, new THREE.CylinderGeometry(0.07, 0.08, 0.13, 14), body, [0, 0.08, 0]);
    const hood = addMesh(
      group,
      new THREE.CylinderGeometry(0.085, 0.06, 0.05, 14, 1, true),
      trim,
      [0, 0.17, 0],
    );
    hood.rotation.x = Math.PI;
    addMesh(group, new THREE.BoxGeometry(0.1, 0.012, 0.012), accent, [0, 0.06, 0.075]);
  } else if (tags.includes("radiation") || tags.includes("solar-wind")) {
    addMesh(group, new THREE.SphereGeometry(0.065, 14, 10), body, [0, 0.08, 0]);
    for (let index = 0; index < 4; index += 1) {
      const fin = addMesh(
        group,
        new THREE.BoxGeometry(0.012, 0.1, 0.05),
        trim,
        [0, 0.08, 0],
      );
      fin.rotation.y = (index * Math.PI) / 2;
      fin.position.x = Math.sin(fin.rotation.y) * 0.075;
      fin.position.z = Math.cos(fin.rotation.y) * 0.075;
    }
    addMesh(group, new THREE.SphereGeometry(0.02, 10, 8), accent, [0, 0.15, 0]);
  } else {
    addMesh(group, new THREE.BoxGeometry(0.15, 0.14, 0.12), body, [0, 0.08, 0]);
    addMesh(group, new THREE.CylinderGeometry(0.035, 0.035, 0.02, 12), accent, [
      0,
      0.16,
      0,
    ]);
  }

  addMesh(group, new THREE.BoxGeometry(0.02, 0.006, 0.006), accent, [0.06, 0.04, 0.065]);
  group.scale.setScalar(scale);
  return group;
}
