import { useEffect, useRef, useState } from "preact/hooks";
import type { BusCategory, Orbit } from "../../data/types";
import { appState } from "../../ui/state/store";
import { DesignStage, type ViewBand } from "../../viz/DesignStage";
import { assetUrl } from "../../viz/assets";
import { supportsWebGL2 } from "../../viz/quality";
import type { StageModel, StagePartId } from "../../viz/spacecraft/Spacecraft";

export type StageStatus = "loading" | "ready" | "fallback";

type PartSeverities = Partial<Record<BusCategory | "payload", "ok" | "warning" | "fail">>;

interface Props {
  stageRef: { current: DesignStage | null };
  model: StageModel;
  orbit: Orbit;
  selected: StagePartId | null;
  severities: PartSeverities;
  viewBand?: ViewBand;
  onSelect: (part: StagePartId | null) => void;
  onStatus: (status: StageStatus) => void;
  onDropInstrument: (id: string, bay: number | undefined) => void;
}

export function StageViewport({
  stageRef,
  model,
  orbit,
  selected,
  severities,
  viewBand,
  onSelect,
  onStatus,
  onDropInstrument,
}: Props) {
  const [webgl] = useState(supportsWebGL2);
  const [mounted, setMounted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [imageOk, setImageOk] = useState(true);
  const [dragging, setDragging] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const callbacksRef = useRef({ onSelect, onStatus });
  callbacksRef.current = { onSelect, onStatus };

  useEffect(() => {
    if (!webgl) {
      onStatus("fallback");
      return;
    }
    const host = hostRef.current;
    if (!host) return;
    const stage = new DesignStage();
    stageRef.current = stage;
    let active = true;

    stage
      .mount(host, {
        onSelect: (part) => callbacksRef.current.onSelect(part),
        onProgress: (fraction) => {
          if (active) setProgress(fraction);
        },
        onReady: () => {
          if (active) callbacksRef.current.onStatus("ready");
        },
        onFallback: (message) => {
          if (!active) return;
          console.warn("SpaceX workbench imagery:", message);
          setProgress(1);
          callbacksRef.current.onStatus("ready");
        },
      })
      .then(() => {
        if (active) setMounted(true);
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.warn("SpaceX workbench 3D unavailable:", error);
        callbacksRef.current.onStatus("fallback");
      });

    return () => {
      active = false;
      stage.dispose();
      stageRef.current = null;
    };
  }, [webgl, stageRef]);

  useEffect(() => {
    if (mounted) stageRef.current?.setModel(model);
  }, [mounted, model, stageRef]);

  useEffect(() => {
    if (mounted) stageRef.current?.setOrbit(orbit);
  }, [mounted, orbit, stageRef]);

  useEffect(() => {
    if (mounted) stageRef.current?.setSelection(selected);
  }, [mounted, selected, stageRef]);

  useEffect(() => {
    if (mounted) stageRef.current?.setFindings(severities);
  }, [mounted, severities, stageRef]);

  useEffect(() => {
    if (mounted && viewBand) stageRef.current?.setViewBand(viewBand);
  }, [mounted, viewBand, stageRef]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !mounted) return;
    stage.setQuality(appState.value.settings.quality);
  }, [mounted, stageRef, appState.value.settings.quality]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !mounted) return;
    stage.setReducedMotion(appState.value.settings.reducedMotion);
  }, [mounted, stageRef, appState.value.settings.reducedMotion]);

  const dragType = "application/x-spacex-instrument";

  return (
    <div
      class={`stage${dragging ? " stage--drop" : ""}`}
      onDragOver={(event) => {
        if (!event.dataTransfer?.types.includes(dragType)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        if (!dragging) setDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const id = event.dataTransfer?.getData(dragType);
        if (!id) return;
        const bay = stageRef.current?.bayAtScreen(event.clientX, event.clientY);
        onDropInstrument(id, bay ?? undefined);
      }}
    >
      {webgl ? (
        <div class="stage__host" ref={hostRef} />
      ) : (
        <div class="stage__static">
          {imageOk ? (
            <img
              src={assetUrl("textures/earth-day-1024.webp")}
              alt=""
              onError={() => setImageOk(false)}
            />
          ) : (
            <span class="stage__static-placeholder" />
          )}
          <p>3D assembly unavailable — design from the system dock below.</p>
        </div>
      )}

      <div class="stage__scrim" aria-hidden="true" />
      <div class={`stage__drop-hint${dragging ? " stage__drop-hint--on" : ""}`}>
        <span>Drop to integrate on the payload deck</span>
      </div>

      {webgl && progress < 1 && (
        <div class="stage__loading" role="status">
          <p class="eyebrow">Assembling bay</p>
          <div class="stage__loadbar">
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <small>{Math.round(progress * 100)}% · NASA BLUE MARBLE</small>
        </div>
      )}

      <div class="stage__legend" aria-hidden="true">
        <span class="stage__legend-dot" />
        LIVE ASSEMBLY · DRAG TO ORBIT · CLICK A PART
      </div>
    </div>
  );
}
