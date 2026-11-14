import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "../../ui/components/icons";
import { party } from "../../multiplayer/party";
import { transitionTo } from "../../ui/state/transition";
import { Viewport } from "../../viz/Viewport";
import { Modal } from "../shell/Modal";

interface Props {
  onAbout: () => void;
  onSettings: () => void;
  onParty: () => void;
}

/**
 * Omar's home page. The mission catalog grid is not part of the merged flow:
 * "Choose a mission" opens the Brief tab, which owns mission selection.
 */
export function ScenarioSelectScreen({ onAbout, onSettings, onParty }: Props) {
  const [demo, setDemo] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    document.title = "SpaceX — Space Mission Design";
  }, []);

  useEffect(() => {
    const player = video.current;
    if (!player) return;
    if (demo) {
      player.currentTime = 0;
      const played = player.play();
      if (played) played.catch(() => undefined);
    } else {
      player.pause();
    }
  }, [demo]);

  return (
    <div class="select-screen">
      <section class="hero" aria-labelledby="hero-title">
        <div class="hero__scene">
          <Viewport />
        </div>
        <div class="hero__scrim" aria-hidden="true" />
        <div class="hero__content">
          <p class="eyebrow">NASA SPACE APPS CHALLENGE · 2026</p>
          <h1 id="hero-title" class="hero__title">
            Design the mission.
            <span>Live with the consequences.</span>
          </h1>
          <p class="hero__lede">
            Balance science against mass, power, data, and budget. Then fly the
            mission and find out why it worked.
          </p>
          <div class="hero__actions">
            <button
              class="btn btn--primary btn--lg"
              type="button"
              onClick={() =>
                transitionTo(
                  { name: "briefing", scenarioId: "polar-watch" },
                  "Loading mission brief",
                )
              }
            >
              Choose a mission
              <Icon name="arrow-right" />
            </button>
            <button
              class="btn btn--ghost btn--lg"
              type="button"
              onClick={() => setDemo(true)}
            >
              Watch the demo
              <span class="btn__tag">0:30</span>
            </button>
            <button class="btn btn--ghost btn--lg" type="button" onClick={onParty}>
              Play with friends
              <Icon name="users" />
            </button>
          </div>
          {party.value.status === "live" && party.value.code ? (
            <button class="party-pill" type="button" onClick={onParty}>
              <span class="party-pill__dot" aria-hidden="true" />
              PARTY {party.value.code}
              <em>{party.value.members.length} online</em>
            </button>
          ) : (
            <p class="hero__note">3 missions · metric units throughout</p>
          )}
        </div>
        <div class="hero__rail" aria-hidden="true">
          <span>EARTH</span>
          <span class="hero__rail-line" />
          <span>BLUE MARBLE · NASA</span>
        </div>
      </section>

      <footer class="site-footer">
        <p>
          Built for the 2026 NASA Space Apps Challenge. Not affiliated with or
          endorsed by NASA.
        </p>
        <nav class="site-footer__links" aria-label="Site information">
          <button class="text-link" type="button" onClick={onAbout}>
            About
          </button>
          <button class="text-link" type="button" onClick={onSettings}>
            Settings
          </button>
          <a
            class="text-link"
            href="https://github.com/youssof33/Nasa-Space-Apps-No-Risk-No-Fun"
            target="_blank"
            rel="noreferrer noopener"
          >
            GitHub
          </a>
        </nav>
        <span class="site-footer__meta">SpaceX · v1.0 · NASA SPACE APPS 2026</span>
      </footer>

      <Modal
        open={demo}
        onClose={() => setDemo(false)}
        title="SpaceX demo"
        eyebrow="Project overview"
      >
        <div class="demo">
          <video
            ref={video}
            class="demo__video"
            controls
            playsInline
            preload="metadata"
            aria-label="SpaceX project demo video"
          >
            <source src={`${import.meta.env.BASE_URL}media/missioncraft-demo.mp4`} type="video/mp4" />
            Your browser cannot play this video.
          </video>
          <p class="demo__note">
            SpaceX, built for the 2026 NASA Space Apps Challenge. This site is the
            playable version of the same idea.
          </p>
        </div>
      </Modal>
    </div>
  );
}
