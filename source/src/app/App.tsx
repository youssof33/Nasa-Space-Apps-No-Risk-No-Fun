import { useEffect, useState } from "preact/hooks";
import { appState } from "../ui/state/store";
import { routeVeil } from "../ui/state/transition";
import { AboutModal } from "./shell/AboutModal";
import { DiagnosticsBanner } from "./shell/DiagnosticsBanner";
import { SettingsModal } from "./shell/SettingsModal";
import { ToastHost } from "./shell/ToastHost";
import { PartyModal } from "../multiplayer/PartyModal";
import { BriefScreen } from "./screens/BriefScreen";
import { DesignScreen } from "./screens/DesignScreen";
import { LaunchScreen } from "./screens/LaunchScreen";
import { NotFoundScreen } from "./screens/NotFoundScreen";
import { ScenarioSelectScreen } from "./screens/ScenarioSelectScreen";

type ModalName = "about" | "settings" | "party" | null;

/* The brief and the launch are full-screen stages that bring their own chrome. */
const IMMERSIVE = new Set(["briefing", "launch"]);

export function App() {
  const route = appState.value.route;
  const veil = routeVeil.value;
  const [modal, setModal] = useState<ModalName>(null);
  const immersive = IMMERSIVE.has(route.name);

  useEffect(() => {
    setModal(null);
  }, [route]);

  return (
    <div class={`app${immersive ? " app--immersive" : ""}`}>
      {!immersive && <DiagnosticsBanner />}
      <main class="app__main">
        {route.name === "select" && (
          <ScenarioSelectScreen
            onAbout={() => setModal("about")}
            onSettings={() => setModal("settings")}
            onParty={() => setModal("party")}
          />
        )}
        {route.name === "briefing" && <BriefScreen scenarioId={route.scenarioId} />}
        {route.name === "workbench" && <DesignScreen scenarioId={route.scenarioId} />}
        {route.name === "launch" && <LaunchScreen scenarioId={route.scenarioId} />}
        {route.name === "not-found" && <NotFoundScreen />}
      </main>
      <ToastHost />
      <div
        class={`route-veil${veil.visible ? " is-visible" : ""}`}
        aria-hidden={!veil.visible}
      >
        <div class="route-veil__mark">
          <span>{veil.label || "Linking stage"}</span>
        </div>
      </div>
      <AboutModal open={modal === "about"} onClose={() => setModal(null)} />
      <SettingsModal open={modal === "settings"} onClose={() => setModal(null)} />
      <PartyModal open={modal === "party"} onClose={() => setModal(null)} />
    </div>
  );
}
