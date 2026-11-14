/* ==========================================================================
   MISSION CONTROL — catalogue
   Figures are rounded from public NASA mission reports and NTRS trade studies.
   They are game-balanced, not flight-qualified.
   ========================================================================== */
window.DATA = (function () {

  const BODY = {
    earth: { name: "Earth", radius: 1.5, spin: 0.030, tex: "earth" },
    moon:  { name: "the Moon", radius: 0.95, spin: 0.008, tex: "moon" },
    mars:  { name: "Mars", radius: 1.15, spin: 0.028, tex: "mars" },
  };

  // `size` drives the 3D model only (0.85 tiny → 1.5 observatory)
  const BUS = [
    { id:"3u",   name:"CubeSat bus",       mass:4,   cost:1.5, house:5,   shield:30,  size:0.85, note:"Cheap. Tiny payload bay." },
    { id:"espa", name:"ESPA smallsat bus", mass:180, cost:25,  house:60,  shield:60,  size:1.15, note:"Workhorse for small science." },
    { id:"obs",  name:"Observatory bus",   mass:520, cost:120, house:150, shield:180, size:1.5,  note:"Redundant, deep-space rated." },
    { id:"h_std", name:"Standard bus",     mass:180, cost:18,  house:120, shield:40,  size:1.2,  note:"Flight-proven 1.2 m bus. Cheap and unremarkable." },
    { id:"h_pwr", name:"High-power bus",   mass:260, cost:26,  house:260, shield:70,  size:1.35, note:"Bigger structure and harness. Watts cost kilograms." },
    { id:"h_rad", name:"Radiation-hardened bus", mass:240, cost:32, house:180, shield:220, size:1.28, note:"Survives the belts. Pointless in low orbit." },
  ];

  const ARRAY = [
    { id:"a60",   name:"Fixed 60 W panel",  mass:2,  cost:0.8, w:60   },
    { id:"a400",  name:"Deployable 400 W",  mass:12, cost:4,   w:400  },
    { id:"a1200", name:"Deployable 1200 W", mass:40, cost:12,  w:1200 },
    { id:"a3000", name:"Twin 3000 W wings", mass:90, cost:25,  w:3000 },
    { id:"h_a420",  name:"Deployable 420 W",   mass:45,  cost:9,  w:420  },
    { id:"h_a900",  name:"High-gain 900 W",    mass:95,  cost:16, w:900  },
    { id:"h_a1350", name:"Dual-wing 1350 W",   mass:140, cost:24, w:1350 },
    { id:"h_rtg",   name:"MMRTG 110 W",        mass:45,  cost:22, w:110, constant:true,
      note:"Plutonium decay. Works in the dark, costs like it." },
  ];

  const BATTERY = [
    { id:"b50",   name:"50 Wh",   mass:1,  cost:0.3, wh:50   },
    { id:"b400",  name:"400 Wh",  mass:6,  cost:1.5, wh:400  },
    { id:"b2000", name:"2000 Wh", mass:25, cost:6,   wh:2000 },
  ];

  const INSTR = [
    { id:"cam",   name:"Multispectral imager", mass:8,  cost:6,  w:15, data:40,  sci:25, tag:"imaging",      note:"Wide swath, high data volume." },
    { id:"spec",  name:"Imaging spectrometer", mass:12, cost:10, w:25, data:12,  sci:30, tag:"composition",  note:"Reads mineral fingerprints." },
    { id:"radar", name:"Radar sounder",        mass:30, cost:22, w:60, data:25,  sci:35, tag:"subsurface",   note:"Sees metres below the surface." },
    { id:"mag",   name:"Magnetometer",         mass:3,  cost:2,  w:4,  data:0.5, sci:15, tag:"fields",       note:"Tiny, cheap, low data." },
    { id:"alt",   name:"Laser altimeter",      mass:9,  cost:8,  w:20, data:5,   sci:20, tag:"topography",   note:"Precise elevation, small data." },
    { id:"hab",   name:"Habitability suite",   mass:25, cost:30, w:45, data:8,   sci:45, tag:"biosignature", note:"The expensive one. Worth it." },
    { id:"plasma",name:"Plasma wave sensor",   mass:4,  cost:3,  w:6,  data:1,   sci:18, tag:"fields",       note:"Space weather, almost free." },
    { id:"h_cam",  name:"Multispectral camera",      mass:35,  cost:14, w:45,  data:12,  sci:30, tag:"imaging",     note:"Sharp visible imagery. Wants a low orbit." },
    { id:"h_spec", name:"Ocean colour spectrometer", mass:60,  cost:18, w:70,  data:18,  sci:45, tag:"composition", note:"Reads surface composition. Core of the science case." },
    { id:"h_radar",name:"Ice-penetrating radar",     mass:140, cost:34, w:320, data:60,  sci:70, tag:"subsurface",  note:"Sees below the surface. Devours power and data." },
    { id:"h_mag",  name:"Fluxgate magnetometer",     mass:8,   cost:5,  w:12,  data:0.5, sci:25, tag:"fields",      note:"Almost free. Rarely why a mission flies." },
    { id:"h_wx",   name:"Weather suite",             mass:40,  cost:16, w:55,  data:8,   sci:35, tag:"weather",     note:"Clouds, aerosols, storms. Good public imagery." },
  ];

  const COMMS = [
    { id:"uhf", name:"UHF omni",     mass:1,  cost:0.4, w:3,  mbps:0.1, note:"Low rate, no pointing" },
    { id:"s",   name:"S-band patch", mass:4,  cost:2,   w:12, mbps:2,   note:"Standard, modest" },
    { id:"x",   name:"X-band HGA",   mass:12, cost:7,   w:35, mbps:50,  note:"High rate, needs pointing" },
    { id:"ka",  name:"Ka-band HGA",  mass:20, cost:14,  w:55, mbps:200, note:"Huge rate, huge power" },
    { id:"h_s", name:"S-band (compact)",  mass:12, cost:6,  w:25,  mbps:8,  note:"8 Mb/s. Fine for a camera, hopeless for radar." },
    { id:"h_x", name:"X-band (compact)",   mass:28, cost:12, w:60,  mbps:30, note:"30 Mb/s. Workhorse of planetary observation." },
    { id:"h_ka",name:"Ka-band deep space", mass:45, cost:20, w:110, mbps:80, note:"80 Mb/s. Heavy dish, thirsty amplifier." },
  ];

  const GROUND = [
    { id:"comm", name:"Commercial network",     mul:0.55, cost:0.5, note:"A few passes a day. Cheap." },
    { id:"nen",  name:"NASA Near Earth Network", mul:1.00, cost:3.0, note:"Standard science support." },
    { id:"dsn",  name:"Deep Space Network",     mul:1.45, cost:12,  note:"Three sites, near-continuous coverage." },
  ];

  const RECORDER = [
    { id:"none", name:"No recorder",      mass:0, cost:0,   note:"Stream live only. Data dies in eclipse." },
    { id:"r64",  name:"64 Gb recorder",   mass:2, cost:2.5, note:"Buffers a few orbits." },
    { id:"r512", name:"512 Gb recorder",  mass:5, cost:6,   note:"Buffers weeks of data." },
  ];

  const REDUNDANCY = [
    { id:"single", name:"Single-string",      mul:1.00, mass:0,  mitigate:0,    note:"Cheapest. One failure ends the mission." },
    { id:"crit",   name:"Redundant critical", mul:1.28, mass:14, mitigate:0.45, note:"Backups on power and comms." },
    { id:"full",   name:"Fully redundant",    mul:1.65, mass:38, mitigate:0.75, note:"Two of everything. Expensive." },
  ];

  const PROPULSION = [
    { id:"chem", name:"Chemical propulsion", propMul:1.00, power:0,  cost:0,  note:"Fast burns, heavy tanks." },
    { id:"ep",   name:"Electric propulsion", propMul:0.35, power:45, cost:14, note:"Tiny propellant mass. Big power draw, slow spirals." },
  ];

  const ORBIT = [
    { id:"sso",   name:"LEO 550 km SSO", body:"earth", inc:98, rMul:1.55, eclipse:.36, contact:.12, launch:1.0,  decay:1.0, rad:5,  period:1.5, note:"Freeze-thaw lighting for imaging. Drag eats propellant." },
    { id:"polar", name:"LEO 800 km polar", body:"earth", inc:90, rMul:1.75, eclipse:.36, contact:.12, launch:1.05, decay:0.3, rad:20, period:1.7, note:"Longer life. More radiation." },
    { id:"meo",   name:"MEO 20,200 km", body:"earth", inc:55, rMul:2.90, eclipse:.02, contact:.90, launch:1.6,  decay:0,   rad:100,period:12,  note:"Near-constant sun and contact. Harsh radiation." },
    { id:"geo",   name:"GEO 35,786 km", body:"earth", inc:0,  rMul:3.80, eclipse:.02, contact:.95, launch:1.9,  decay:0,   rad:50, period:24,  note:"Stares at one hemisphere. Blind to the poles." },
    { id:"lunar", name:"Lunar orbit 100 km", body:"moon", inc:90, rMul:1.75, eclipse:.45, contact:.35, launch:2.6, decay:0, rad:20, period:2, note:"No magnetosphere. Lumpy gravity." },
    { id:"mars",  name:"Mars orbit 400 km", body:"mars", inc:93, rMul:1.80, eclipse:.40, contact:.45, launch:4.5, decay:.2, rad:15, period:2, note:"Relay needed. 12-minute light-time." },

    { id:"h_leo",  name:"LEO 550 km",        body:"earth", inc:52,  rMul:1.55, eclipse:.36, contact:.12, launch:1.0,  decay:1.0, rad:5,  period:1.5, note:"Cheap to reach. Narrow passes, short contact windows." },
    { id:"h_sso",  name:"SSO 700 km",        body:"earth", inc:98,  rMul:1.62, eclipse:.36, contact:.14, launch:1.05, decay:.55, rad:9,  period:1.6, note:"Same local time every pass. Best light for ice and ocean colour." },
    { id:"h_geo",  name:"GEO 35,786 km",     body:"earth", inc:0,   rMul:3.80, eclipse:.02, contact:.95, launch:1.9,  decay:0,   rad:50, period:24,  note:"Never lose contact. Too far for sharp surface detail." },

    { id:"h_polar",  name:"Lunar polar 100 km", body:"moon", inc:90, rMul:1.75, eclipse:.45, contact:.30, launch:2.6, decay:0, rad:20, period:2,   note:"Low and slow. Best resolution, worst contact time." },
    { id:"h_frozen", name:"Lunar 300 km",       body:"moon", inc:90, rMul:1.95, eclipse:.45, contact:.40, launch:2.7, decay:0, rad:18, period:2.4, note:"The compromise orbit. Enough passes to downlink." },
    { id:"h_halo",   name:"Lunar L2 halo",      body:"moon", inc:20, rMul:3.10, eclipse:.02, contact:.98, launch:3.0, decay:0, rad:12, period:14,  note:"Constant view of the far side. No surface detail worth the name." },

    { id:"h_low",  name:"Mars 400 km",       body:"mars", inc:93, rMul:1.80, eclipse:.40, contact:.45, launch:4.5, decay:.2, rad:15, period:2,   note:"Sharpest view of the surface. Dust eats your solar power." },
    { id:"h_msso", name:"Mars sun-sync 800 km", body:"mars", inc:97, rMul:1.95, eclipse:.40, contact:.50, launch:4.6, decay:.1, rad:14, period:2.3, note:"Same local time every pass. Reliable for weather." },
    { id:"h_areo", name:"Mars areostationary", body:"mars", inc:0, rMul:2.60, eclipse:.05, contact:.95, launch:5.0, decay:0, rad:12, period:20,  note:"Hangs over one point. Perfect relay, useless detail." },
  ];

  const LV = [
    { id:"small", name:"Small-lift",  leo:300,   cost:7.5, note:"Electron class" },
    { id:"med",   name:"Medium-lift", leo:15000, cost:67,  note:"Falcon 9 class" },
    { id:"heavy", name:"Heavy-lift",  leo:50000, cost:150, note:"Heavy class" },
  ];

  const OBJ = [
    { id:"crops", name:"Earth crop health monitor", body:"earth", tagline:"Cheap, fast, unforgiving of bad comms.",
      brief:"Daily multispectral coverage of farmland. The science is easy; getting the data home is not.",
      need:["imaging"], minSci:20, budget:120, years:3 },
    { id:"ice", name:"Water ice at the lunar south pole", body:"moon", tagline:"Find buried ice and map the terrain around it.",
      brief:"Permanently shadowed craters hold water ice. Radar finds it, the altimeter maps the approach.",
      need:["subsurface","topography"], minSci:45, budget:450, years:5 },
    { id:"mars", name:"Biosignatures on Mars", body:"mars", tagline:"The expensive one. Every gram is fought over.",
      brief:"Orbital survey of ancient habitable environments. Long cruise, long mission, no second chances.",
      need:["biosignature","composition"], minSci:60, budget:700, years:6 },
    { id:"polar", name:"Sea-ice watch over the poles", body:"earth", tagline:"One launch slot to explain a retreating ice pack.",
      brief:"Daily imaging and ocean-colour coverage through the melt season. Polar orbits see the poles; they pay for it in contact time.",
      need:["imaging","composition"], minSci:35, budget:160, years:3 },
    { id:"shackleton", name:"Shackleton crater ice survey", body:"moon", tagline:"Find the water that decides whether a base is possible.",
      brief:"Permanently shadowed craters at the lunar south pole. Radar finds the ice; a laser altimeter maps a safe approach for a lander.",
      need:["subsurface","topography"], minSci:50, budget:380, years:4 },
    { id:"dust", name:"Mars dust-storm watch", body:"mars", tagline:"A crew is two years out. Nobody can forecast the dust.",
      brief:"Track storm growth and atmospheric opacity through a full Martian year. A weather suite and an imager, at Mars, for five years.",
      need:["imaging","weather"], minSci:55, budget:620, years:5 },
  ];

  const DIFFICULTY = [
    { id:"cadet", name:"Cadet", budget:1.30, events:0, note:"Extra budget. No surprises." },
    { id:"engineer", name:"Engineer", budget:1.00, events:0, note:"Real budget. No surprises." },
    { id:"director", name:"Flight Director", budget:0.85, events:3, note:"Tight budget. Everything goes wrong." },
  ];

  const EVENTS = [
    { id:"storm", name:"Solar storm", text:"A coronal mass ejection dumps extra dose on the spacecraft.",
      apply:(m)=>{ m.dose *= 1.6; }, icon:"☀" },
    { id:"delay", name:"Launch delay", text:"Range conflict pushes the launch six weeks. Standing army costs money.",
      apply:(m)=>{ m.cost += 8 + m.o.budget * 0.02; }, icon:"⏱" },
    { id:"anomaly", name:"Instrument anomaly", text:"A detector degrades. Part of the science is lost.",
      apply:(m)=>{ m.sciPenalty *= 0.85; }, icon:"⚠" },
    { id:"weather", name:"Deep space weather", text:"Solar array output drops as the panels darken.",
      apply:(m)=>{ m.powerPenalty *= 0.88; }, icon:"⚡" },
    { id:"comms", name:"Ground station outage", text:"A DSN antenna goes down for maintenance. Downlink capacity drops.",
      apply:(m)=>{ m.linkPenalty *= 0.7; }, icon:"📡" },
    { id:"debris", name:"Debris avoidance", text:"A close approach forces a burn. Propellant is spent early.",
      apply:(m)=>{ m.propPenalty *= 1.25; }, icon:"☄" },
  ];

  return { BODY, BUS, ARRAY, BATTERY, INSTR, COMMS, GROUND, RECORDER, REDUNDANCY, PROPULSION,
           ORBIT, LV, OBJ, DIFFICULTY, EVENTS };
})();
