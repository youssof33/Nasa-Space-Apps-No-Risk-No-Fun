import { useEffect, useRef, useState } from "preact/hooks";
import { appState, pushToast } from "../ui/state/store";
import { assetUrl } from "./assets";
import { supportsWebGL2 } from "./quality";
import { SceneManager } from "./SceneManager";

type Status = "loading" | "ready" | "fallback";

export function Viewport() {
  const [webglSupported] = useState(supportsWebGL2);
  const [status, setStatus] = useState<Status>("loading");
  const [progress, setProgress] = useState(0);
  const [imageOk, setImageOk] = useState(true);
  const hostRef = useRef<HTMLDivElement>(null);
  const managerRef = useRef<SceneManager | null>(null);

  useEffect(() => {
    if (!webglSupported) return;
    const host = hostRef.current;
    if (!host) return;

    const manager = new SceneManager();
    managerRef.current = manager;
    let active = true;

    manager
      .mount(host, {
        onProgress: (fraction) => {
          if (active) setProgress(fraction);
        },
        onReady: () => {
          if (active) setStatus("ready");
        },
        onFallback: (message) => {
          if (!active) return;
          console.warn("SpaceX Earth fallback:", message);
          setStatus("fallback");
          pushToast("Earth imagery unavailable. Showing a simplified globe.", "warning");
        },
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.warn("SpaceX 3D unavailable:", error);
        setStatus("fallback");
        pushToast("3D view unavailable. Showing static NASA imagery.", "warning");
      });

    return () => {
      active = false;
      manager.dispose();
      managerRef.current = null;
    };
  }, [webglSupported]);

  useEffect(() => {
    managerRef.current?.setQuality(appState.value.settings.quality);
  }, [appState.value.settings.quality]);

  useEffect(() => {
    managerRef.current?.setReducedMotion(appState.value.settings.reducedMotion);
  }, [appState.value.settings.reducedMotion]);

  const showStaticImage = !webglSupported || status === "fallback";

  return (
    <div class={`viewport viewport--${webglSupported ? status : "fallback"}`}>
      {webglSupported && <div class="viewport__host" ref={hostRef} />}

      {showStaticImage && (
        <div class="viewport__fallback">
          {imageOk ? (
            <img
              src={assetUrl("textures/earth-day-1024.webp")}
              alt=""
              onError={() => setImageOk(false)}
            />
          ) : (
            <span class="viewport__placeholder" />
          )}
          <span class="viewport__fallback-label">
            {webglSupported ? "STATIC IMAGERY · ASSET FALLBACK" : "STATIC IMAGERY · WEBGL2 UNAVAILABLE"}
          </span>
        </div>
      )}

      {webglSupported && status === "loading" && (
        <div class="viewport__loading" role="status">
          <p class="eyebrow">Acquiring Earth imagery</p>
          <div class="viewport__bar">
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <small>{Math.round(progress * 100)}% · NASA BLUE MARBLE</small>
        </div>
      )}

      <div class="viewport__badge" aria-hidden="true">
        <span class={`viewport__pulse${showStaticImage ? " viewport__pulse--static" : ""}`} />
        {showStaticImage ? "STATIC EARTH" : "LIVE EARTH"}
      </div>

      <div class="viewport__hint" aria-hidden="true">
        Drag to orbit · Scroll to zoom
      </div>
    </div>
  );
}
