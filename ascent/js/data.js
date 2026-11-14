/* Mission Architect — content model.
   Values are illustrative teaching values, not flight data. */
(function () {
  "use strict";

  const DATA = {
    meta: {
      title: "Mission Architect",
      subtitle: "A space mission design game",
      event: "NASA Space Apps Cairo 2026",
      challenge: "Space Mission Design Game",
      team: "No Risk No Fun",
      version: "1.0",
      devMonths: 22,
    },

    cml: [
      { level: 1, name: "Cocktail Napkin", note: "The idea and the science question." },
      { level: 2, name: "Initial Feasibility", note: "First-order physics and a cost class." },
      { level: 3, name: "Trade Space", note: "Architecture trades between science, cost and risk." },
      { level: 4, name: "Point Design", note: "One design, major subsystems, margins, cost." },
    ],

    /* Four consoles, one spacecraft, one screen: hot-seat co-op. */
    roles: [
      { id: "cdr", name: "Flight Director", code: "CDR", colour: "#5fd3ff",
        duty: "Owns the brief, the test programme and the launch call." },
      { id: "sci", name: "Science Lead", code: "SCI", colour: "#46e6a0",
        duty: "Chooses the bus and the instruments that win the science." },
      { id: "lch", name: "Launch Engineer", code: "LCH", colour: "#ff8a3d",
        duty: "Chooses the ride and defends the mass margin." },
      { id: "ops", name: "Mission Ops", code: "OPS", colour: "#9d8cff",
        duty: "Builds the ground segment and buys the mission life." },
    ],

    stages: [
      { id: "brief", name: "The brief", short: "Brief", role: "cdr", groups: [],
        goal: "Read the requirement out loud before anyone touches the design." },
      { id: "craft", name: "Spacecraft", short: "Spacecraft", role: "sci", groups: ["bus", "payload"],
        goal: "Pick the bus and the instruments. Every payload spends mass, power, data and money." },
      { id: "launch", name: "Launch vehicle", short: "Vehicle", role: "lch", groups: ["vehicle"],
        goal: "Choose a ride that can lift this stack to this orbit. Mass margin is the argument you defend." },
      { id: "ops", name: "Ground & operations", short: "Ground", role: "ops", groups: ["ground", "life"],
        goal: "Close the link and buy the mission life. Distance makes both harder." },
      { id: "review", name: "Test & review", short: "Review", role: "cdr", groups: ["test"],
        goal: "Buy down risk, read every margin, then call the launch." },
    ],

    missions: [
      {
        id: "ares",
        no: "M-01",
        name: "ARES RELAY",
        tagline: "Keep the link alive.",
        cml: 2,
        body: "earth",
        bodyLabel: "EARTH",
        orbitLabel: "LEO · 550 KM · 51.6°",
        difficulty: "STANDARD",
        need: "A polar weather constellation can see the whole planet, but it cannot get its data home. It needs a relay that listens, stores, and downlinks every orbit.",
        objective: "Return at least 35 GB/sol, deliver 65 science points, keep risk at or under 25%, and stay inside the $620M cap.",
        targetScience: 65,
        minData: 35,
        budgetCap: 620,
        maxRisk: 25,
        requiredPayloads: ["dish"],
        requiredBus: null,
        requiredGround: null,
        fixedCost: 0,
        fixedLabel: "",
        multipliers: { science: 1, data: 1, comm: 1, solar: 1, risk: 0 },
        defaultDesign: { bus: "relay", vehicle: "vector-m", ground: "global", life: "36", test: "standard", payloads: ["cam", "spec", "dish", "mag", "rad"] },
        lesson: "A relay is a mass, power and downlink trade. The dish buys data, but it also buys mass and power that the rest of the payload cannot spend.",
      },
      {
        id: "lunar",
        no: "M-02",
        name: "LUNAR ICE",
        tagline: "Find water in the dark.",
        cml: 3,
        body: "moon",
        bodyLabel: "MOON",
        orbitLabel: "LUNAR POLAR · 100 KM",
        difficulty: "ADVANCED",
        need: "Orbital data hints at water ice in permanently shadowed craters at the lunar south pole. A polar orbiter has to map it, survive the thermal extremes, and phone home across 384,400 km.",
        objective: "Deliver 85 science points and 12 GB/sol, keep risk at or under 25%, and stay inside the $920M cap. Deep-space bus, DSN, spectrometer and relay are required.",
        targetScience: 85,
        minData: 12,
        budgetCap: 920,
        maxRisk: 25,
        requiredPayloads: ["spec", "dish"],
        requiredBus: "deep",
        requiredGround: "dsn",
        fixedCost: 100,
        fixedLabel: "Lunar transfer stage",
        multipliers: { science: 1.25, data: 0.8, comm: 0.55, solar: 0.65, risk: 8 },
        defaultDesign: { bus: "deep", vehicle: "vector-h", ground: "dsn", life: "36", test: "standard", payloads: ["spec", "dish", "cam", "mag"] },
        lesson: "Distance changes every budget at once. The Sun is weaker, the downlink is narrower, and the transfer stage eats the cost margin before the payload does.",
      },
      {
        id: "mars",
        no: "M-03",
        name: "MARS SURVEY",
        tagline: "Make the long call.",
        cml: 4,
        body: "mars",
        bodyLabel: "MARS",
        orbitLabel: "MARS ORBIT · 400 KM",
        difficulty: "EXPERT",
        need: "A global mineral survey of Mars must survive a nine-month cruise, an insertion burn, and a one-way light time of up to 22 minutes. Every bit of data has to be worth the wait.",
        objective: "Deliver 100 science points and 8 GB/sol, keep risk at or under 22%, and stay inside the $1.25B cap. Deep-space bus, DSN, spectrometer, relay and radiation sensor are required.",
        targetScience: 100,
        minData: 8,
        budgetCap: 1250,
        maxRisk: 22,
        requiredPayloads: ["spec", "dish", "rad"],
        requiredBus: "deep",
        requiredGround: "dsn",
        fixedCost: 220,
        fixedLabel: "Mars cruise stage",
        multipliers: { science: 1.4, data: 0.7, comm: 0.3, solar: 0.55, risk: 14 },
        defaultDesign: { bus: "deep", vehicle: "vector-h", ground: "dsn", life: "36", test: "standard", payloads: ["spec", "dish", "rad", "mag", "cam"] },
        lesson: "At Mars, downlink is the scarce resource. A camera that generates data faster than the link can return it is not science. It is a storage problem.",
      },
    ],

    buses: [
      {
        id: "scout", name: "Scout bus", family: "SMALL · HERITAGE",
        mass: 90, power: 85, downlink: 30, cost: 85, risk: 2,
        blurb: "A cheap, light bus for a single instrument. Little power and little room to grow.",
      },
      {
        id: "relay", name: "Relay bus", family: "MID · MODULAR",
        mass: 240, power: 170, downlink: 70, cost: 160, risk: 0,
        blurb: "The balanced workhorse. Enough power for two or three instruments and a real downlink.",
      },
      {
        id: "deep", name: "Deep-space bus", family: "LARGE · RAD-HARD",
        mass: 420, power: 300, downlink: 110, cost: 290, risk: -2,
        blurb: "Radiation-hard, high-gain, and heavy. Required beyond Earth orbit.",
      },
    ],

    payloads: [
      { id: "cam", name: "Multispectral camera", role: "Imaging", mass: 8, power: 40, data: 26, downlink: 0, cost: 12, science: 22, blurb: "Wide swaths, high data volume." },
      { id: "spec", name: "Imaging spectrometer", role: "Composition", mass: 16, power: 35, data: 18, downlink: 0, cost: 18, science: 26, blurb: "Reads minerals and ices from reflected light." },
      { id: "dish", name: "High-gain relay dish", role: "Downlink", mass: 14, power: 30, data: 0, downlink: 40, cost: 22, science: 6, blurb: "Adds 40 GB/sol of downlink. Required for a relay." },
      { id: "can", name: "Sample canister", role: "Sample return", mass: 30, power: 15, data: 8, downlink: 0, cost: 40, science: 18, blurb: "Heavy, expensive, and the only way to touch the answer." },
      { id: "rad", name: "Radiation sensor", role: "Environment", mass: 4, power: 10, data: 10, downlink: 0, cost: 8, science: 14, blurb: "Small, cheap, and required at Mars." },
      { id: "mag", name: "Magnetometer", role: "Fields", mass: 6, power: 12, data: 8, downlink: 0, cost: 10, science: 16, blurb: "A boom and a sensor. Low data, high return." },
      { id: "lidar", name: "Lidar altimeter", role: "Topography", mass: 12, power: 55, data: 14, downlink: 0, cost: 26, science: 20, blurb: "Precision terrain, but it draws real power." },
      { id: "bio", name: "Bio-nutrient payload", role: "Biology", mass: 20, power: 45, data: 6, downlink: 0, cost: 30, science: 24, blurb: "Low data, high science, and a long incubation." },
    ],

    vehicles: [
      {
        id: "vector-l", name: "Vector-L", family: "LIGHT · 2 STAGE",
        cost: 95, risk: 3, size: "l",
        capacity: { earth: 220, moon: 90, mars: 80 },
        blurb: "Cheap and quick. Only the smallest stack leaves the pad.",
      },
      {
        id: "vector-m", name: "Vector-M", family: "MEDIUM · 2 STAGE",
        cost: 180, risk: 0, size: "m",
        capacity: { earth: 480, moon: 220, mars: 190 },
        blurb: "The standard ride for a relay-class spacecraft.",
      },
      {
        id: "vector-h", name: "Vector-H", family: "HEAVY · 2 CORE + BOOSTERS",
        cost: 310, risk: -1, size: "h",
        capacity: { earth: 900, moon: 620, mars: 560 },
        blurb: "The only way to push a deep-space bus and its transfer stage.",
      },
    ],

    grounds: [
      { id: "leo", name: "Two ground stations", family: "EARTH ORBIT ONLY", cost: 25, eff: 0.8, coverage: 0.7, risk: 4, blurb: "Cheap, but long gaps between passes cost you data and science." },
      { id: "global", name: "Global network", family: "EARTH ORBIT · 4 STATIONS", cost: 45, eff: 0.95, coverage: 0.9, risk: 0, blurb: "Near-continuous coverage for LEO and SSO missions." },
      { id: "dsn", name: "Deep Space Network", family: "ANY ORBIT · PARTNER", cost: 80, eff: 1, coverage: 1, risk: 0, blurb: "The only realistic link beyond Earth orbit. Required for lunar and Mars." },
    ],

    lives: [
      { id: "12", name: "12 months", family: "SHORT · CHECKOUT", cost: 20, sci: 0.75, risk: 0, blurb: "A technology demonstration. Less time, less science." },
      { id: "36", name: "36 months", family: "PRIMARY MISSION", cost: 45, sci: 1, risk: 3, blurb: "The baseline. Enough overlap for a full seasonal cycle." },
      { id: "60", name: "60 months", family: "EXTENDED MISSION", cost: 70, sci: 1.2, risk: 8, blurb: "More science, more chances for something to fail." },
    ],

    tests: [
      { id: "lean", name: "Qualify only", family: "MINIMUM VERIFICATION", cost: 8, risk: 6, months: 0, blurb: "Test what the launch provider demands. Nothing more." },
      { id: "standard", name: "Standard I&T", family: "BUILD · VERIFY", cost: 15, risk: 0, months: 0, blurb: "Integration and test at the subsystem and system level." },
      { id: "extended", name: "Protoflight campaign", family: "FULL ENVIRONMENTAL", cost: 35, risk: -6, months: 3, blurb: "Vibration, thermal-vacuum, and a full mission rehearsal." },
    ],

    sources: [
      {
        name: "Design and Develop Science Missions",
        org: "NASA · 2025",
        url: "https://www.nasa.gov/wp-content/uploads/2025/04/250323-design-and-develop-science-mission.pdf",
        used: "The six-step lifecycle, the four mission segments, and the requirement to begin with the end product in mind.",
      },
      {
        name: "Concept Maturity Levels",
        org: "NASA JPL · 2015",
        url: "https://ntrs.nasa.gov/citations/20150007816",
        used: "The CML 1–4 ladder that structures the three-mission campaign and each debrief.",
      },
      {
        name: "Goddard Mission Design Lab",
        org: "NASA Goddard",
        url: "https://etd.gsfc.nasa.gov/capabilities/integrated-design-center/mission-design-lab/",
        used: "The rapid point-design study model: one room, one week, one integrated design.",
      },
      {
        name: "GMAT",
        org: "NASA · open source",
        url: "https://sourceforge.net/projects/gmat/",
        used: "The idea of an explicit orbit and trajectory trade. The game compresses it into orbit multipliers.",
      },
      {
        name: "NASA Mission Viz",
        org: "NASA · open source",
        url: "https://nasa.github.io/mission-viz/",
        used: "The 3D mission visualisation layer: launch, staging, deployment, and orbit operations.",
      },
      {
        name: "Build It Yourself",
        org: "NASA Webb",
        url: "https://science.nasa.gov/mission/webb/game-build-it-yourself/",
        used: "The build-a-spacecraft interaction: every choice changes the stack you see.",
      },
      {
        name: "CubeSat 101",
        org: "NASA CSLI",
        url: "https://www.nasa.gov/wp-content/uploads/2017/03/nasa_csli_cubesat_101_508.pdf",
        used: "The 18–24 month development timeline, the concept of operations, and the test programme.",
      },
      {
        name: "Space Apps Challenge",
        org: "NASA Space Apps",
        url: "https://www.spaceappschallenge.org/",
        used: "The challenge frame: an interactive game for designing, managing and simulating a mission.",
      },
    ],
  };

  window.MA = window.MA || {};
  window.MA.DATA = DATA;
})();
