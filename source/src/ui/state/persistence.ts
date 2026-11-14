export type QualitySetting = "auto" | "high" | "low";

export interface Settings {
  quality: QualitySetting;
  reducedMotion: boolean;
}

export interface PersistedState {
  settings: Settings;
  lastScenarioId: string | null;
}

export const defaultSettings: Settings = {
  quality: "auto",
  reducedMotion: false,
};

const STORAGE_KEY = "spacex:v1";

export function loadPersisted(): PersistedState {
  const fallback: PersistedState = { settings: { ...defaultSettings }, lastScenarioId: null };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return fallback;
    return {
      settings: readSettings(parsed.settings),
      lastScenarioId: typeof parsed.lastScenarioId === "string" ? parsed.lastScenarioId : null,
    };
  } catch {
    return fallback;
  }
}

export function savePersisted(state: PersistedState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage can be unavailable or full; the session still works without it.
  }
}

function readSettings(value: unknown): Settings {
  if (!isRecord(value)) return { ...defaultSettings };
  const quality: QualitySetting =
    value.quality === "high" || value.quality === "low" ? value.quality : "auto";
  return {
    quality,
    reducedMotion: value.reducedMotion === true,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
