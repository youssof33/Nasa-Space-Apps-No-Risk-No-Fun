import { signal } from "@preact/signals";
import type { Route } from "../../app/router";
import { navigate } from "./store";

export interface RouteVeilState {
  visible: boolean;
  label: string;
}

/**
 * The one transition between the merged site's stages. The veil is fully
 * opaque before the outgoing screen unmounts, so an iframe teardown, a route
 * swap or a full-screen stage mount is never visible as a black or blank frame.
 */
export const routeVeil = signal<RouteVeilState>({ visible: false, label: "" });

let pending = false;

export function transitionTo(route: Route, label = "Linking stage"): void {
  if (typeof window === "undefined") {
    navigate(route);
    return;
  }
  if (pending) return;
  pending = true;
  routeVeil.value = { visible: true, label };

  window.setTimeout(() => {
    navigate(route);
    window.setTimeout(() => {
      routeVeil.value = { visible: false, label: "" };
      pending = false;
    }, 440);
  }, 340);
}
