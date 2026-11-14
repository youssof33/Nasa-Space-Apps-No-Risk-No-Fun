import { useEffect, useRef, useState } from "preact/hooks";
import { opsPayload, shadyPayload } from "../../integration/design";
import { missionById } from "../../integration/missions";
import { partySeed } from "../../multiplayer/party";
import { transitionTo } from "../../ui/state/transition";

/**
 * One continuous launch. Mission Architect's take-off frame is mounted on top
 * of Mission Control's operations frame from the first paint: the operations
 * scene preloads and parks in a wide orbit shot while the rocket is still on
 * the pad. At the ascent's orbit-insertion beat the host crossfades the two
 * frames and releases the operations camera into its chase view, so the
 * hand-off reads as one camera move rather than a second launch.
 */
export function LaunchScreen({ scenarioId }: { scenarioId: string }) {
  const mission = missionById(scenarioId);
  const ascent = useRef<HTMLIFrameElement>(null);
  const ops = useRef<HTMLIFrameElement>(null);

  const [veil, setVeil] = useState(true);
  const [handoff, setHandoff] = useState(false);
  const [opsOnly, setOpsOnly] = useState(false);

  const ascentReady = useRef(false);
  const opsPrepareSent = useRef(false);
  const opsPrepared = useRef(false);
  const started = useRef(false);
  const handoffStarted = useRef(false);

  useEffect(() => {
    document.title = `${mission.name} launch — SpaceX`;
  }, [mission]);

  useEffect(() => {
    /* One payload for the whole launch, seeded by the room so every member's
       flight rolls the same events and ends on the same report. */
    const flightPayload = () => ({ ...opsPayload(), seed: partySeed() });

    const startAscent = () => {
      if (started.current || !ascentReady.current || !opsPrepared.current) return;
      started.current = true;
      setVeil(false);
      ascent.current?.contentWindow?.postMessage(
        { type: "mc:ascent-start", payload: shadyPayload() },
        "*",
      );
    };

    /* If the operations frame cannot prepare (no WebGL, for example) the launch
       still flies; the fallback below lets the host start it on its own. */
    const safety = window.setTimeout(() => {
      if (started.current) return;
      started.current = true;
      setVeil(false);
      ascent.current?.contentWindow?.postMessage(
        { type: "mc:ascent-start", payload: shadyPayload() },
        "*",
      );
    }, 14_000);

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; objective?: string } | null;
      if (!data || typeof data.type !== "string") return;
      const fromAscent = event.source === ascent.current?.contentWindow;
      const fromOps = event.source === ops.current?.contentWindow;

      if (data.type === "mc:ascent-ready" && fromAscent) {
        ascentReady.current = true;
        startAscent();
        return;
      }

      if (data.type === "mc:orbit-ready" && fromOps) {
        if (opsPrepareSent.current) return;
        opsPrepareSent.current = true;
        ops.current?.contentWindow?.postMessage(
          { type: "mc:orbit-prepare", payload: flightPayload() },
          "*",
        );
        return;
      }

      if (data.type === "mc:orbit-prepared" && fromOps) {
        opsPrepared.current = true;
        startAscent();
        return;
      }

      /* Orbit insertion. Shady's scene raises this at 72%, just before the
         point where it used to fade to black; the frames crossfade here. */
      if (data.type === "mc:orbit" && fromAscent) {
        if (handoffStarted.current) return;
        handoffStarted.current = true;
        setVeil(false);
        setHandoff(true);
        ops.current?.contentWindow?.postMessage(
          { type: "mc:orbit-go", payload: flightPayload() },
          "*",
        );
        return;
      }

      if (data.type === "mc:orbit-entered" && fromOps) {
        window.setTimeout(() => setOpsOnly(true), 1100);
        return;
      }

      if (data.type === "mc:fly-again") {
        transitionTo({ name: "workbench", scenarioId: mission.id }, "Reopening the workbench");
        return;
      }

      if (data.type === "mc:home") {
        transitionTo({ name: "select" }, "Returning to mission control");
      }
    };

    window.addEventListener("message", onMessage);
    return () => {
      window.clearTimeout(safety);
      window.removeEventListener("message", onMessage);
    };
  }, [mission]);

  return (
    <div
      class={`launch-stage${handoff ? " is-handoff" : ""}${opsOnly ? " is-ops" : ""}`}
    >
      <iframe
        ref={ops}
        class="launch-frame launch-frame--ops"
        title="Mission operations — orbit to end"
        src={`${import.meta.env.BASE_URL}game/index.html?embed=orbit`}
        allow="autoplay"
      />
      <iframe
        ref={ascent}
        class="launch-frame launch-frame--ascent"
        title="Launch — take-off to orbit"
        src={`${import.meta.env.BASE_URL}ascent/index.html`}
        allow="autoplay"
      />

      <div class={`launch-veil${veil ? "" : " is-ready"}`} aria-hidden={!veil}>
        <div class="launch-veil__inner">
          <span>Preparing launch · {mission.name}</span>
          <i aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
