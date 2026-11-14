# Nasa-Space-Apps-No-Risk-No-Fun
SpaceX, a browser game about designing a space mission. Team No Risk No Fun. Cairo 2026 NASA Space Apps Challenge, Space Mission Design Game.

# SpaceX

**NASA Space Apps Challenge 2026 — browser-based space mission design game.**

Choose a mission, read the brief, design the spacecraft, fly it, and find out why
it worked. Everything runs in the browser: no accounts, no runtime API calls for
the single-player flow. Party mode is an optional extra: a small Cloudflare
Worker hands out room codes so friends can start the same mission together.

**Live site:** https://spacex-mission-control.youssofhossam33.workers.dev

## What is in this folder

```
Website/
  index.html            the runnable site
  assets/  game/  ascent/  media/
  README.md             this file
  source/               the full, readable source of the same site
```

The root of this folder is the production build. `source/` contains the
TypeScript/Preact application, the two embedded simulation modules, the
Cloudflare Worker that powers party mode, the asset pipeline, and the design
notes — everything needed to rebuild it.

## Run it

The site is static, but it must be served over HTTP: ES modules, Web Workers, and
the WebGL iframes do not run from `file://`.

```sh
npx serve .                 # or any static server
# or
python -m http.server 8080
```

Open the URL it prints. Asset paths are relative, so the folder also works from a
sub-folder of a host (GitHub Pages, Netlify, S3, an intranet share).

## The experience

1. **Mission select** — a live 3D Earth, three missions, a demo reel, and
   **Play with friends**.
2. **Brief** — the target body in 3D beside the mission brief: objective, science
   target, data budget, and the orbit it implies. POLAR WATCH (Earth), LUNAR ICE
   (Moon), MARS DUST (Mars).
3. **Design** — five steps (Spacecraft, Power, Payload, Orbit, Flight) around a
   live 3D assembly bench. Mass, power, downlink, and budget meters respond to
   every part. Fly unlocks only when the spacecraft can do the job.
4. **Fly** — launch, ascent, orbit insertion, then operations with anomalies to
   mitigate. The spacecraft in flight is the one you designed.
5. **Report** — mission score, the findings behind it, and a way back to a new
   mission.

The hull is built from one shared assembly model, so the brief, the design bench,
and the flight scene show the same spacecraft.

## Play with friends

**Play with friends** on the start screen opens a lobby:

- **Create a party** — you host, and you get a five-character room code to share.
- **Join a party** — type a friend's code; the roster updates live for everyone.

The host picks the mission and starts it, and every member of the room lands on
that mission's brief at the same time. Guests can mark themselves ready; the host
owns the mission choice. Rooms with nobody left are forgotten after ten minutes.

The lobby calls `/api/party` on the same origin. On the deployed site that is the
Worker in `source/worker/`; when the folder is served by a plain static server,
the button reports that the party service is unreachable and single-player is
unaffected.

## Controls

| Where | Input |
| --- | --- |
| Mission select | Drag to orbit the Earth, scroll or pinch to zoom |
| Design | Click a step, pick a part, drag an instrument onto the bench |
| Brief / Fly | Follow the on-screen actions; anomalies offer a choice |
| Anywhere | About and Settings in the footer; **Reduce motion** stops 3D spin |

## Technology

- Preact 11 + `@preact/signals`, strict TypeScript, Vite 6
- three.js with hand-written GLSL for Earth, atmosphere, and starfield
- Three isolated 3D builds: the shell's scenes, the brief/operations module, and
  the ascent module — each with its own renderer, so they cannot fight over
  WebGL state
- A deterministic mission engine (`source/src/engine`) shared by the design
  screen and the flight preview
- Vitest for the router, engine, and asset selection
- Cloudflare Worker + Durable Object for party rooms (WebSocket roster, no
  database, no accounts)
- Self-hosted fonts, local NASA imagery, no trackers, no analytics

## Rebuild from source

```sh
cd source
npm install
npm run dev        # local dev server
npm run build      # production bundle into source/dist
npm test           # 22 unit tests
```

Node 20 or newer.

## Deploy

The live site is one Cloudflare Worker: static assets plus `/api/party`.

```sh
cd source
npx wrangler login   # once per machine
npm run deploy       # build + wrangler deploy
```

`source/wrangler.jsonc` serves `dist/`, runs the Worker only for `/api/*`, and
binds the `PartyRoom` Durable Object as `PARTY`.

## Credits

Imagery: NASA Earth Observatory (Blue Marble: Next Generation, Black Marble) and
NASA/JPL planetary maps, converted to local WebP derivatives; credits are shown
in the app's About panel and in `source/docs/asset-credits.md`.

NASA does not endorse this project or the NASA Space Apps Challenge. Mission
names and analogs are referenced for educational context only. Catalog values
are educational estimates from public datasheets, not verified hardware
specifications.

Fonts are self-hosted through Fontsource under the SIL Open Font License.
