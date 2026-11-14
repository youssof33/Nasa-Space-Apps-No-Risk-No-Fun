# Mission Control — demo card

Double-click `index.html`. No install, no server, no internet, no build step.
three.js, all seven planetary textures, the audio and every screen are local files.

## Files

```
index.html            screens, loader, ops HUD, report
styles.css            all styling and animation
js/data.js            the catalogue (buses, arrays, instruments, orbits, ground, events)
js/sim.js             the model — pure functions, self-tested at boot
js/scene.js           the 3D scene (three.js, real NASA imagery)
js/audio.js           synthesised sound, no audio files
js/game.js            screens, 6 tabs, launch cinematic, ops phase, report, leaderboard
textures/             Earth day/normal/specular/clouds/lights, Moon, Mars
vendor/three.min.js   three.js r160 (vendored so the demo cannot fail offline)
```

## The 3-minute run (verified numbers, Engineer difficulty)

**0:00 — The hook.** Title → **Engineer** → **Begin**. Don't touch anything. Point at the
ticker under the launch button:

> "40 gigabits a day generated, 0.1 downlinked. 12% contact and no recorder — the spacecraft
> is fine, the ground link is the problem."

Press **Launch mission**, then click once to skip the cinematic.

> **Report: 0 / 100, grade F.** Two amber checks: data downlink and science return.

**0:35 — Fix the link.** Tab **Systems** → **512 Gb recorder**.
Tab **Craft** → **X-band HGA**.

> "The recorder buffers data the radio can't send yet; X-band moves it. But watch the power
> gauge: the recorder and the high-gain antenna add 17 W of load, and now the array is short."

The launch button goes **red** — power, not data.

Tab **Craft** → **Deployable 400 W**. Every check turns green.

> **92 / 100, grade A.** Three decisions.

**1:10 — The one-click version.** Press ★ **Recommended**.

> **93 / 100, grade A.** "It found the same mission, but it also worked out that a 64 Gb
> recorder is enough and saved $3.5 M. That is the trade a human forgets."

Now delete the recorder (Systems → **No recorder**) and watch the score collapse to **5 / 100**.
One component is the whole mission. Put it back.

**1:30 — Watch it fly.** Launch and let the cinematic run. This is the beat to shut up for:
countdown, ascent over Africa with the trail behind the vehicle, then mission operations —
the spacecraft on orbit, the scan cone sweeping the ground, data packets running down the
link to the dish.

**2:05 — A harder mission.** Tab **Objective** → **Water ice at the lunar south pole**.
The orbit, lifetime and budget change under you. Now:
Craft → **ESPA smallsat bus**, **Deployable 1200 W**, **400 Wh**, **X-band HGA**.
Orbit → **Heavy-lift**. Payload → **Radar sounder** + **Laser altimeter**.
Systems → **512 Gb recorder** + **Deep Space Network**.

> **22 / 100, grade F** — and not on mass or money. The radiation gauge reads
> **100 krad against 60 krad of shielding**, so the mission is cut to 60% and delivers
> 33 of the 45 science points it needs.

**2:30 — Buy shielding, not instruments.** Tab **Craft** → **Observatory bus**.

> **83 / 100, grade B**, every check green, 55 science points. Same payload, one component.

**2:50 — The kicker.** Click the **ENGINEER** chip in the top bar → **Flight Director**, and
launch again.

> "Same design, 15% less money and three random events — solar storms, instrument anomalies,
> ground station outages. Now the margins you left are what saves you. Every launch differs."

*Optional 10-second beat, if you have time:* on the crops mission, switch Systems → **Commercial
network**. The score drops a point and the downlink check goes amber — cheaper hardware, worse
contact. Bigger is not better.

## Live feedback while you build

- The **Proj** chip in the launch bar is the score you would get if you launched right now.
  It turns green at grade A and red when the design is broken — good for "watch what one
  component does".
- **Hover** a bus, array, antenna or instrument option and the 3D spacecraft rebuilds with that
  choice before you click. Wings, dish and payload deck change size on screen.
- The camera sits closer while the builder is open, so a bus swap is a visible size jump, not
  a subtle one. Every click that moves a resource flashes that gauge green or red.

## The Recommended button

The ★ **Recommended** button next to the launch control searches the whole catalogue and
installs the best design that clears *every* check: a 2,500-candidate random sweep, then a
hill-climb that flips one choice at a time while it helps.

- Crops / Cadet → 94, Engineer → 93, Director → 92. All grade A, all checks green.
  (Those are the projections the button shows; on Director, events can take a point or two off.)
- Ice → 87 (B), Mars → 89 (B): a clean deep-space design needs the shielded Observatory bus,
  and the score rewards efficiency, so a B is the honest ceiling.
- It prefers the cheapest, shortest-life design that works, so it never over-specifies.
- It counts radiation as a check, so it never suggests a spacecraft that a solar storm
  would cut in half.
- It takes about 30 ms, so it feels instant.

## What to say about the model

- Every number is computed, not scripted: mass, power, budget, downlink rate, radiation dose,
  eclipse battery, contact fraction.
- Orbit geometry drives power **and** data at once: the same eclipse and contact fractions
  starve both the array and the radio. That coupling is the lesson.
- Six hard gates (destination, objective instruments, launch mass, budget, power, eclipse
  battery) and three soft ones (downlink, radiation, science return). Blockers turn the button
  red; risks turn it amber but still fly and cost points.
- Four subsystems that most space games skip: ground-station network, onboard recorder,
  redundancy, propulsion type. Without a recorder you can only stream live while the ground
  is in view — which is why the default build scores zero.
- The four team roles each own a different budget and sign off before launch.

## Known limits — say these before a judge asks

- Figures are rounded from public mission reports and are **game-balanced, not
  flight-qualified**.
- Team play is role sign-off on one screen, not networked.
- No live NASA API calls. Everything is offline so venue wifi cannot break the demo.
- Leaderboard is `localStorage`, so it is per-browser.
- Next step with more time: swap the orbit table for live JPL Horizons geometry.

## Credits

- Earth (day, normal, specular, clouds, night lights) and Moon imagery: NASA / JPL,
  via the three.js r160 example textures.
- Mars: [Solar System Scope](https://www.solarsystemscope.com/textures/), CC BY 4.0.
- Model structure after NASA's *Design and Develop Science Missions* and JPL's
  *Concept Maturity Levels* (CML 1–4).
