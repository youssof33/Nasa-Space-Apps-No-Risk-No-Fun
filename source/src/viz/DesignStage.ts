import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Orbit } from "../data/types";
import type { QualitySetting } from "../ui/state/persistence";
import { assetUrl, loadManifest, pickVariant } from "./assets";
import { Earth } from "./bodies/Earth";
import { createStarfield } from "./bodies/Starfield";
import { resolveQuality, type ResolvedQuality } from "./quality";
import {
  Spacecraft,
  type StageModel,
  type StagePartId,
} from "./spacecraft/Spacecraft";

export interface DesignStageCallbacks {
  onSelect: (part: StagePartId | null) => void;
  onReady?: () => void;
  onProgress?: (fraction: number) => void;
  onFallback?: (message: string) => void;
}

/** The part of the screen the panel leaves free, in CSS pixels. */
export interface ViewBand {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const EARTH_POSITION = new THREE.Vector3(1.15, -3.45, -2.9);
const EARTH_RADIUS = 2.55;

export class DesignStage {
  private host: HTMLElement | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 160);
  private controls: OrbitControls | null = null;
  private earth: Earth | null = null;
  private readonly spacecraft = new Spacecraft();
  private callbacks: DesignStageCallbacks = { onSelect: () => undefined };
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private resizeObserver: ResizeObserver | null = null;
  private viewBand: ViewBand | null = null;
  private readonly craftBox = new THREE.Box3(
    new THREE.Vector3(-0.85, -0.8, -0.6),
    new THREE.Vector3(0.85, 0.8, 0.6),
  );
  private lastFrame = 0;
  private elapsed = 0;
  private reducedMotion = false;
  private qualitySetting: QualitySetting = "auto";
  private resolvedQuality: ResolvedQuality = "high";
  private textureToken = 0;
  private disposed = false;
  private dragging = false;
  private pointerDown: { x: number; y: number } | null = null;
  private model: StageModel = { bus: {}, bays: [null, null, null, null] };

  private readonly sun = new THREE.DirectionalLight(0xfff1dc, 3.1);
  private readonly rim = new THREE.DirectionalLight(0x54c8ff, 1.6);
  private readonly sunDirection = new THREE.Vector3(-0.6, 0.42, 0.68).normalize();
  private readonly earthDirection = new THREE.Vector3();

  private readonly orbitRings = new THREE.Group();
  private ringMaterials: THREE.LineBasicMaterial[] = [];
  private ringTargetScale = 1;
  private ringScale = 1;
  private orbitSet = false;

  private linkLine: THREE.Line | null = null;
  private readonly packets: THREE.Mesh[] = [];
  private linkColor = 0x55d9e8;
  private station: THREE.Group | null = null;
  private readonly dishTip = new THREE.Vector3();
  private readonly stationPoint = new THREE.Vector3();
  private readonly linkCurve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
  );

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this.pointerDown = { x: event.clientX, y: event.clientY };
    this.dragging = false;
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (this.pointerDown) {
      const dx = event.clientX - this.pointerDown.x;
      const dy = event.clientY - this.pointerDown.y;
      if (dx * dx + dy * dy > 36) this.dragging = true;
      if (this.dragging) return;
    }
    this.updatePointer(event.clientX, event.clientY);
    const hit = this.spacecraft.raycast(this.raycaster);
    if (this.renderer) {
      this.renderer.domElement.style.cursor = hit ? "pointer" : "grab";
    }
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    const wasDragging = this.dragging;
    this.pointerDown = null;
    this.dragging = false;
    if (wasDragging) return;
    this.updatePointer(event.clientX, event.clientY);
    const part = this.spacecraft.raycast(this.raycaster);
    this.callbacks.onSelect(part);
  };

  private readonly onVisibility = (): void => {
    if (document.hidden) {
      this.renderer?.setAnimationLoop(null);
    } else {
      this.lastFrame = performance.now();
      this.startLoop();
    }
  };

  async mount(host: HTMLElement, callbacks: DesignStageCallbacks): Promise<void> {
    this.host = host;
    this.callbacks = callbacks;
    this.disposed = false;
    this.resolvedQuality = resolveQuality(this.qualitySetting);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.domElement.classList.add("scene-canvas");
    renderer.domElement.setAttribute("aria-hidden", "true");
    host.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.camera.position.set(3.05, 1.3, 4.45);
    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.rotateSpeed = 0.5;
    this.controls.zoomSpeed = 0.6;
    this.controls.minDistance = 2.3;
    this.controls.maxDistance = 6.4;
    this.controls.minPolarAngle = Math.PI * 0.18;
    this.controls.maxPolarAngle = Math.PI * 0.78;
    this.controls.target.set(0, -0.38, 0);
    this.camera.lookAt(this.controls.target);
    this.camera.updateMatrixWorld();

    this.scene.add(new THREE.HemisphereLight(0xa8d8ff, 0x07101a, 0.55));
    this.sun.position.copy(this.sunDirection).multiplyScalar(12);
    this.scene.add(this.sun);
    this.rim.position.set(4.5, -1.5, -5);
    this.scene.add(this.rim);
    const accent = new THREE.PointLight(0x2aa7b8, 8, 9, 2);
    accent.position.set(-2, 0.6, 2.4);
    this.scene.add(accent);
    const fill = new THREE.DirectionalLight(0x9fc8e8, 0.65);
    fill.position.set(2.4, 1.8, 4.2);
    this.scene.add(fill);

    this.earth = new Earth();
    this.earth.group.position.copy(EARTH_POSITION);
    this.earth.group.scale.setScalar(EARTH_RADIUS);
    this.scene.add(this.earth.group);

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.13, 48, 48),
      new THREE.ShaderMaterial({
        vertexShader: /* glsl */ `
          varying vec3 vNormal;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec3 vNormal;
          void main() {
            float intensity = pow(0.62 - dot(normalize(vNormal), vec3(0.0, 0.0, 1.0)), 4.0);
            gl_FragColor = vec4(0.18, 0.58, 1.0, 1.0) * max(intensity, 0.0);
            #include <colorspace_fragment>
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    atmosphere.position.copy(EARTH_POSITION);
    atmosphere.scale.setScalar(EARTH_RADIUS);
    atmosphere.renderOrder = -1;
    this.scene.add(atmosphere);

    this.scene.add(createStarfield());
    this.buildOrbitRings();
    this.buildLink();
    this.scene.add(this.spacecraft.root);
    this.spacecraft.setModel(this.model);

    renderer.domElement.addEventListener("pointerdown", this.onPointerDown);
    renderer.domElement.addEventListener("pointermove", this.onPointerMove);
    renderer.domElement.addEventListener("pointerup", this.onPointerUp);
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__orbitStage = this;
    }

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();

    document.addEventListener("visibilitychange", this.onVisibility);
    this.lastFrame = performance.now();
    this.startLoop();
    void this.loadTextures();
  }

  setModel(model: StageModel): void {
    this.model = model;
    this.spacecraft.setModel(model);
    this.spacecraft.root.updateMatrixWorld(true);
    this.craftBox.setFromObject(this.spacecraft.root);
    if (this.viewBand) this.resize();
  }

  setSelection(part: StagePartId | null): void {
    this.spacecraft.setSelection(part);
  }

  setFindings(
    severities: Partial<
      Record<
        | "structure"
        | "solarPanel"
        | "battery"
        | "computer"
        | "adcs"
        | "antenna"
        | "dataStorage"
        | "propulsion"
        | "payload",
        "ok" | "warning" | "fail"
      >
    >,
  ): void {
    this.spacecraft.setFindings(severities);
    const antenna = severities.antenna;
    this.linkColor =
      antenna === "fail" ? 0xff6f6f : antenna === "warning" ? 0xf0b45c : 0x55d9e8;
    if (this.linkLine) {
      (this.linkLine.material as THREE.LineBasicMaterial).color.setHex(this.linkColor);
    }
    for (const packet of this.packets) {
      (packet.material as THREE.MeshBasicMaterial).color.setHex(this.linkColor);
    }
  }

  setOrbit(orbit: Orbit): void {
    const normalized = Math.min(1, Math.max(0, orbit.altitudeKm / 36000));
    this.ringTargetScale = 0.92 + normalized * 0.42;
    this.ringMaterials.forEach((material, index) => {
      const active = index === 0;
      material.color.set(active ? 0x55d9e8 : 0x3b7891);
      material.opacity = active ? 0.5 : 0.16;
    });
    if (this.orbitSet) this.spacecraft.burn(1.6);
    this.orbitSet = true;
  }

  bayAtScreen(clientX: number, clientY: number): number | null {
    this.updatePointer(clientX, clientY);
    return this.spacecraft.bayAt(this.raycaster);
  }

  partAtScreen(clientX: number, clientY: number): StagePartId | null {
    this.updatePointer(clientX, clientY);
    return this.spacecraft.raycast(this.raycaster);
  }

  setQuality(quality: QualitySetting): void {
    this.qualitySetting = quality;
    const resolved = resolveQuality(quality);
    if (resolved === this.resolvedQuality) return;
    this.resolvedQuality = resolved;
    this.applyPixelRatio();
    this.resize();
    void this.loadTextures();
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
  }

  dispose(): void {
    this.disposed = true;
    this.textureToken += 1;
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    const canvas = this.renderer?.domElement;
    canvas?.removeEventListener("pointerdown", this.onPointerDown);
    canvas?.removeEventListener("pointermove", this.onPointerMove);
    canvas?.removeEventListener("pointerup", this.onPointerUp);
    this.renderer?.setAnimationLoop(null);
    this.controls?.dispose();
    this.controls = null;
    this.earth?.dispose();
    this.earth = null;
    this.spacecraft.dispose();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line) {
        object.geometry.dispose();
        const material = object.material;
        if (Array.isArray(material)) {
          for (const entry of material) entry.dispose();
        } else {
          material.dispose();
        }
      }
    });
    this.scene.clear();
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    this.renderer = null;
    this.host = null;
  }

  private buildOrbitRings(): void {
    this.orbitRings.position.copy(EARTH_POSITION);
    this.orbitRings.rotation.x = Math.PI / 2 - 0.18;
    this.orbitRings.rotation.z = -0.24;
    for (let index = 0; index < 3; index += 1) {
      const radius = 3.2 + index * 0.28;
      const points: THREE.Vector3[] = [];
      for (let step = 0; step < 160; step += 1) {
        const angle = (step / 160) * Math.PI * 2;
        points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
      }
      const material = new THREE.LineBasicMaterial({
        color: index === 0 ? 0x55d9e8 : 0x3b7891,
        transparent: true,
        opacity: index === 0 ? 0.5 : 0.16,
      });
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      this.orbitRings.add(new THREE.LineLoop(geometry, material));
      this.ringMaterials.push(material);
    }
    this.orbitRings.scale.setScalar(this.ringScale);
    this.scene.add(this.orbitRings);
  }

  private buildLink(): void {
    const geometry = new THREE.BufferGeometry().setFromPoints(
      Array.from({ length: 24 }, () => new THREE.Vector3()),
    );
    this.linkLine = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({
        color: this.linkColor,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.linkLine.frustumCulled = false;
    this.scene.add(this.linkLine);

    for (let index = 0; index < 7; index += 1) {
      const packet = new THREE.Mesh(
        new THREE.SphereGeometry(0.014, 8, 6),
        new THREE.MeshBasicMaterial({
          color: this.linkColor,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      this.packets.push(packet);
      this.scene.add(packet);
    }

    const station = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.09, 0.008, 6, 32),
      new THREE.MeshBasicMaterial({
        color: 0x55d9e8,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    station.add(ring);
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.022, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x8ff1fb }),
    );
    station.add(dot);
    this.station = station;
    this.scene.add(station);
  }

  private startLoop(): void {
    const renderer = this.renderer;
    if (!renderer) return;
    renderer.setAnimationLoop(() => {
      const now = performance.now();
      const delta = Math.min((now - this.lastFrame) / 1000, 0.05);
      this.lastFrame = now;
      this.elapsed += delta;
      const motion = this.reducedMotion ? 0 : 1;

      this.spacecraft.update(delta, this.elapsed);
      this.earthDirection.copy(EARTH_POSITION).sub(this.spacecraft.root.position);
      this.spacecraft.setEarthDirection(this.earthDirection);
      if (!this.reducedMotion) {
        this.sun.position
          .copy(this.sunDirection)
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(this.elapsed * 0.06) * 0.5)
          .multiplyScalar(12);
        this.earth?.setSunDirection(this.sun.position.clone().normalize());
      }
      this.earth?.update(delta * motion);

      this.ringScale += (this.ringTargetScale - this.ringScale) * Math.min(1, delta * 2.2);
      this.orbitRings.scale.setScalar(this.ringScale);
      this.orbitRings.rotation.y += delta * 0.02 * motion;

      this.updateLink(motion);
      this.controls?.update();
      renderer.render(this.scene, this.camera);
    });
  }

  private updateLink(motion: number): void {
    const tip = this.spacecraft.getDishTip(this.dishTip);
    const linkMaterial = this.linkLine?.material;
    if (!tip || !this.linkLine || !linkMaterial) {
      if (this.linkLine) this.linkLine.visible = false;
      for (const packet of this.packets) packet.visible = false;
      if (this.station) this.station.visible = false;
      return;
    }
    this.linkLine.visible = true;
    for (const packet of this.packets) packet.visible = true;
    if (this.station) this.station.visible = true;

    this.stationPoint
      .copy(this.spacecraft.root.position)
      .sub(EARTH_POSITION)
      .normalize()
      .multiplyScalar(EARTH_RADIUS * 1.005)
      .add(EARTH_POSITION);
    if (this.station) {
      this.station.position.copy(this.stationPoint);
      this.station.lookAt(tip);
    }

    const mid = tip.clone().lerp(this.stationPoint, 0.5);
    mid.y += 0.85;
    mid.z += 0.35;
    this.linkCurve.v0.copy(tip);
    this.linkCurve.v1.copy(mid);
    this.linkCurve.v2.copy(this.stationPoint);

    const positions = (this.linkLine.geometry.getAttribute("position") as THREE.BufferAttribute)
      .array as Float32Array;
    const point = new THREE.Vector3();
    for (let index = 0; index < 24; index += 1) {
      this.linkCurve.getPoint(index / 23, point);
      positions[index * 3] = point.x;
      positions[index * 3 + 1] = point.y;
      positions[index * 3 + 2] = point.z;
    }
    this.linkLine.geometry.getAttribute("position").needsUpdate = true;

    for (const [index, packet] of this.packets.entries()) {
      const t = ((this.elapsed * 0.22 * motion + index / this.packets.length) % 1 + 1) % 1;
      this.linkCurve.getPoint(t, packet.position);
      const fade = Math.sin(t * Math.PI);
      (packet.material as THREE.MeshBasicMaterial).opacity = 0.25 + fade * 0.7;
      packet.scale.setScalar(0.7 + fade * 0.7);
    }
  }

  private updatePointer(clientX: number, clientY: number): void {
    const canvas = this.renderer?.domElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  private resize(): void {
    const host = this.host;
    const renderer = this.renderer;
    if (!host || !renderer) return;
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    this.applyPixelRatio();
    renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    if (this.viewBand) this.frameInBand(this.viewBand, width, height);
  }

  /**
   * Keep the assembly centred in the free part of the screen. The projection is
   * offset instead of the camera, so orbit controls and picking stay exact.
   */
  private frameInBand(band: ViewBand, width: number, height: number): void {
    const bandWidth = band.right - band.left;
    const bandHeight = band.bottom - band.top;
    if (bandWidth < 80 || bandHeight < 80) return;

    const v = new THREE.Vector3();
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const box = this.craftBox;
    for (let corner = 0; corner < 8; corner += 1) {
      v.set(
        corner & 1 ? box.max.x : box.min.x,
        corner & 2 ? box.max.y : box.min.y,
        corner & 4 ? box.max.z : box.min.z,
      );
      v.project(this.camera);      const px = (v.x * 0.5 + 0.5) * width;
      const py = (-v.y * 0.5 + 0.5) * height;
      minX = Math.min(minX, px);
      maxX = Math.max(maxX, px);
      minY = Math.min(minY, py);
      maxY = Math.max(maxY, py);
    }

    const halfWidth = (maxX - minX) / 2;
    const halfHeight = (maxY - minY) / 2;
    const centreX = (minX + maxX) / 2;
    const centreY = (minY + maxY) / 2;

    let desiredX = (band.left + band.right) / 2;
    let desiredY = (band.top + band.bottom) / 2;
    if (halfHeight * 2 <= bandHeight) {
      desiredY = Math.min(
        Math.max(desiredY, band.top + halfHeight),
        band.bottom - halfHeight,
      );
    } else {
      /* Taller than the free strip: keep the top clear and let the sheet crop
         the base, which reads better than hiding the dish behind the header. */
      desiredY = band.top + halfHeight;
    }
    if (halfWidth * 2 > bandWidth) desiredX = (band.left + band.right) / 2;

    const shiftX = centreX - desiredX;
    const shiftY = centreY - desiredY;
    if (!Number.isFinite(shiftX) || !Number.isFinite(shiftY)) return;
    this.camera.setViewOffset(width, height, shiftX, shiftY, width, height);
    this.camera.updateProjectionMatrix();
  }

  /** The free rectangle the panel leaves; the assembly is framed inside it. */
  setViewBand(band: ViewBand): void {
    this.viewBand = band;
    this.resize();
  }

  private applyPixelRatio(): void {
    if (!this.renderer) return;
    const cap = this.resolvedQuality === "high" ? 2 : 1.25;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
  }

  private async loadTextures(): Promise<void> {
    const token = ++this.textureToken;
    const quality = this.resolvedQuality;
    const dayWidth = quality === "high" ? 4096 : 2048;
    const nightWidth = quality === "high" ? 2048 : 1024;
    const bumpWidth = quality === "high" ? 2048 : 1024;
    let loaded = 0;
    const total = 4;
    const progress = (): void => {
      loaded += 1;
      this.callbacks.onProgress?.(Math.min(1, loaded / total));
    };

    try {
      const manifest = await loadManifest();
      progress();
      if (token !== this.textureToken || this.disposed) return;
      const loader = new THREE.TextureLoader();
      const load = async (
        id: string,
        maxWidth: number,
        colorSpace: THREE.ColorSpace,
      ): Promise<THREE.Texture | null> => {
        const entry = manifest.assets[id];
        if (!entry) return null;
        const variant = pickVariant(entry, maxWidth);
        const texture = await loader.loadAsync(assetUrl(variant.file));
        texture.colorSpace = colorSpace;
        if (colorSpace === THREE.SRGBColorSpace) {
          texture.anisotropy = Math.min(
            8,
            this.renderer?.capabilities.getMaxAnisotropy() ?? 1,
          );
        }
        progress();
        return texture;
      };
      const day = await load("earth-day", dayWidth, THREE.SRGBColorSpace);
      if (!day) throw new Error("Earth day texture missing from the manifest.");
      if (token !== this.textureToken || this.disposed) {
        day.dispose();
        return;
      }
      const [night, bump] = await Promise.all([
        load("earth-night", nightWidth, THREE.SRGBColorSpace),
        load("earth-bump", bumpWidth, THREE.NoColorSpace),
      ]);
      if (token !== this.textureToken || this.disposed) {
        for (const texture of [day, night, bump]) texture?.dispose();
        return;
      }
      this.earth?.setTextures({
        day,
        night: night ?? undefined,
        bump: bump ?? undefined,
      });
      this.callbacks.onReady?.();
    } catch (error) {
      if (token !== this.textureToken || this.disposed) return;
      this.callbacks.onFallback?.(
        error instanceof Error ? error.message : "Earth imagery unavailable.",
      );
    }
  }
}
