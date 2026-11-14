import { useEffect, useRef, useState } from "preact/hooks";
import { missionById, missionByObjective } from "../../integration/missions";
import { chooseMission, party } from "../../multiplayer/party";
import { Icon } from "../../ui/components/icons";
import { transitionTo } from "../../ui/state/transition";

/**
 * Mission Control's Brief tab, embedded unchanged. The frame owns its own
 * styles and scripts; this screen only forwards the two messages the merged
 * site needs: "continue to design" and "back home".
 *
 * In a party the brief is shared: picking a mission in one tab selects it in
 * every tab, and Continue takes the whole room to the same workbench.
 */
export function BriefScreen({ scenarioId }: { scenarioId: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const navigating = useRef(false);
  const selected = useRef<string>("");
  const [ready, setReady] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const mission = missionById(scenarioId);

  useEffect(() => {
    document.title = `${mission.siteName} brief — SpaceX`;
  }, [mission]);

  /* Point the frame at the mission the room is on. The frame ignores the
     message when it already shows that mission, so this settles immediately. */
  useEffect(() => {
    const sync = () => {
      const id = party.value.mission;
      if (!id || !ready) return;
      const objective = missionById(id).objective;
      if (selected.current === objective) return;
      selected.current = objective;
      frame.current?.contentWindow?.postMessage(
        { type: "mc:select-objective", objective },
        "*",
      );
    };
    const unsubscribe = party.subscribe(sync);
    sync();
    return unsubscribe;
  }, [ready]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const data = event.data as { type?: string; objective?: string } | null;
      if (!data || typeof data.type !== "string") return;

      if (data.type === "mc:brief-ready") {
        setReady(true);
        frame.current?.contentWindow?.postMessage({ type: "mc:brief-ack" }, "*");
        return;
      }

      if (data.type === "mc:objective" && typeof data.objective === "string") {
        if (party.value.code) {
          selected.current = data.objective;
          chooseMission(missionByObjective(data.objective).id);
        }
        return;
      }

      if (data.type === "mc:brief-continue") {
        if (navigating.current) return;
        navigating.current = true;
        setLeaving(true);
        /* In a party everyone designs the mission the room is on, whichever
           tab pressed Continue. */
        const picked = missionByObjective(data.objective).id;
        const target = party.value.code ? (party.value.mission ?? picked) : picked;
        if (party.value.code) chooseMission(picked);
        transitionTo(
          { name: "workbench", scenarioId: target },
          "Configuring the workbench",
        );
        return;
      }

      if (data.type === "mc:home") {
        if (navigating.current) return;
        navigating.current = true;
        setLeaving(true);
        transitionTo({ name: "select" }, "Returning to mission control");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <div
      class={`frame-screen brief-stage${ready ? " is-ready" : ""}${
        leaving ? " is-leaving" : ""
      }`}
    >
      <div class="brief-bar">
        <button
          class="brief-logo"
          type="button"
          onClick={() => home()}
          title="SpaceX — back to the start screen"
        >
          SpaceX
        </button>
        <button class="brief-back" type="button" onClick={() => home()}>
          <Icon name="arrow-left" size={14} /> Mission control
        </button>
      </div>
      <iframe
        ref={frame}
        title={`${mission.siteName} mission brief`}
        src={`${import.meta.env.BASE_URL}game/index.html?embed=brief&objective=${mission.objective}`}
        allow="autoplay"
      />
    </div>
  );

  function home() {
    if (navigating.current) return;
    navigating.current = true;
    setLeaving(true);
    transitionTo({ name: "select" }, "Returning to mission control");
  }
}
