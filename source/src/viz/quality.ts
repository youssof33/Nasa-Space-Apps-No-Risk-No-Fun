import type { QualitySetting } from "../ui/state/persistence";

export type ResolvedQuality = "high" | "low";

export function supportsWebGL2(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return canvas.getContext("webgl2") !== null;
  } catch {
    return false;
  }
}

export function resolveQuality(setting: QualitySetting): ResolvedQuality {
  if (setting !== "auto") return setting;
  const cores = navigator.hardwareConcurrency ?? 4;
  const deviceMemory =
    (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const pixelRatio = window.devicePixelRatio || 1;
  return cores >= 8 && deviceMemory >= 4 && pixelRatio <= 2 ? "high" : "low";
}
