import { signal } from "@preact/signals";
import { parseRoute, routeToHash, type Route } from "../../app/router";
import { loadPersisted, savePersisted, type Settings } from "./persistence";

export interface CatalogDiagnostic {
  id: string;
  severity: "warning" | "error";
  message: string;
}

export interface Toast {
  id: number;
  message: string;
  tone: "info" | "warning" | "critical";
}

export interface AppState {
  route: Route;
  settings: Settings;
  diagnostics: CatalogDiagnostic[];
  lastScenarioId: string | null;
  toasts: Toast[];
}

const persisted = loadPersisted();

export const appState = signal<AppState>({
  route: parseRoute(typeof window === "undefined" ? "" : window.location.hash),
  settings: persisted.settings,
  diagnostics: [],
  lastScenarioId: persisted.lastScenarioId,
  toasts: [],
});

let nextToastId = 0;

export function initRouter(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("hashchange", syncRoute);
  syncRoute();
}

export function navigate(route: Route): void {
  const hash = routeToHash(route);
  appState.value = { ...appState.value, route };
  if (typeof window !== "undefined" && window.location.hash !== hash) {
    window.location.hash = hash;
  }
}

export function updateSettings(patch: Partial<Settings>): void {
  const settings = { ...appState.value.settings, ...patch };
  appState.value = { ...appState.value, settings };
  savePersisted({ settings, lastScenarioId: appState.value.lastScenarioId });
}

export function pushToast(message: string, tone: Toast["tone"] = "info"): void {
  const toast: Toast = { id: ++nextToastId, message, tone };
  appState.value = {
    ...appState.value,
    toasts: [...appState.value.toasts.slice(-2), toast],
  };
  window.setTimeout(() => dismissToast(toast.id), 5_000);
}

export function dismissToast(id: number): void {
  appState.value = {
    ...appState.value,
    toasts: appState.value.toasts.filter((toast) => toast.id !== id),
  };
}

export function setDiagnostics(diagnostics: CatalogDiagnostic[]): void {
  appState.value = { ...appState.value, diagnostics };
}

/**
 * Full catalog validation evaluates thousands of designs and takes seconds, so
 * it runs in a worker after first paint. A failure shows a banner, never a
 * blank screen.
 */
export function startCatalogValidation(): void {
  if (typeof Worker === "undefined") return;
  let worker: Worker;
  try {
    worker = new Worker(new URL("../../app/catalog-worker.ts", import.meta.url), {
      type: "module",
    });
  } catch {
    return;
  }
  worker.addEventListener("message", (event: MessageEvent<{ ok: boolean; message?: string }>) => {
    worker.terminate();
    if (event.data.ok) return;
    setDiagnostics([
      {
        id: "catalog-validation",
        severity: "error",
        message: event.data.message ?? "Catalog validation failed.",
      },
    ]);
    pushToast("Catalog validation failed. Some missions may be incomplete.", "warning");
  });
  worker.addEventListener("error", () => {
    worker.terminate();
    setDiagnostics([
      {
        id: "catalog-validation",
        severity: "warning",
        message: "Catalog validation could not run in this browser.",
      },
    ]);
  });
  worker.postMessage("validate");
}

function syncRoute(): void {
  appState.value = { ...appState.value, route: parseRoute(window.location.hash) };
}
