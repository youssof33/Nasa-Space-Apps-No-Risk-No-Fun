import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { QualitySetting } from "../ui/state/persistence";
import { assetUrl, loadManifest, pickVariant } from "./assets";
import { createAtmosphere } from "./bodies/Atmosphere";
import { Earth } from "./bodies/Earth";
import { createStarfield } from "./bodies/Starfield";
import { resolveQuality, type ResolvedQuality } from "./quality";

export interface SceneCallbacks {
  onProgress?: (fraction: number) => void;
  onReady?: () => void;
  onFallback?: (message: string) => void;
}

export interface SceneManagerContract {
  mount(host: HTMLElement, callbacks: SceneCallbacks): Promise<void>;
  setQuality(quality: QualitySetting): void;
  setReducedMotion(reduced: boolean): void;
  setBody(body: "earth"): void;
  focusEarth(): void;
  dispose(): void;
}

export class SceneManager implements SceneManagerContract {
  private host: HTMLElement | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
  private controls: OrbitControls | null = null;
  private earth: Earth | null = null;
  private lastFrameTime = 0;
  private resizeObserver: ResizeObserver | null = null;
  private callbacks: SceneCallbacks = {};
  private qualitySetting: QualitySetting = "auto";
  private resolvedQuality: ResolvedQuality = "high";
  private reducedMotion = false;
  private textureToken = 0;
  private disposed = false;
  private readonly onVisibilityChange = (): void => {
    if (document.hidden) {
      this.renderer?.setAnimationLoop(null);
    } else {
      this.lastFrameTime = performance.now();
      this.startLoop();
    }
  };

  async mount(host: HTMLElement, callbacks: SceneCallbacks): Promise<void> {
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
    renderer.toneMappingExposure = 1.06;
    renderer.domElement.classList.add("scene-canvas");
    renderer.domElement.setAttribute("aria-hidden", "true");
    host.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.camera.position.set(0, 0.35, 4);
    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.65;
    this.controls.minDistance = 2.2;
    this.controls.maxDistance = 6.5;
    this.controls.target.set(0, 0, 0);

    this.earth = new Earth();
    this.scene.add(this.earth.group);
    this.scene.add(createAtmosphere());
    this.scene.add(createStarfield());

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();

    document.addEventListener("visibilitychange", this.onVisibilityChange);
    this.startLoop();
    void this.loadTextures();
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

  setBody(_body: "earth"): void {
    // The mission-select hero always shows Earth; the brief and the flight
    // scenes render the target body themselves.
  }

  focusEarth(): void {
    this.camera.position.set(0, 0.35, 4);
    this.controls?.target.set(0, 0, 0);
    this.controls?.update();
  }

  dispose(): void {
    this.disposed = true;
    this.textureToken += 1;
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.renderer?.setAnimationLoop(null);
    this.controls?.dispose();
    this.controls = null;
    this.earth?.dispose();
    this.earth = null;
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      }
    });
    this.scene.clear();
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    this.renderer = null;
    this.host = null;
    this.callbacks = {};
  }

  private startLoop(): void {
    const renderer = this.renderer;
    if (!renderer) return;
    this.lastFrameTime = performance.now();
    renderer.setAnimationLoop(() => {
      const now = performance.now();
      const delta = Math.min((now - this.lastFrameTime) / 1000, 0.05);
      this.lastFrameTime = now;
      if (!this.reducedMotion) this.earth?.update(delta);
      this.controls?.update();
      renderer.render(this.scene, this.camera);
    });
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
    this.camera.updateProjectionMatrix();
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
      if (!day) throw new Error("Earth day texture is missing from the manifest.");
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
