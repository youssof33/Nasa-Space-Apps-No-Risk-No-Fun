import { useState } from "preact/hooks";
import { Modal } from "../app/shell/Modal";
import { MISSIONS } from "../integration/missions";
import { Icon } from "../ui/components/icons";
import {
  chooseMission,
  createParty,
  isHost,
  joinParty,
  leaveParty,
  party,
  partyName,
  rememberName,
  setReady,
  startMission,
} from "./party";

/**
 * The party lobby: create a room, join one with a code, see who is in it, and
 * launch the same mission together. The roster is live; the room code is the
 * only thing a friend needs.
 */
export function PartyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const state = party.value;
  const [name, setName] = useState(partyName());
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const host = isHost();
  const busy = state.status === "connecting";

  const copyCode = async () => {
    if (!state.code) return;
    try {
      await navigator.clipboard.writeText(state.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Play with friends" eyebrow="Party link">
      {state.status === "live" && state.code ? (
        <div class="party">
          <div class="party__code">
            <div>
              <span class="party__label">Room code</span>
              <strong class="party__digits">{state.code}</strong>
            </div>
            <button class="btn btn--ghost" type="button" onClick={copyCode}>
              <Icon name={copied ? "check" : "copy"} />
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p class="party__hint">
            Share the code. Friends pick <strong>Join a party</strong> on the start screen and
            enter these five characters.
          </p>

          <div class="party__roster">
            <span class="party__label">
              In the room · {state.members.length}
            </span>
            <ul>
              {state.members.map((member) => (
                <li key={member.id}>
                  <span class="party__dot" data-ready={member.ready} aria-hidden="true" />
                  <span class="party__member">{member.name}</span>
                  {member.id === state.selfId && <em>you</em>}
                  {member.id === state.hostId && <b>host</b>}
                </li>
              ))}
            </ul>
          </div>

          <div class="party__host">
            <span class="party__label">Mission</span>
            <div class="party__missions">
              {MISSIONS.map((mission) => (
                <button
                  key={mission.id}
                  type="button"
                  class={`party__mission${state.mission === mission.id ? " is-active" : ""}`}
                  aria-pressed={state.mission === mission.id}
                  onClick={() => chooseMission(mission.id)}
                >
                  <span>{mission.siteName}</span>
                  <small>{mission.body}</small>
                </button>
              ))}
            </div>
            {host ? (
              <button
                class="btn btn--primary"
                type="button"
                onClick={() => startMission(state.mission ?? MISSIONS[0].id)}
              >
                Start mission
                <Icon name="arrow-right" />
              </button>
            ) : (
              <div class="party__guest">
                <p>
                  {state.started
                    ? "The mission is running. You can still join the next one."
                    : "Anyone can pick the mission. The host starts it."}
                </p>
                <button
                  class="btn btn--ghost"
                  type="button"
                  onClick={() => setReady(!state.members.find((m) => m.id === state.selfId)?.ready)}
                >
                  {state.members.find((m) => m.id === state.selfId)?.ready
                    ? "Not ready"
                    : "I'm ready"}
                </button>
              </div>
            )}
          </div>

          <button class="text-link party__leave" type="button" onClick={leaveParty}>
            Leave party
          </button>
        </div>
      ) : (
        <div class="party">
          <label class="party__field">
            <span class="party__label">Callsign</span>
            <input
              type="text"
              maxLength={24}
              value={name}
              placeholder="Commander"
              onInput={(event) => {
                setName(event.currentTarget.value);
                rememberName(event.currentTarget.value);
              }}
            />
          </label>

          <button
            class="btn btn--primary btn--lg"
            type="button"
            disabled={busy}
            onClick={() => createParty()}
          >
            Create a party
            <Icon name="plus" />
          </button>

          <div class="party__divider"><span>or join one</span></div>

          <div class="party__join">
            <input
              type="text"
              class="party__code-input"
              inputMode="text"
              autoComplete="off"
              spellcheck={false}
              maxLength={5}
              placeholder="CODE"
              aria-label="Room code"
              value={code}
              onInput={(event) => setCode(event.currentTarget.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              onKeyDown={(event) => {
                if (event.key === "Enter" && code.length === 5) void joinParty(code);
              }}
            />
            <button
              class="btn btn--ghost"
              type="button"
              disabled={busy || code.length !== 5}
              onClick={() => joinParty(code)}
            >
              Join a party
            </button>
          </div>

          {busy && <p class="party__status">Opening a channel…</p>}
          {state.status === "error" && state.error && (
            <p class="party__error" role="alert">
              <Icon name="warning" />
              {state.error}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
