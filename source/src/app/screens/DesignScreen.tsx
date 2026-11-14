import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { PARTS, BODIES } from "../../integration/hussein/data";
import {
  design,
  flightPreviewOf,
  MAX_INSTRUMENTS,
  previewOf,
  selectPart,
  setFlight,
  setFlightYears,
  setOrbit,
  setScenario,
  toggleInstrument,
  totalsOf,
} from "../../integration/design";
import {
  FLIGHT_BATTERY,
  FLIGHT_DIFFICULTY,
  FLIGHT_GROUND,
  FLIGHT_LV,
  FLIGHT_PROPULSION,
  FLIGHT_RECORDER,
  FLIGHT_REDUNDANCY,
  type FlightEvaluation,
  type FlightPart,
} from "../../integration/flight";
import { missionById, scenarioOf } from "../../integration/missions";
import { stageModelOf } from "../../integration/stage";
import { Chip } from "../../ui/components/Chip";
import { Icon, type IconName } from "../../ui/components/icons";
import { Meter, type MeterTone } from "../../ui/components/Meter";
import { formatBudget, formatMass } from "../../ui/format/units";
import { navigate, pushToast } from "../../ui/state/store";
import { transitionTo } from "../../ui/state/transition";
import type { DesignStage, ViewBand } from "../../viz/DesignStage";
import type { StagePartId } from "../../viz/spacecraft/Spacecraft";
import { findOrbit } from "../workbench/model";
import { StageViewport, type StageStatus } from "../workbench/StageViewport";
import { workbenchStep, type StepId } from "../workbench/step";

/* ---------------------------------------------------------------------------
   A deliberately small workbench. Five questions, one panel, one 3D craft.
   The panel never leaves the right edge, the resource meters never leave the
   bottom, and the stage keeps the whole left side of the screen.

   The assembly itself is `stageModelOf(state)` — the exact same model that
   `craftSpecOf` serialises for the flight scene, so the craft that flies is
   the craft on the bench.
   --------------------------------------------------------------------------- */

const STEPS: Array<{ id: StepId; label: string; icon: IconName; title: string; hint: string }> = [
  {
    id: "spacecraft",
    label: "Spacecraft",
    icon: "structure",
    title: "The spacecraft",
    hint: "The bus is the frame everything bolts onto. The comms system decides how much data can reach the ground.",
  },
  {
    id: "power",
    label: "Power",
    icon: "solar",
    title: "Power & eclipse",
    hint: "Arrays make electricity in sunlight; the battery carries the spacecraft through the dark half of each orbit.",
  },
  {
    id: "payload",
    label: "Payload",
    icon: "payload",
    title: "Science payload",
    hint: `Up to ${MAX_INSTRUMENTS} instruments. Every instrument spends mass, power, data and money — and returns science.`,
  },
  {
    id: "orbit",
    label: "Orbit",
    icon: "orbit",
    title: "Orbit & lifetime",
    hint: "The orbit sets how close you fly, how often you see the ground and how much mass the launch slot can lift.",
  },
  {
    id: "flight",
    label: "Flight",
    icon: "sliders",
    title: "Flight configuration",
    hint: "The flight model's own options. These are carried unchanged into the launch and the mission report.",
  },
];

const PART_STEP: Record<string, StepId> = {
  structure: "spacecraft",
  solarPanel: "power",
  battery: "power",
  computer: "spacecraft",
  adcs: "spacecraft",
  antenna: "spacecraft",
  dataStorage: "flight",
  propulsion: "flight",
};

const STAGE_ORBIT: Record<string, "SSO" | "LUNAR" | "MARS_TRANSFER"> = {
  earth: "SSO",
  moon: "LUNAR",
  mars: "MARS_TRANSFER",
};

interface Part {
  id: string;
  cat: string;
  name: string;
  mass: number;
  power: number;
  gen?: number;
  down?: number;
  cost: number;
  data: number;
  science: number;
  blurb: string;
}

const PARTS_BY_CAT: Record<string, Part[]> = {
  bus: (PARTS as unknown as Part[]).filter((part) => part.cat === "bus"),
  power: (PARTS as unknown as Part[]).filter((part) => part.cat === "power"),
  comms: (PARTS as unknown as Part[]).filter((part) => part.cat === "comms"),
  instrument: (PARTS as unknown as Part[]).filter((part) => part.cat === "instrument"),
};

function stepForPart(part: StagePartId): StepId {
  if (part.startsWith("bay:")) return "payload";
  return PART_STEP[part] ?? "spacecraft";
}

function Pick({
  active,
  name,
  meta,
  foot,
  onClick,
}: {
  active: boolean;
  name: string;
  meta?: string;
  foot?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      class={`d2-pick${active ? " is-active" : ""}`}
      aria-pressed={active}
      onClick={onClick}
    >
      <span class="d2-pick__mark" aria-hidden="true">
        <Icon name="check" size={12} />
      </span>
      <span class="d2-pick__text">
        <span class="d2-pick__name">{name}</span>
        {meta && <span class="d2-pick__meta">{meta}</span>}
        {foot && <span class="d2-pick__foot">{foot}</span>}
      </span>
    </button>
  );
}

function Group({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <section class="d2-group">
      <p class="d2-group__label">{label}</p>
      <div class="d2-group__list">{children}</div>
    </section>
  );
}

function flightFoot(key: string, part: FlightPart, flight: FlightEvaluation): string {
  switch (key) {
    case "ground":
      return `${Math.round(flight.contact * 100)}% contact · ${formatBudget(part.cost)}`;
    case "recorder":
      return part.id === "none"
        ? "Stream only · no mass, no cost"
        : `${part.mass} kg · ${formatBudget(part.cost)} · buffers science`;
    case "redundancy":
      return `${part.mass} kg · ×${(part.mul ?? 1).toFixed(2)} hardware`;
    case "propulsion":
      return part.id === "ep"
        ? `${part.power} W · ${formatBudget(part.cost)} · −65% propellant`
        : "Baseline · fast burns, heavy tanks";
    default:
      return part.note ?? "";
  }
}

export function DesignScreen({ scenarioId }: { scenarioId: string }) {
  const state = design.value;
  const scenario = scenarioOf(scenarioId);
  const mission = missionById(scenarioId);
  const step = workbenchStep.value;
  const [selected, setSelected] = useState<StagePartId | null>(null);
  const [stageStatus, setStageStatus] = useState<StageStatus>("loading");
  const [arriving, setArriving] = useState(true);
  const stageRef = useRef<DesignStage | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const topRef = useRef<HTMLElement | null>(null);
  const [viewBand, setViewBand] = useState<ViewBand>({ left: 0, top: 0, right: 0, bottom: 0 });

  /* The assembly is framed inside the part of the screen the panel leaves
     free: left of the right-hand panel on desktop, between the header and the
     bottom sheet on phones. */
  useEffect(() => {
    const measure = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const left = panel.offsetLeft;
      let next: ViewBand;
      if (left > vw * 0.5) {
        next = { left: 0, top: 0, right: left, bottom: vh };
      } else {
        const topEl = topRef.current;
        const top = (topEl ? topEl.offsetTop + topEl.offsetHeight : 0) + 8;
        next = { left: 0, top, right: vw, bottom: panel.offsetTop };
      }
      setViewBand((prev) =>
        prev.left === next.left &&
        prev.top === next.top &&
        prev.right === next.right &&
        prev.bottom === next.bottom
          ? prev
          : next,
      );
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    if (observer && panelRef.current) observer.observe(panelRef.current);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setArriving(false), 1100);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (design.value.scenarioId !== scenarioId) setScenario(scenarioId);
  }, [scenarioId]);

  useEffect(() => {
    document.title = `${mission.siteName} design — SpaceX`;
  }, [mission]);

  const totals = totalsOf(state);
  const preview = previewOf(state);
  const flight = flightPreviewOf(state);
  const flightBlocked = flight.blockers.length > 0;
  const model = useMemo(() => stageModelOf(state), [state]);
  const orbit = findOrbit(STAGE_ORBIT[mission.body]) ?? findOrbit("SSO");
  const bodyName = BODIES[scenario.body as keyof typeof BODIES]?.name ?? mission.body;
  const orbitDef = (
    scenario.orbits as unknown as Record<
      string,
      { id: string; name: string; altitude: string; blurb: string; revisit: string }
    >
  )[state.orbit];

  const tone: MeterTone = totals.valid ? "ok" : "fail";
  const stepIndex = STEPS.findIndex((entry) => entry.id === step);
  const stepDef = STEPS[stepIndex] ?? STEPS[0];

  const launch = () => {
    if (!totals.valid) {
      pushToast(totals.problems[0] ?? "The design is not flight-ready yet.", "warning");
      return;
    }
    if (flightBlocked) {
      pushToast(flight.blockers[0]?.why ?? "The flight model rejects this configuration.", "warning");
      return;
    }
    navigate({ name: "launch", scenarioId });
  };

  const openStep = (next: StepId) => {
    workbenchStep.value = next;
    setSelected(null);
  };

  const renderStep = () => {
    switch (step) {
      case "spacecraft":
        return (
          <>
            <Group label="Structure / bus">
              {PARTS_BY_CAT.bus.map((part) => (
                <Pick
                  key={part.id}
                  active={state.build.bus === part.id}
                  name={part.name}
                  meta={part.blurb}
                  foot={`${formatMass(part.mass)} · ${part.power} W · ${formatBudget(part.cost)}`}
                  onClick={() => selectPart("bus", part.id)}
                />
              ))}
            </Group>
            <Group label="Communications">
              {PARTS_BY_CAT.comms.map((part) => (
                <Pick
                  key={part.id}
                  active={state.build.comms === part.id}
                  name={part.name}
                  meta={part.blurb}
                  foot={`${part.down} Gb/day · ${formatMass(part.mass)} · ${formatBudget(part.cost)}`}
                  onClick={() => selectPart("comms", part.id)}
                />
              ))}
            </Group>
          </>
        );

      case "power":
        return (
          <>
            <Group label="Solar array">
              {PARTS_BY_CAT.power.map((part) => (
                <Pick
                  key={part.id}
                  active={state.build.power === part.id}
                  name={part.name}
                  meta={part.blurb}
                  foot={`${part.gen} W generated · ${formatMass(part.mass)} · ${formatBudget(part.cost)}`}
                  onClick={() => selectPart("power", part.id)}
                />
              ))}
            </Group>
            <Group label={`Eclipse battery · needs ${Math.round(flight.batNeed)} Wh`}>
              {FLIGHT_BATTERY.map((part) => (
                <Pick
                  key={part.id}
                  active={state.flight.battery === part.id}
                  name={part.name}
                  meta={part.note}
                  foot={`${part.wh} Wh · ${part.mass} kg · ${formatBudget(part.cost)}`}
                  onClick={() => setFlight({ battery: part.id })}
                />
              ))}
            </Group>
          </>
        );

      case "payload":
        return (
          <Group label={`Instruments · ${state.build.instruments.length} / ${MAX_INSTRUMENTS} fitted`}>
            {PARTS_BY_CAT.instrument.map((part) => {
              const active = state.build.instruments.includes(part.id);
              const full = !active && state.build.instruments.length >= MAX_INSTRUMENTS;
              return (
                <Pick
                  key={part.id}
                  active={active}
                  name={part.name}
                  meta={part.blurb}
                  foot={`${part.power} W · ${part.science} science · ${formatMass(part.mass)} · ${formatBudget(part.cost)}${
                    full ? " · deck full" : ""
                  }`}
                  onClick={() => {
                    if (full) {
                      pushToast(`The payload deck holds ${MAX_INSTRUMENTS} instruments. Remove one first.`, "warning");
                      return;
                    }
                    toggleInstrument(part.id);
                  }}
                />
              );
            })}
          </Group>
        );

      case "orbit":
        return (
          <>
            <Group label="Mission orbit">
              {Object.values(
                scenario.orbits as unknown as Record<
                  string,
                  { id: string; name: string; altitude: string; blurb: string; revisit: string }
                >,
              ).map((candidate) => (
                <Pick
                  key={candidate.id}
                  active={state.orbit === candidate.id}
                  name={candidate.name}
                  meta={candidate.blurb}
                  foot={`${candidate.altitude} · ${candidate.revisit} revisit`}
                  onClick={() => setOrbit(candidate.id)}
                />
              ))}
            </Group>
            <Group label="Mission lifetime">
              <div class="d2-years">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((year) => (
                  <button
                    key={year}
                    type="button"
                    class={`d2-year${state.flight.years === year ? " is-active" : ""}`}
                    aria-pressed={state.flight.years === year}
                    onClick={() => setFlightYears(year)}
                  >
                    {year}y
                  </button>
                ))}
              </div>
              <p class="d2-note">
                Longer life means more science, but more propellant, more operations cost and more
                radiation dose.
              </p>
            </Group>
          </>
        );

      case "flight":
        return (
          <>
            <Group label="Launch vehicle">
              {FLIGHT_LV.map((part) => {
                const active = state.flight.launcher === part.id;
                const current = FLIGHT_LV.find((vehicle) => vehicle.id === state.flight.launcher);
                const launchFactor = current && flight.cap > 0 ? (current.leo ?? 0) / flight.cap : 1;
                const capacity = launchFactor > 0 ? (part.leo ?? 0) / launchFactor : 0;
                return (
                  <Pick
                    key={part.id}
                    active={active}
                    name={part.name}
                    meta={part.note}
                    foot={`${formatBudget(part.cost)} · lifts ${formatMass(capacity)} here`}
                    onClick={() => setFlight({ launcher: part.id })}
                  />
                );
              })}
            </Group>

            <Group label="Ground station network">
              {FLIGHT_GROUND.map((part) => (
                <Pick
                  key={part.id}
                  active={state.flight.ground === part.id}
                  name={part.name}
                  meta={part.note}
                  foot={flightFoot("ground", part, flight)}
                  onClick={() => setFlight({ ground: part.id })}
                />
              ))}
            </Group>

            <Group label="Onboard data recorder">
              {FLIGHT_RECORDER.map((part) => (
                <Pick
                  key={part.id}
                  active={state.flight.recorder === part.id}
                  name={part.name}
                  meta={part.note}
                  foot={flightFoot("recorder", part, flight)}
                  onClick={() => setFlight({ recorder: part.id })}
                />
              ))}
            </Group>

            <Group label="Redundancy">
              {FLIGHT_REDUNDANCY.map((part) => (
                <Pick
                  key={part.id}
                  active={state.flight.redundancy === part.id}
                  name={part.name}
                  meta={part.note}
                  foot={flightFoot("redundancy", part, flight)}
                  onClick={() => setFlight({ redundancy: part.id })}
                />
              ))}
            </Group>

            <Group label="Propulsion">
              {FLIGHT_PROPULSION.map((part) => (
                <Pick
                  key={part.id}
                  active={state.flight.propulsion === part.id}
                  name={part.name}
                  meta={part.note}
                  foot={flightFoot("propulsion", part, flight)}
                  onClick={() => setFlight({ propulsion: part.id })}
                />
              ))}
            </Group>

            <Group label="Flight difficulty">
              {FLIGHT_DIFFICULTY.map((level) => (
                <Pick
                  key={level.id}
                  active={state.flight.difficulty === level.id}
                  name={level.name}
                  meta={level.note}
                  foot={`Budget ×${level.budget.toFixed(2)} · ${level.events} random event${
                    level.events === 1 ? "" : "s"
                  }`}
                  onClick={() => setFlight({ difficulty: level.id })}
                />
              ))}
            </Group>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div class={`workbench design2${arriving ? " is-arriving" : ""}`}>
      <StageViewport
        stageRef={stageRef}
        model={model}
        orbit={orbit!}
        selected={selected}
        severities={{}}
        viewBand={viewBand}
        onSelect={(part) => {
          setSelected(part);
          if (part) workbenchStep.value = stepForPart(part);
        }}
        onStatus={setStageStatus}
        onDropInstrument={(id) => {
          toggleInstrument(id);
          openStep("payload");
        }}
      />

      <header class="d2-top" ref={topRef}>
        <button
          class="d2-back"
          type="button"
          onClick={() => transitionTo({ name: "briefing", scenarioId }, "Opening the mission brief")}
        >
          <Icon name="arrow-left" size={15} /> Mission brief
        </button>
        <p class="eyebrow">{scenario.kicker}</p>
        <h1>{mission.siteName}</h1>
        <div class="d2-top__chips">
          <Chip tone="neutral">{bodyName}</Chip>
          <Chip tone="neutral">{orbitDef?.name ?? "Orbit"}</Chip>
          <Chip tone="neutral">{scenario.lifetime}</Chip>
          <Chip tone="neutral">{formatBudget(scenario.budget)} cap</Chip>
          <span class={`stage-chip stage-chip--${stageStatus}`}>
            {stageStatus === "fallback" ? "STATIC MODE" : "LIVE 3D"}
          </span>
        </div>
      </header>

      <aside class="d2-panel" ref={panelRef} aria-label="Mission design">
        <div class="d2-steps" role="tablist" aria-label="Design steps">
          {STEPS.map((entry, index) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={step === entry.id}
              class={`d2-step${step === entry.id ? " is-active" : ""}`}
              onClick={() => openStep(entry.id)}
            >
              <span class="d2-step__num">{index + 1}</span>
              <Icon name={entry.icon} size={16} />
              <span class="d2-step__label">{entry.label}</span>
            </button>
          ))}
        </div>

        <header class="d2-panel__head">
          <p class="eyebrow">
            Step {stepIndex + 1} of {STEPS.length}
          </p>
          <h2>{stepDef.title}</h2>
          <p class="d2-hint">{stepDef.hint}</p>
        </header>

        <div class="d2-body">{renderStep()}</div>

        <div class="d2-meters">
          <Meter
            label="Mass"
            value={`${formatMass(totals.mass)} / ${formatMass(totals.orbit.capacity)}`}
            fraction={totals.orbit.capacity > 0 ? totals.mass / totals.orbit.capacity : 0}
            tone={totals.mass > totals.orbit.capacity ? "fail" : "ok"}
            hint="Spacecraft mass against the launch slot capacity."
          />
          <Meter
            label="Power"
            value={`${Math.round(totals.powerMargin * 100)}% margin`}
            fraction={totals.powerMargin / 0.3}
            tone={totals.powerMargin >= 0.3 ? "ok" : totals.net > 0 ? "warning" : "fail"}
            hint="Orbit-average generation above the load. 30% is the design target."
          />
          <Meter
            label="Downlink"
            value={`${totals.dataCap.toFixed(0)} / ${totals.dataGen.toFixed(0)} Gb`}
            fraction={totals.dataRatio}
            tone={totals.dataRatio > 0.98 ? "ok" : "warning"}
            hint="Data the link can return against data the payloads generate."
          />
          <Meter
            label="Budget"
            value={`${formatBudget(totals.cost)} / ${formatBudget(scenario.budget)}`}
            fraction={scenario.budget > 0 ? totals.cost / scenario.budget : 0}
            tone={totals.budgetLeft < 0 ? "fail" : tone}
            hint="Mission cost against the scenario cap."
          />
        </div>

        <footer class="d2-foot">
          <p class={`d2-status${flightBlocked ? " is-blocked" : ""}`}>
            <Icon name={flightBlocked ? "warning" : "check"} size={14} />
            <span>
              {flightBlocked
                ? `${flight.blockers[0].label}: ${flight.blockers[0].why}`
                : totals.valid
                  ? `Flight stack clears · ${Math.round(flight.wet)} / ${Math.round(
                      flight.cap,
                    )} kg · ${Math.round(flight.delivery * 100)}% data home`
                  : totals.problems[0]}
            </span>
          </p>
          <button
            type="button"
            class="btn btn--primary btn--lg d2-fly"
            onClick={launch}
            disabled={!totals.valid || flightBlocked}
            title={
              totals.valid
                ? (flight.blockers[0]?.why ?? "Start the launch sequence")
                : totals.problems[0]
            }
          >
            <Icon name="rocket" size={16} /> Fly mission
          </button>
          <p class="d2-reserve">
            {totals.valid && !flightBlocked
              ? `${preview.value} pts · ${formatBudget(totals.budgetLeft)} reserve · ${flight.grade} flight`
              : "Resolve the highlighted problem to fly."}
          </p>
        </footer>
      </aside>
    </div>
  );
}
