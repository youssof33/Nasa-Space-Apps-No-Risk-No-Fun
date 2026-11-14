import { signal } from "@preact/signals";
import { routeToHash, type Route } from "../app/router";
import { isStepId, workbenchStep, type StepId } from "../app/workbench/step";
import { design, type DesignState } from "../integration/design";
import { MISSIONS } from "../integration/missions";
import { appState } from "../ui/state/store";
import { transitionTo } from "../ui/state/transition";

/**
 * Party mode: a room code, a live roster, and one shared session.
 *
 * The site is static; the roster and the session live in a Cloudflare Durable
 * Object behind /api/party. Everything here degrades to a clear error when that
 * service is not deployed, so the single-player flow never depends on it.
 *
 * Replication is whole-state, not event-by-event: every local change publishes
 * the current route, the design, and the open workbench step, and every member
 * applies what arrives. That is why a part chosen on one screen appears on all
 * of them, and why pressing Fly moves the whole room to the launch.
 */

export interface PartyMember {
  id: string;
  name: string;
  ready: boolean;
}

export type PartyStatus = "idle" | "connecting" | "live" | "error";

export interface PartyState {
  status: PartyStatus;
  code: string | null;
  selfId: string;
  name: string;
  hostId: string | null;
  members: PartyMember[];
  mission: string | null;
  started: boolean;
  error: string | null;
}

/** Everything the crew shares. Small enough to send on every change. */
export interface SessionSnapshot {
  route: Route;
  design: DesignState;
  step: StepId;
}

const NAME_KEY = "spacex:callsign";
const HOST_KEY = "spacex:party-host";
const CODE_PATTERN = /^[A-Z0-9]{5}$/;
const FLIGHT_KEYS = [
  "battery",
  "ground",
  "recorder",
  "redundancy",
  "propulsion",
  "launcher",
  "difficulty",
] as const;

const selfId = randomId();
let socket: WebSocket | null = null;
let reconnectTimer = 0;
let reconnectDelay = 1000;
let wanted = false;

/* Replication bookkeeping. `lastHash` is the snapshot both ends already agree
   on: it stops a received session from being echoed straight back. `adopted`
   marks whether this connection has already taken the room's state, so a later
   roster cannot overwrite a change made locally a moment ago. */
let unsubscribers: Array<() => void> = [];
let lastHash = "";
let adopted = false;
/* True while a received session is being written, so the signal writes it
   causes are not mistaken for local edits and echoed back half-applied. */
let applying = false;

export const party = signal<PartyState>({
  status: "idle",
  code: null,
  selfId,
  name: storedName(),
  hostId: null,
  members: [],
  mission: null,
  started: false,
  error: null,
});

export function isHost(): boolean {
  return party.value.hostId !== null && party.value.hostId === party.value.selfId;
}

export function partyName(): string {
  return party.value.name;
}

/** A stable number for the room, used to seed the flight's random events so
    every member reads the same report. Zero outside a party. */
export function partySeed(): number {
  const code = party.value.code;
  if (!code) return 0;
  let hash = 2166136261;
  for (let index = 0; index < code.length; index++) {
    hash ^= code.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function rememberName(name: string): void {
  const clean = name.trim().slice(0, 24) || "Commander";
  party.value = { ...party.value, name: clean };
  try {
    window.localStorage.setItem(NAME_KEY, clean);
  } catch {
    /* A private-mode store is not a reason to block the lobby. */
  }
}

/* ------------------------------------------------------------ room actions */

export async function createParty(): Promise<void> {
  party.value = { ...party.value, status: "connecting", error: null, code: null };
  try {
    const response = await fetch(api("api/party"), { method: "POST" });
    if (!response.ok) throw new Error(String(response.status));
    const data = (await response.json()) as { code?: string };
    if (!data.code || !CODE_PATTERN.test(data.code)) throw new Error("bad-code");
    sessionStore(HOST_KEY, data.code);
    connect(data.code, true);
  } catch {
    party.value = {
      ...party.value,
      status: "error",
      error: "The party service did not answer. Check the connection and try again.",
    };
  }
}

export async function joinParty(code: string): Promise<void> {
  const room = code.trim().toUpperCase();
  if (!CODE_PATTERN.test(room)) {
    party.value = { ...party.value, status: "error", error: "A room code is five letters or digits." };
    return;
  }
  party.value = { ...party.value, status: "connecting", error: null, code: room };
  try {
    const response = await fetch(api(`api/party/${room}`), {
      headers: { accept: "application/json" },
    });
    const data = response.ok ? ((await response.json()) as { exists?: boolean }) : null;
    if (!data?.exists) {
      party.value = {
        ...party.value,
        status: "error",
        error: "No party with that code. Check the five characters and try again.",
      };
      return;
    }
  } catch {
    party.value = {
      ...party.value,
      status: "error",
      error: "The party service is not reachable right now.",
    };
    return;
  }
  connect(room, false);
}

export function leaveParty(): void {
  wanted = false;
  window.clearTimeout(reconnectTimer);
  reconnectDelay = 1000;
  stopSync();
  if (socket) {
    socket.onclose = null;
    try {
      socket.send(JSON.stringify({ type: "leave" }));
    } catch {
      /* already closed */
    }
    socket.close();
    socket = null;
  }
  sessionStore(HOST_KEY, null);
  party.value = {
    ...party.value,
    status: "idle",
    code: null,
    hostId: null,
    members: [],
    mission: null,
    started: false,
    error: null,
  };
}

export function setReady(ready: boolean): void {
  send({ type: "ready", id: selfId, ready });
  const members = party.value.members.map((member) =>
    member.id === selfId ? { ...member, ready } : member,
  );
  party.value = { ...party.value, members };
}

export function chooseMission(mission: string): void {
  if (party.value.mission === mission) return;
  party.value = { ...party.value, mission };
  send({ type: "mission", id: selfId, mission });
}

export function startMission(mission: string): void {
  if (!isHost()) return;
  send({ type: "start", id: selfId, mission });
}

/* -------------------------------------------------------------- replication */

function snapshotOf(): SessionSnapshot {
  return {
    route: appState.value.route,
    design: design.value,
    step: workbenchStep.value,
  };
}

function startSync(): void {
  if (unsubscribers.length) return;
  unsubscribers = [
    design.subscribe(publish),
    workbenchStep.subscribe(publish),
    appState.subscribe(publish),
  ];
}

function stopSync(): void {
  for (const unsubscribe of unsubscribers) unsubscribe();
  unsubscribers = [];
  lastHash = "";
  adopted = false;
}

function publish(): void {
  if (applying) return;
  if (party.value.status !== "live") return;
  const session = snapshotOf();
  const hash = hashOf(session);
  if (hash === lastHash) return;
  lastHash = hash;
  send({ type: "session", id: selfId, session });
}

/** Adopt another member's session without bouncing it back to the room. */
function applySession(session: SessionSnapshot): void {
  applying = true;
  lastHash = hashOf(session);
  design.value = session.design;
  workbenchStep.value = session.step;
  applying = false;
  followRoute(session.route);
}

function followRoute(route: Route): void {
  if (routeToHash(route) === routeToHash(appState.value.route)) return;
  transitionTo(route, "Following the party");
  /* A local transition may already be running; `transitionTo` drops a second
     call, so ask once more after the veil has had time to clear. */
  window.setTimeout(() => {
    if (routeToHash(route) !== routeToHash(appState.value.route)) {
      transitionTo(route, "Following the party");
    }
  }, 1000);
}

function hashOf(session: SessionSnapshot): string {
  return JSON.stringify(session);
}

/* ---------------------------------------------------------------- socket */

function connect(code: string, host: boolean): void {
  wanted = true;
  window.clearTimeout(reconnectTimer);
  if (socket) {
    socket.onclose = null;
    socket.close();
    socket = null;
  }
  party.value = { ...party.value, status: "connecting", code, error: null };

  const ws = new WebSocket(api(`api/party/${code}/ws`).replace(/^http/, "ws"));
  socket = ws;

  ws.onopen = () => {
    reconnectDelay = 1000;
    ws.send(JSON.stringify({ type: "join", id: selfId, name: party.value.name, host }));
  };

  ws.onmessage = (event) => {
    let message: {
      type?: string;
      hostId?: string | null;
      members?: PartyMember[];
      mission?: string | null;
      started?: boolean;
      session?: unknown;
    };
    try {
      message = JSON.parse(String(event.data));
    } catch {
      return;
    }

    if (message.type === "roster") {
      party.value = {
        ...party.value,
        status: "live",
        hostId: message.hostId ?? null,
        members: Array.isArray(message.members) ? message.members : [],
        mission: message.mission ?? null,
        started: message.started === true,
        error: null,
      };
      startSync();
      if (!adopted) {
        adopted = true;
        const session = parseSession(message.session);
        if (session) applySession(session);
      }
      followStart();
      return;
    }

    if (message.type === "session") {
      const session = parseSession(message.session);
      if (session) applySession(session);
      return;
    }

    if (message.type === "start" && typeof message.mission === "string") {
      party.value = { ...party.value, started: true, mission: message.mission };
      followStart();
    }
  };

  ws.onclose = () => {
    if (!wanted) return;
    socket = null;
    stopSync();
    party.value = { ...party.value, status: "connecting" };
    window.clearTimeout(reconnectTimer);
    reconnectTimer = window.setTimeout(() => {
      if (!wanted || !party.value.code) return;
      if (reconnectDelay > 8000) {
        wanted = false;
        party.value = { ...party.value, status: "error", error: "Lost the party connection." };
        return;
      }
      reconnectDelay = Math.min(reconnectDelay * 2, 16000);
      connect(party.value.code, sessionGet(HOST_KEY) === party.value.code);
    }, reconnectDelay);
  };
}

/** Everyone lands on the same brief, whether they started the room or joined it. */
function followStart(): void {
  const { started, mission } = party.value;
  if (!started || !mission) return;
  if (appState.value.route.name !== "select") return;
  transitionTo({ name: "briefing", scenarioId: mission }, "Joining the party mission");
}

function send(message: unknown): void {
  if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

/* ------------------------------------------------------------ validation */

function parseSession(raw: unknown): SessionSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const route = parseRoute(value.route);
  const designState = parseDesign(value.design);
  if (!route || !designState || !isStepId(value.step)) return null;
  return { route, design: designState, step: value.step };
}

function parseRoute(raw: unknown): Route | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as { name?: unknown; scenarioId?: unknown };
  if (value.name === "select") return { name: "select" };
  if (value.name === "not-found") return { name: "not-found" };
  if (value.name !== "briefing" && value.name !== "workbench" && value.name !== "launch") {
    return null;
  }
  if (typeof value.scenarioId !== "string") return null;
  if (!MISSIONS.some((mission) => mission.id === value.scenarioId)) return null;
  return { name: value.name, scenarioId: value.scenarioId };
}

function parseDesign(raw: unknown): DesignState | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const build = value.build as Record<string, unknown> | null;
  const flight = value.flight as Record<string, unknown> | null;
  if (typeof value.scenarioId !== "string") return null;
  if (!MISSIONS.some((mission) => mission.id === value.scenarioId)) return null;
  if (typeof value.orbit !== "string" || !value.orbit) return null;
  if (!build || typeof build !== "object" || !flight || typeof flight !== "object") return null;

  const instruments = Array.isArray(build.instruments)
    ? build.instruments.filter((id): id is string => typeof id === "string").slice(0, 8)
    : [];
  const years = flight.years;
  if (typeof years !== "number" || !Number.isFinite(years)) return null;
  for (const key of FLIGHT_KEYS) {
    if (typeof flight[key] !== "string") return null;
  }

  return {
    scenarioId: value.scenarioId,
    orbit: value.orbit,
    build: {
      bus: nullableString(build.bus),
      power: nullableString(build.power),
      comms: nullableString(build.comms),
      instruments,
    },
    flight: {
      battery: flight.battery as string,
      ground: flight.ground as string,
      recorder: flight.recorder as string,
      redundancy: flight.redundancy as string,
      propulsion: flight.propulsion as string,
      launcher: flight.launcher as string,
      years,
      difficulty: flight.difficulty as string,
    },
  };
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/* ------------------------------------------------------------------ utils */

function api(path: string): string {
  return new URL(path, document.baseURI).toString();
}

function storedName(): string {
  try {
    return window.localStorage.getItem(NAME_KEY)?.slice(0, 24) || "Commander";
  } catch {
    return "Commander";
  }
}

function sessionStore(key: string, value: string | null): void {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    /* no session store: the creator simply does not reclaim host on reload */
  }
}

function sessionGet(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function randomId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2, 12);
}
