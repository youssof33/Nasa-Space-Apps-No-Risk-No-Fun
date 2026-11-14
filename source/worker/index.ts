/* ==========================================================================
   Cloudflare Worker: the static site plus the party service.

   Static files are served by Cloudflare's asset layer. This Worker only runs
   for /api/*, where it hands out room codes and forwards each room's WebSocket
   to a Durable Object. The Durable Object keeps the roster, so a room survives
   worker restarts and every member sees the same list.
   ========================================================================== */

export interface Env {
  PARTY: DurableObjectNamespace;
}

/* No I, O, 0 or 1: a code read aloud over voice chat stays unambiguous. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 5;
const CODE_PATTERN = /^[A-Z0-9]{5}$/;

/* Room state is dropped this long after the last member disconnects. */
const EMPTY_ROOM_TTL_MS = 10 * 60 * 1000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  let code = "";
  for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return code;
}

async function createRoom(env: Env): Promise<Response> {
  /* Collisions are vanishingly rare, but a retry is cheaper than trusting luck. */
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = newCode();
    const room = env.PARTY.get(env.PARTY.idFromName(code));
    const created = await room.fetch("https://party/init", { method: "POST" });
    if (created.ok) return json({ code }, 201);
  }
  return json({ error: "no-code-available" }, 503);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const parts = new URL(request.url).pathname.split("/").filter(Boolean);

    if (parts[0] !== "api" || parts[1] !== "party") {
      return json({ error: "not-found" }, 404);
    }

    if (parts.length === 2) {
      if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405, headers: { allow: "POST" } });
      }
      return createRoom(env);
    }

    const code = parts[2]?.toUpperCase() ?? "";
    if (!CODE_PATTERN.test(code)) return json({ error: "invalid-code" }, 400);

    const room = env.PARTY.get(env.PARTY.idFromName(code));

    if (parts.length === 3) {
      const response = await room.fetch("https://party/exists");
      return new Response(response.body, { status: response.status, headers: response.headers });
    }

    if (parts.length === 4 && parts[3] === "ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return json({ error: "upgrade-required" }, 426);
      }
      return room.fetch(request);
    }

    return json({ error: "not-found" }, 404);
  },
};

/* ---------------------------------------------------------------- the room */

interface Member {
  id: string;
  name: string;
  ready: boolean;
}

interface PartySocket extends WebSocket {
  serializeAttachment(value: Member): void;
  deserializeAttachment(): Member | null;
}

interface DurableObjectId {
  toString(): string;
}

interface DurableObjectStub {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}

interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

interface DurableObjectStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  deleteAll(): Promise<void>;
  setAlarm(at: number): Promise<void>;
}

interface DurableObjectState {
  storage: DurableObjectStorage;
  acceptWebSocket(socket: WebSocket): void;
  getWebSockets(): PartySocket[];
}

interface WebSocketResponseInit extends ResponseInit {
  webSocket: WebSocket;
}

declare const WebSocketPair: {
  new (): { 0: WebSocket; 1: WebSocket };
};

export class PartyRoom {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;

    if (path === "/init") {
      if (await this.state.storage.get("created")) return json({ error: "taken" }, 409);
      await this.state.storage.put("created", true);
      return json({ created: true }, 201);
    }

    if (path === "/exists") {
      const created = (await this.state.storage.get("created")) === true;
      return json({ exists: created });
    }

    if (request.headers.get("Upgrade") !== "websocket") {
      return json({ error: "upgrade-required" }, 426);
    }

    const pair = new WebSocketPair();
    this.state.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] } as WebSocketResponseInit);
  }

  async webSocketMessage(socket: PartySocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== "string") return;

    let message: {
      type?: string;
      id?: string;
      name?: string;
      host?: boolean;
      ready?: boolean;
      mission?: string;
      session?: unknown;
    };
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    switch (message.type) {
      case "join":
        await this.join(socket, message);
        return;
      case "ready":
        socket.serializeAttachment({ ...(socket.deserializeAttachment() as Member), ready: message.ready === true });
        await this.broadcast();
        return;
      case "mission":
        if (!message.mission) return;
        await this.state.storage.put("mission", message.mission);
        await this.broadcast();
        return;
      case "session":
        /* The whole shared session (route, design, open step). It is a
           pass-through: the room keeps the latest copy so a late joiner lands
           where everyone else already is. */
        if (!message.session || typeof message.session !== "object") return;
        await this.state.storage.put("session", message.session);
        this.sendExcept(socket, { type: "session", from: message.id ?? null, session: message.session });
        return;
      case "start": {
        if (!(await this.isHost(message.id)) || !message.mission) return;
        await this.state.storage.put("mission", message.mission);
        await this.state.storage.put("started", true);
        this.send({ type: "start", mission: message.mission });
        await this.broadcast();
        return;
      }
      case "leave":
        socket.close(1000, "left");
        return;
      default:
        return;
    }
  }

  async webSocketClose(_socket: PartySocket): Promise<void> {
    if (this.state.getWebSockets().length > 0) {
      await this.broadcast();
      return;
    }
    /* Nobody is left: give a refresh a few minutes to reconnect, then forget
       the room so its code can be reused. */
    await this.state.storage.setAlarm(Date.now() + EMPTY_ROOM_TTL_MS);
  }

  async webSocketError(socket: PartySocket): Promise<void> {
    socket.close(1011, "socket error");
  }

  async alarm(): Promise<void> {
    if (this.state.getWebSockets().length === 0) await this.state.storage.deleteAll();
  }

  private async join(socket: PartySocket, message: { id?: string; name?: string; host?: boolean }): Promise<void> {
    if (!message.id) return;
    socket.serializeAttachment({
      id: message.id,
      name: (message.name || "Commander").slice(0, 24),
      ready: false,
    });
    const hostId = await this.state.storage.get<string>("host");
    if (!hostId && message.host) await this.state.storage.put("host", message.id);
    await this.broadcast();
  }

  private async isHost(id: string | undefined): Promise<boolean> {
    if (!id) return false;
    return (await this.state.storage.get<string>("host")) === id;
  }

  private async broadcast(): Promise<void> {
    const members: Member[] = [];
    for (const socket of this.state.getWebSockets()) {
      const member = socket.deserializeAttachment();
      if (member) members.push({ id: member.id, name: member.name, ready: member.ready });
    }
    this.send({
      type: "roster",
      hostId: (await this.state.storage.get<string>("host")) ?? null,
      mission: (await this.state.storage.get<string>("mission")) ?? null,
      started: (await this.state.storage.get("started")) === true,
      session: (await this.state.storage.get("session")) ?? null,
      members,
    });
  }

  private send(message: unknown): void {
    const payload = JSON.stringify(message);
    for (const socket of this.state.getWebSockets()) {
      try {
        socket.send(payload);
      } catch {
        /* A socket that is already gone is not an error worth reporting. */
      }
    }
  }

  private sendExcept(origin: PartySocket, message: unknown): void {
    const payload = JSON.stringify(message);
    for (const socket of this.state.getWebSockets()) {
      if (socket === origin) continue;
      try {
        socket.send(payload);
      } catch {
        /* A socket that is already gone is not an error worth reporting. */
      }
    }
  }
}
