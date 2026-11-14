# Architecture

How the SpaceX site is put together: one shell, three screens that host 3D
scenes, and a message contract that lets independently built simulation modules
run inside it.

## Stack

| Concern | Choice |
| --- | --- |
| View layer | Preact 11 + `@preact/signals` |
| Build | Vite 6, `@preact/preset-vite`, ES2022, relative `base` |
| Language | Strict TypeScript (`noUnusedLocals`, `noUnusedParameters`) |
| 3D | three.js (own chunk), hand-written GLSL for Earth and atmosphere |
| Fonts | Self-hosted Fontsource: Space Grotesk, Inter, IBM Plex Mono |
| Tests | Vitest: router, engine, asset selection |

No UI framework, CSS utility framework, component library, or
react-three-fiber. Styling is plain CSS with custom properties.

## Entry and shell

`src/main.tsx` imports the font and design CSS, calls `initRouter()` and
`startCatalogValidation()`, then renders `<App />` into `#app` inside
`<ErrorBoundary>`.

`src/app/App.tsx` picks the screen from the current route and owns the
About/Settings modal state. A route change closes any open modal.
`ErrorBoundary` renders a recovery panel with a reload action instead of a blank
page.

## Routes

Hash-based, parsed in `src/app/router.ts`:

| Hash | Route |
| --- | --- |
| `#/` or empty | `select` |
| `#/briefing/<id>` | `briefing` (id is `decodeURIComponent`-ed) |
| `#/workbench/<id>` | `workbench` (the design screen) |
| `#/launch/<id>` | `launch` (ascent, operations, report) |
| anything else | `not-found` ("Signal lost") |

`routeToHash()` is the inverse and is used to build real `href`s, so links are
copyable and middle-clickable. Unknown scenario IDs fall through to a
"Mission not found" variant rather than a hard error.

## State

A single signal in `src/ui/state/store.ts`:

```ts
interface AppState {
  route: Route;
  settings: Settings;            // quality, reducedMotion
  diagnostics: CatalogDiagnostic[];
  lastScenarioId: string | null;
  toasts: Toast[];
}
```

Actions are plain functions: `navigate`, `updateSettings`,
`pushToast`/`dismissToast`, `setDiagnostics`. Toasts auto-dismiss after 7 s and
the stack is capped at three.

`initRouter()` subscribes to `hashchange`; `navigate()` updates state first and
then writes the hash so the UI never waits on the event.

### Persistence

`src/ui/state/persistence.ts` stores `{ settings, lastScenarioId }` under
`spacex:v1`. Every field is validated on read, unknown/invalid values fall back
to defaults, and storage failures (private mode, quota) are swallowed — the
session works without persistence. Settings changes save immediately. The
design lives in a module-level signal (`src/integration/design.ts`); choosing a
mission resets it, and a reload starts a fresh build.

## Party mode

Party state is its own signal in `src/multiplayer/party.ts`; the app store stays
single-player and never depends on it.

```ts
interface PartyState {
  status: "idle" | "connecting" | "live" | "error";
  code: string | null;      // the five-character room
  selfId: string;           // per-tab id, sent with every socket message
  name: string;             // callsign, remembered in localStorage
  hostId: string | null;    // decided by the room, not by the client
  members: PartyMember[];
  mission: string | null;   // a mission id from integration/missions.ts
  started: boolean;
  error: string | null;
}
```

`PartyModal` is the only UI: create, join by code, roster, host mission picker,
guest ready toggle, leave. On the start screen a live party shows as a pill
(`PARTY 2T5LT · 3 online`) that reopens the lobby.

The transport is `/api/party` on the same origin:

| Call | Purpose |
| --- | --- |
| `POST /api/party` | allocate an unused room code → `201 { code }` |
| `GET /api/party/:code` | `{ exists }` before joining |
| `WS /api/party/:code/ws` | join, ready, mission, start; server broadcasts `roster` and `start` |

The Durable Object owns the roster and the host id, so the client cannot grant
itself host. Reconnects back off 1 s → 16 s; a room whose last socket closed is
deleted by an alarm after ten minutes. `followStart()` watches the roster and, if
the room has started and this tab is still on mission select, routes everyone to
`#/briefing/<mission>` through the same `transitionTo` used everywhere else — no
reload, no second transition system.

Host rights in the brief: the host's **Continue** decides the mission (it calls
`chooseMission`), guests follow `party.mission`. Outside a party both paths
behave exactly as before.

## Screens

### Mission select — `ScenarioSelectScreen.tsx`

Full-viewport hero with the live Earth, a scrim, the headline, and three mission
cards (POLAR WATCH / LUNAR ICE / MARS DUST). Each card is an `<article>` with the
title as a stretched link: one tab stop, whole-card hit area, valid markup, and a
focus ring on the card. A demo reel opens in a native `<dialog>`, and
**Play with friends** opens the party lobby in the same dialog component.

### Brief — `BriefScreen.tsx`

The brief is the first simulation module. It is an iframe of
`game/index.html?embed=brief&objective=<polar|ice|dust>`, so its three.js build
is isolated from the shell's. `embed.js` inside the frame selects the mission,
hides the game's own tabs, and reports readiness with `mc:brief-ready`. The host
answers with `mc:brief-ack`, and the frame stops repeating once acknowledged.
`mc:brief-continue` moves the router to the design screen.

The brief draws its spacecraft from the shared assembly geometry with a fixed
canonical spec, so the hull on the brief is the hull designed and flown later.

### Design — `DesignScreen.tsx`

Five steps — Spacecraft, Power, Payload, Orbit, Flight — in a right-hand panel
that never leaves the edge. The left band is a live `DesignStage` (three.js)
rendering `stageModelOf(state)`, the same assembly that `craftSpecOf` serialises
for the flight. Picking parts updates the model, the meters, and the 3D craft
together. Fly stays disabled until a bus, power, comms, and payload exist.

Camera framing is computed from the measured free band (`ViewBand`) and applied
with `camera.setViewOffset`, so the craft is centred in the space the panel
leaves rather than in the window.

### Launch — `LaunchScreen.tsx`

Two simulation modules run side by side in iframes:

- `ascent/index.html` — launch, staging, orbit insertion (its own three.js).
- `game/index.html?embed=orbit` — operations, anomalies, end of mission.

Both mount immediately: the operations module preloads (`mc:orbit-prepare` →
`mc:orbit-prepared`) while ascent runs. Ascent reports `mc:ascent-ready`, the host
sends `mc:ascent-start`, and at the orbit-insertion beat (`mc:orbit-entered`) the
host crossfades to operations (`is-handoff`). Operations then reports
`mc:orbit-ready` and plays the mission; `mc:home` and `mc:fly-again` return to the
start.

The host never reloads a frame mid-flow: the two stages are stacked in the DOM
and faded, which is why there is no black frame at the handoff.

## Shared flight contract

`src/integration/` is the only place where the design screen and the simulation
modules agree on anything:

- `stage.ts` — `stageModelOf()` (3D assembly) and `craftSpecOf()` (the
  serialisable `CraftSpec` sent to the flight scene).
- `flight.ts` — a faithful port of the operations model, used to preview the
  flight configuration in the design screen.
- `design.ts` — the design state, its defaults, and the flight configuration
  built from it.
- `missions.ts` — mission metadata, site names, and objective aliases.
- `hussein/` — the operations data and engine ported from the original module.

`public/game/js/design-craft.js` rebuilds the workbench geometry inside the
flight scene from a `CraftSpec`, which is how one hull appears at every step.

## 3D scenes

Three independent scenes, each with its own renderer:

| Scene | Owner | Lifecycle |
| --- | --- | --- |
| Mission-select hero | `src/viz/SceneManager.ts` | `mount` / `setQuality` / `setReducedMotion` / `dispose` |
| Design bench | `src/viz/DesignStage.ts` | `mount` / `setModel` / `setFindings` / `dispose` |
| Brief, ascent, operations | embedded modules in `public/` | module-owned |

`Viewport.tsx` creates one hero manager per mount, forwards settings changes, and
disposes on unmount. `dispose()` stops the animation loop, disconnects the
`ResizeObserver`, removes the visibility listener, and disposes geometries,
materials, textures, renderer, and canvas.

### Rendering details

- No `THREE.Clock` (deprecated in three r187); frame delta comes from
  `performance.now()` clamped to 50 ms.
- Earth: custom shader combining Blue Marble day, Black Marble night (lit by the
  night side), and a GEBCO-derived per-pixel bump using screen-space derivatives.
- Atmosphere: additive back-side shell shader, no lighting cost.
- Starfield: two deterministic `Points` layers seeded with mulberry32 (no
  per-session randomness).
- Pixel ratio is capped at 2 (high) or 1.25 (low); the canvas is sized by
  `ResizeObserver`.

### Quality and fallbacks

`src/viz/quality.ts` resolves `auto` from `hardwareConcurrency`, `deviceMemory`,
and `devicePixelRatio`:

| Quality | Day | Night | Bump |
| --- | --- | --- | --- |
| high | 4096 | 2048 | 2048 |
| low | 2048 | 1024 | 1024 |

Texture loads are guarded by a monotonic token so a stale quality change cannot
overwrite newer textures; superseded textures are disposed.

`supportsWebGL2()` is checked before mounting. Every viewport has three states:
`loading`, `ready`, and `fallback`. Fallback happens when WebGL2 is missing, the
renderer throws, or textures fail to load: a static NASA still is shown with a
status label, and if that also fails, a CSS placeholder. A warning toast is
raised once and the rest of the page stays interactive.

## Catalog validation

`validateCatalogs()` enumerates thousands of designs and takes seconds, so it
runs in `src/app/catalog-worker.ts` after first paint. Success is silent; failure
adds one `error` diagnostic plus a warning toast and shows a dismissible banner.
The catalog is never blocked by validation, so mission select always renders.

## Assets

`npm run assets:fetch` (`scripts/fetch-assets.ts`):

1. Download each source URL with retries and backoff.
2. Convert with Sharp to WebP at the declared widths, writing
   `public/assets/textures/<id>-<width>.webp`.
3. Record dimensions, byte size, and SHA-256 in `public/assets/manifest.json`.
4. Regenerate `docs/asset-credits.md` from the same metadata.

`src/viz/assets.ts` fetches the manifest once (promise cached, cleared on
failure), resolves URLs against `import.meta.env.BASE_URL`, and `pickVariant()`
returns the smallest variant at least as wide as requested. The About modal
reads the same manifest, so credits cannot drift from the shipped files.

## Styling and accessibility

- Tokens in `src/ui/design/tokens.css`; resets, components, screens, and scene
  styles are separate files imported once from `main.tsx`.
- Dark mission-control palette; cyan/teal nominal, amber warning, red critical,
  green success.
- Native `<dialog>` modals (`showModal`) with backdrop dismissal and route-change
  dismissal. Focus trapping and Escape come from the platform.
- Visible `:focus-visible` rings everywhere, including a card-level ring for the
  stretched mission link.
- `prefers-reduced-motion` disables CSS transitions; the in-app **Reduce motion**
  setting stops 3D spin.
- Mission metadata is real text (`dl`/`dt`/`dd`), not images, so it is selectable
  and translatable.

## Tests

`npm test` runs Vitest over the router, the engine, and asset variant selection.
The engine tests assert the catalog can reach its own stated objectives, so a
balance regression fails the build rather than shipping.

## Known limitations

- Earth has no cloud layer: no official NASA texture matched the Blue Marble
  projection, so clouds are omitted rather than faked.
- The catalog values are educational estimates from public datasheets, not
  procurement quotes or verified hardware specifications.
- Desktop is the primary target; layouts are verified down to 390 px, but the
  densest design panel is tuned for 1280–1440 px laptops.
