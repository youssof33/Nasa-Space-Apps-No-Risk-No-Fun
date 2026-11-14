import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/inter";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./ui/design/tokens.css";
import "./ui/design/base.css";
import "./ui/design/components.css";
import "./ui/design/screens.css";
import "./ui/design/scene.css";
import "./ui/design/workbench.css";
import "./ui/design/design2.css";
import "./ui/design/integration.css";
import { render } from "preact";
import { App } from "./app/App";
import { ErrorBoundary } from "./app/shell/ErrorBoundary";
import { initRouter, startCatalogValidation } from "./ui/state/store";

const mount = document.querySelector<HTMLDivElement>("#app");

if (!mount) {
  throw new Error("SpaceX mount point #app was not found.");
}

initRouter();
startCatalogValidation();

render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
  mount,
);
