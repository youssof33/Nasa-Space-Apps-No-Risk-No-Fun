# Mission Architect

A 3D space-mission design game built for the **NASA Space Apps Cairo 2026** challenge
*Space Mission Design Game* by team **No Risk No Fun**.

You are the flight crew. Read a mission brief, assemble a spacecraft and a launch
campaign out of real mission-design trades (bus, payloads, vehicle, ground segment,
operations life, test program), watch mass, power, data, risk and budget move as you
click, then fly the thing in 3D and defend the result in a review-board debrief.

The work is split into **five preparation stages**, and up to **four players share one
screen**: each player owns a console and hands the controls on when their stage is done.

This folder is the game. It is standalone: it does not load anything from `../site/`,
and `../site/` is the untouched submission website.

```
game/
  index.html          markup: stage, design panel, HUD, modals, codex
  css/game.css        visual system, responsive layout, motion
  js/data.js          mission/bus/payload/vehicle/ground/test content
  js/model.js         rollup, validation, scoring, auto-solver, self-check
  js/scene.js         Three.js pad + orbit worlds, rocket/satellite builders, launch
  js/game.js          campaign flow, UI state, saves, sound, keyboard
  assets/             fonts, Earth/Moon/Mars maps, favicon
  vendor/three.min.js Three.js r128 (vendored, no network needed)
```

## Run it

No build step, no package manager, no framework. Serve the folder over HTTP:

```powershell
python -m http.server 8766 --bind 127.0.0.1 --directory game
# open http://127.0.0.1:8766/
```

Any static server works. Opening `index.html` from `file://` will fail because the
browser blocks the module-free scripts' texture loads from local files.

Requirements: a WebGL-capable browser (Chrome, Edge, Firefox, Safari). If WebGL is
missing, the game shows a static fallback in the stage and the design loop still works.

## How to play

1. **Start campaign** → pick a study from the campaign board.
2. **Set the crew.** Four consoles, one screen: Flight Director (CDR), Science Lead
   (SCI), Launch Engineer (LCH), Mission Ops (OPS). Names are optional and stay in
   `localStorage`; the handover card between stages always says whose turn it is.
3. **Stage 1 — the brief (CDR).** The board's requirements and the console roster. Read
   it out loud before anyone touches the design.
4. **Stage 2 — spacecraft (SCI).** Bus class and payloads: science, mass, power, data,
   cost. Read the meters. Red means a hard block, amber a missed soft target.
5. **Stage 3 — launch vehicle (LCH).** Capacity to Earth orbit, the Moon or Mars, and
   the mass margin you have to defend.
6. **Stage 4 — ground & operations (OPS).** Ground segment coverage and link
   efficiency (Earth stations cannot reach beyond Earth orbit), and operations life.
7. **Stage 5 — test & review (CDR).** Buy down risk with the test program, read every
   margin, then call **Run mission simulation**. The vehicle launches, max-Q, stages,
   separates the fairing, inserts into orbit and deploys the spacecraft and arrays.
   *Skip to results* jumps to the same state.
8. **Debrief.** Six checks, a 0–100 score, stars, the crew's choices, and the next
   study unlock.

Every stage is reachable from the rail at the top of the panel (and with **Back**), so
a player can revisit an earlier decision without restarting the study. Handovers appear
whenever the next stage belongs to a different console.

### Controls

| Input | Action |
| --- | --- |
| Drag on the 3D stage | Orbit the camera around the vehicle |
| `PAD` / `CHASE` / `ORBIT` | Camera presets |
| `Esc` | Close the open modal (never during launch) |
| `←` / `→` in the codex tabs | Move between codex tabs |
| Tab / Enter / Space | Standard keyboard operation everywhere |

The whole game is operable by keyboard. Modals trap focus, restore focus to the
button that opened them, and expose `role="status"` for live meters.

### Readability

The type scale has a floor rather than a ceiling: body copy 15 px, option names 13.5 px,
option blurbs 12 px, meters and mono labels 8.5–10 px, buttons 44 px tall. The panel
widens to 440 px on desktop, and the layout is verified at 390 px, 768 px and 1296 px
with no horizontal page overflow.

Clarity comes from deletion, not from more copy: the top bar carries mission identity
once, each stage shows a single instruction line, the brief disappears after stage 1,
and a collapsed section shows only the choice it holds. On stacked layouts the status
toast moves to the top so it never covers the primary button.

## Campaign

| Study | CML | Body | Targets | Caps |
| --- | --- | --- | --- | --- |
| **M-01 ARES RELAY** | 2 · Initial Feasibility | LEO 550 km | 65 science, 35 GB/sol, ≤25% risk | $620M |
| **M-02 LUNAR ICE** | 3 · Trade Space | Lunar polar 100 km | 85 science, 12 GB/sol, ≤25% risk | $920M |
| **M-03 MARS SURVEY** | 4 · Point Design | Mars 400 km | 100 science, 8 GB/sol, ≤22% risk | $1.25B |

Each study adds one new constraint: M-02 forces a deep-space bus, the DSN and a
transfer stage; M-03 forces a radiation sensor and makes downlink the scarce
resource. Unlocking is strictly sequential, and progress is saved in
`localStorage` (`mission-architect.v1`).

### Local co-op

Up to four people play on one screen, hot-seat style. Every stage is owned by one
console, so the game never asks two people to act at once:

| Console | Player | Owns |
| --- | --- | --- |
| **CDR** | Flight Director | The brief and the test & review stage; calls the launch |
| **SCI** | Science Lead | Spacecraft bus and payloads |
| **LCH** | Launch Engineer | Launch vehicle and mass margin |
| **OPS** | Mission Ops | Ground segment and operations life |

A handover card appears whenever a stage changes hands, and the stage header always
shows the current console and player name. The debrief ends with the crew's actual
choices. Everything runs offline; no server, no room code, no second device.

## Model

All numbers are **illustrative teaching values**, not flight data.

```
mass        = bus.mass + Σ payload.mass
powerSupply = bus.power × mission.solar
powerDemand = Σ payload.power
downlink    = (bus.downlink + Σ payload.downlink) × mission.comm
dataGen     = Σ payload.data × mission.data
returned    = min(dataGen, downlink) × ground.eff
science     = Σ payload.science × mission.science × life.sci × ground.coverage
              × min(1, downlink / dataGen)
budget      = bus + payloads + vehicle + ground + life + test + mission.fixedCost
risk        = 4 + mission.risk + bus + vehicle + life + test + ground
              (+6 if mass margin < 5%, +5 if power margin < 10%, +4 if the link is short)
```

**Hard blocks** (launch disabled): mass over vehicle capacity, power shortfall,
budget over cap, a required payload or bus or ground segment missing, or an
Earth-only station on a lunar/Mars mission.

**Score** is a weighted sum, each term normalised to 0–1:

```
0.42 × science/target      (capped at 1.0)
0.14 × data/minData        (capped at 1.0)
0.08 × mass margin / 0.35
0.16 × budget margin / cap / 0.30
0.20 × (1 - risk/35)
```

Stars at **55 / 72 / 85**. Science and data are capped, so you cannot buy a score
by overloading a spacecraft: past the target, extra instruments only add mass,
power, cost and risk.

**Auto-fix** brute-forces the design space (3 buses × 3 vehicles × 3 ground × 3
lives × 3 test programs × 2⁸ payload sets) for the cheapest fully compliant design,
with a penalty for every change, so it stays close to what you built.

## 3D

The scene is real Three.js geometry, not a video:

- **Pad world** — octagonal deck with a procedural plating texture (wear, scorch,
  soak-in soot), hazard ring, flame trench, launch mount, strongback tower with
  beacons, two service arms that retract at ignition, floodlights, smoke particles,
  distant ridge line, procedural grid ground.
- **Vehicle skin** — a generated paint map with panel seams, weld rings, rivets and
  stencils, reused as a bump map so the seams catch the key light; an exhaust-soot
  band at the base; a mission decal wrapped onto the curved hull (not a flat sticker);
  and a translucent payload fairing that shows the payload stack you paid for.
- **Exhaust** — layered additive billboards with a warm-white core, orange body and
  flicker, Mach diamonds along the axis, a nozzle bloom sprite and engine light, so
  the plume reads as fire rather than a cone.
- **Launch timeline** (7 s; 2.6 s with reduced motion): ignition → liftoff → max-Q
  → stage separation → fairing deploy → orbit insertion → array deploy → complete.
  The camera opens up its field of view at ignition and pulls back as the stack
  climbs.
- **Orbit world** — planet with a real NASA-derived map, a separate drifting cloud
  system (Earth only), atmospheric rim shader, orbit rings, and a spacecraft
  assembled from *your* payload selection: bus, instrument stack, dish if you bought
  one, deployable solar arrays.
- **Views** — pad, chase, orbit, plus a slow automatic orbit; drag to rotate.

Performance: pixel ratio is capped, shadows and antialiasing are dropped on small
screens and low-memory devices, and `prefers-reduced-motion` shortens the launch
and disables the idle camera drift.

## Where the content comes from

Built from the challenge material supplied for the event, mapped to gameplay:

- **Mission design lifecycle (CML 1–4)** → campaign acts. Each act is one maturity
  level: cocktail napkin → initial feasibility → trade space → point design.
- **Four mission segments** (launch, spacecraft, ground, operations) → the four
  player consoles, the five preparation stages, the six design decisions and the
  six debrief checks.
- **CML paper** → the idea that cost, risk and science are traded, not maximised,
  and that each level closes with a review.
- **MDL study model** → the brief/driver/objective structure of every mission card.
- **GMAT / Mission Viz** → the launch-and-orbit sequence and the telemetry HUD
  (altitude, velocity, phase, event log).
- **Webb "build it yourself"** → the layered spacecraft stack: bus, instrument
  modules, dish, arrays, sunshade-like panels.
- **CubeSat 101** → bus classes, payload mass/power/data costs, and the ground
  segment as a real constraint.

## Honesty notes

- **No NASA endorsement.** This is a student hackathon project. NASA names appear
  only to credit the source material that inspired the mechanics.
- **Every number is illustrative.** Masses, powers, costs, risks and science
  points are teaching values chosen to make the trades legible, not derived from
  real mission budgets.
- **AI disclosure.** The game was built with AI assistance (code, copy and visual
  tuning) under human direction; the design model and content were reviewed by the
  team.
- **Maps.** Planet textures are NASA-derived imagery, downscaled and re-encoded
  for the web.

## Verification

Open `?selftest` to run 16 model checks in the console: every default design is
launchable, every mission has a compliant solution, and every solution fits its
mass and budget caps.

```
[Mission Architect] self-check passed (16 checks)
```

Model and content live in `data.js` / `model.js`; the scene and the campaign flow
never hard-code a mission number, so adding a fourth study is a data edit plus an
unlock slot.

## Credits

Team **No Risk No Fun** — NASA Space Apps Cairo 2026, 13–14 November, Sewedy
University of Technology.

Type: Space Grotesk, Inter, JetBrains Mono (SIL Open Font License).
3D: Three.js r128 (MIT).
