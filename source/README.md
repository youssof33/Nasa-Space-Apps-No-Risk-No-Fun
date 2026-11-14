# SpaceX

A browser-based space mission design game built for the 2026 NASA Space Apps
Challenge. Choose a mission, read the brief, design the spacecraft, fly it, and
find out why it worked.

Everything runs in the browser: no accounts, no database, no runtime API calls
for the single-player flow. Imagery, fonts, and audio ship with the site.

Party mode is the one optional exception: a small Cloudflare Worker hands out
five-character room codes and keeps each room's roster in a Durable Object, so
friends on different machines can pick a mission and start it together.

## The experience

One continuous flow, five stages, no page reloads:

1. **Mission select** — three missions: POLAR WATCH (Earth), LUNAR ICE (Moon),
   MARS DUST (Mars). A live 3D Earth, mission cards, a demo reel, **Play with
   friends**, and About / Settings.
2. **Brief** — the mission's target body in 3D with the brief beside it: the
   objective, the science target, the data budget, and the orbit it implies.
3. **Design** — five steps (Spacecraft, Power, Payload, Orbit, Flight) around a
   live 3D assembly bench. Mass, power, downlink, and budget meters update as
   parts change. Fly unlocks only when the spacecraft can actually do the job.
4. **Fly** — launch and ascent, then orbit insertion and operations, including
   anomalies you can mitigate. The spacecraft in flight is the one you designed.
5. **Report** — mission score, the findings behind it, and a way back to a new
   mission.

The spacecraft is built from one shared assembly model, so the hull on the
brief, on the design bench, and in flight is the same object.

## Play with friends

On the start screen, **Play with friends** opens a lobby:

- **Create a party** — you become the host and get a five-character room code
  (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`: no `I`, `O`, `0`, or `1`, so a code read
  aloud stays unambiguous). Share it.
- **Join a party** — type the code. The roster updates live for everyone.

The host picks the mission and presses **Start mission**; every member of the
room is taken to that mission's brief at the same moment, and from there the
party plays the same design and flight stages. Guests can mark themselves ready;
the host owns the mission choice. Empty rooms are forgotten ten minutes after
the last member leaves, so codes are reused.

The lobby talks to `/api/party` on the same origin. Without that service the
button reports that the party service is unreachable; single-player never
depends on it.

## Run the site

The production site is a static bundle and needs any HTTP server (ES modules,
Web Workers, and WebGL iframes do not run from `file://`):

```sh
npx serve .          # or: python -m http.server 8080
```

Then open the printed URL. Assets are referenced relatively, so the folder works
at a domain root or inside a sub-folder.

For party mode locally, run the Worker instead, which serves `dist/` and the
lobby API together on one port:

```sh
npm run build
npm run dev:party    # wrangler dev → http://127.0.0.1:8787
```

## Deploy to Cloudflare

One Worker serves the static site and the party service. Static files come from
Cloudflare's asset layer; the Worker only runs for `/api/*`.

```sh
npx wrangler login   # once per machine
npm run deploy       # build + wrangler deploy
```

`wrangler.jsonc` holds the whole configuration: `assets.directory` points at
`./dist`, `run_worker_first` is scoped to `/api/*`, and the `PartyRoom` Durable
Object is bound as `PARTY` with the `v1` SQLite migration. The deployed URL is
printed at the end of `wrangler deploy`.

## Build from source

```sh
npm install
npm run dev          # Vite dev server
npm run dev:party    # Vite build + Worker (site and lobby on one port)
npm run typecheck    # strict TypeScript project build
npm test             # Vitest
npm run build        # typecheck + production bundle into dist/
npm run deploy       # build + wrangler deploy to Cloudflare
npm run assets:fetch # re-download and optimise NASA imagery (needs network)
npm run audit        # enumerate catalog designs, refresh docs/balance-report.md
```

Requires Node 20+.

## Project structure

```
src/
  app/            routing, screens, shell chrome, catalog worker
  ui/             design tokens and CSS, state store, formatters, components
  viz/            three.js scene manager, Earth, design stage, spacecraft
  data/           catalogs, typed domain model, validation (read-only)
  engine/         deterministic design evaluator (read-only)
  integration/    design <-> flight contract, mission metadata, ops engine
  multiplayer/    party lobby state and UI (room codes, roster, shared start)
public/
  assets/         optimised local textures + generated manifest
  game/           brief and operations simulation module (own three.js build)
  ascent/         launch and ascent simulation module (own three.js build)
  media/          demo reel
worker/           Cloudflare Worker: /api/party + PartyRoom Durable Object
docs/             architecture, asset credits, balance report
scripts/          NASA asset pipeline and balance audit
wrangler.jsonc    Cloudflare deploy configuration
```

`src/data/**` and `src/engine/**` are the source of truth for mission rules. The
UI only calls `evaluateDesign()`; it never re-implements engine math.
`docs/ui-architecture.md` covers routing, state, scene lifecycle, and the
message contract between the shell and the simulation modules.

## Design model

The browser engine exposes one deterministic entry point:
`evaluateDesign(design, scenario, { difficulty })`. It returns metrics, stable
structured findings, threshold/baseline criterion results, shortfalls, an
outcome, and a game-score breakdown. It does not access the DOM, Three.js,
random numbers, or the clock. `enumerateDesigns()` provides bounded
instrument/part-quantity combinations for catalog feasibility checks and the
balance audit; `recommendedBus()` supplies a starter bus without restricting the
parts available to a player.

- **Margins and launch mass:** Resource margin is `(available - required) /
  required`. Dry and wet mass are compared with the selected launcher's payload
  allocation. These are per-mission payload caps, not the launch vehicles' full
  published lift capacities; the simplification keeps mass trade-offs meaningful
  for small spacecraft. Hard requires 35% mass, power, and energy margin; Easy
  requires 20%. For each resource, margin below zero is a failure, margin from
  zero up to the target is a warning, and margin at/above target is OK. Telecom
  instead requires 6 dB for Earth-bound orbits and 3 dB for lunar/interplanetary
  links, using the same fail/warning/OK boundaries. Fairing geometry, adapters,
  and detailed rideshare integration are not modeled.
- **Orbit:** Bound-orbit period is calculated from Kepler's third law and the
  two-body central-body gravitational parameter using catalog perigee/apogee
  altitudes. The Mars trajectory uses encounter-window and cruise-duration fields
  rather than a bound period. Orbit geometry, radiation, eclipse, contact time,
  and natural lifetime remain representative catalog estimates; perturbations and
  detailed trajectory design are omitted.
- **Power and energy:** Ideal panel output is solar flux × panel area ×
  efficiency. Peak output includes the 0.75 system-loss fraction. End-of-life
  orbit-average output additionally multiplies by the sunlight fraction and a
  linear 2.5%/year panel degradation estimate. Average load is constant bus draw
  plus instrument draw scaled by duty cycle. Usable battery energy is battery
  capacity × depth of discharge; required eclipse energy is average load × Kepler
  period × eclipse fraction. Transfer trajectories use zero eclipse.
  Temperature, peak loads, battery aging, and charging efficiency are omitted.
- **Communications and data:** Link margin is `74 dB + (antenna gain - 3 dB) -
  20 log10(distance / 1,000 km)`. This calibration gives an LGA comfortable
  margin near Earth and approximately 3 dB for the 32 dB deep-space antenna at
  the catalog Mars distance. If margin is negative, nominal downlink rate is
  multiplied by `10^(margin/10)`; scheduled contacts use 100% of the estimate and
  opportunistic contacts use 70%. Contact minutes and Mbps convert to decimal GB
  using 8,000 megabits/GB. The catalog contact minutes represent aggregate daily
  access to a ground-station network, not one station pass. Generated data scales
  with instrument duty cycle. For bound missions, backlog accumulates when daily
  generation exceeds daily downlink and data beyond the recorder buffer is lost.
  For transfers, data is produced only during the encounter window, retained in
  the recorder, and downlinked over the remaining cruise. This is not a full RF
  link budget: station elevation, modulation, coding, weather, pointing losses,
  protocol overhead, retransmissions, and contact scheduling are omitted.
- **Propulsion and lifetime:** Available delta-v is calculated with the ideal
  rocket equation, `Isp × g0 × ln(wet mass / dry mass)`, using summed propellant
  and propellant-mass-weighted Isp. Required delta-v is insertion + annual
  stationkeeping × planned years + deorbit. Propellant-limited lifetime reserves
  insertion and deorbit delta-v before dividing remaining delta-v by annual
  stationkeeping need; when no stationkeeping is modeled, lifetime is limited by
  the catalog natural orbit lifetime. This assumes an idealized shared maneuver
  budget and omits staging, maneuver losses, detailed transfer trajectories, and
  propulsion-driven changes to orbit lifetime.
- **Reliability:** Catalog reliability is a one-year survival probability. A
  component's nominal survival over `t` years is `R^t`; same-category redundant
  units are modeled in parallel as `1 - (1 - R)^n`, and subsystem/instrument
  survival is multiplied in series. Radiation scales annual hazard by
  `1 + 2 × radiation index × (1 - computer hardening fraction)`. Launcher
  reliability and its rideshare orbit/schedule risk factors are then multiplied
  in. This is a deterministic educational estimate, not a validated reliability
  or probabilistic risk analysis.
- **Cost:** Raw cost is selected instrument and bus costs + launcher + monthly
  operations cost × mission months. Risk reserve is `raw cost × clamp(0.15 + 0.5
  × (1 - mission success probability), 0.15, 0.35)`. Exceeding the scenario
  budget is a critical failure. Cost values are illustrative catalog estimates,
  not mission proposals or procurement quotes.
- **Science and outcomes:** Each instrument contributes its science value
  multiplied by scenario-tag fit, soft pointing quality, duty-cycle uptime, and
  the fraction of generated data returned. Instruments sharing tags receive
  diminishing weights of 1.0, 0.7, then 0.5. Pointing is not a hard constraint.
  Required tags follow the scenario's explicit `all` or `any` semantics.
  Threshold and baseline independently check science points, tags, returned GB,
  and lifetime. Failure means a threshold criterion or critical constraint fails;
  Partial meets threshold but not baseline; Success meets baseline. Score
  components are game-design weights, not scientific performance predictions.
- **Feasibility validation:** Catalog validation uses the evaluator to require at
  least one Success and one Partial design per scenario and at least two launcher
  options with compatible mass/orbit. It first computes an optimistic science
  score upper bound (assuming perfect pointing/tag fit and ignoring recorder
  limits); a scenario below its science threshold fails validation with its ID and
  bound. This prevents a catalog that cannot reach its own stated objective from
  loading silently.
- **Balance audit:** The deterministic audit evaluates the bounded design
  enumerator under Easy and Hard and includes each scenario's default monthly
  operations cost. Reported rates are over enumerated designs, with Pareto
  comparisons using science points and modeled mission cost. The success
  percentages describe this search space, not real-world mission probabilities.

The scenario's science **threshold** and **baseline** are distinct goals. These
estimates are intentionally explainable and should be refined before being used
for anything beyond the game.

## Catalog assumptions

Catalog values are educational estimates informed by public CubeSat/component
vendor datasheets, launch-provider payload guides, and official mission fact
sheets for the named analogs. They are illustrative rather than procurement
quotes or verified specifications for a specific vehicle or mission. Units are
encoded in numeric field names; probabilities and indices are explicitly named as
such.

Validation runs in a Web Worker after first paint because full enumeration takes
several seconds. It checks unique IDs, value ranges, references, scenario
feasibility, orbit coverage, and strict dominance within comparable parts. Each
scenario includes a non-zero default monthly operations-cost estimate so balance
audits account for operating expenses.

## Imagery and credits

`npm run assets:fetch` downloads official NASA source images over HTTPS, converts
each into WebP variants with Sharp, writes them to `public/assets/textures/`, and
regenerates `public/assets/manifest.json` plus `docs/asset-credits.md`. Files are
served locally — nothing is hotlinked at runtime. Credits are also rendered
in-app from the same manifest.

NASA imagery is generally not protected by copyright in the United States. NASA
does not endorse this project or the NASA Space Apps Challenge. Mission names and
analogs are referenced for educational context only. Fonts are self-hosted
through Fontsource under the SIL Open Font License.

## Known limitations

- Party mode keeps state per room, not per account: there is no login, so a
  refreshed tab reclaims host only through the same browser session.
- Earth has no cloud layer: no reachable official NASA cloud texture matched the
  Blue Marble projection, so clouds are omitted rather than faked with a
  mismatched map.
- Catalog numbers are educational estimates, not verified hardware data.
- Desktop is the primary target. Layouts are verified down to 390 px, but the
  densest design panel is tuned for 1280–1440 px laptops.
