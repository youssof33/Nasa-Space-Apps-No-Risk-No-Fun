import { signal } from "@preact/signals";

export type StepId = "spacecraft" | "power" | "payload" | "orbit" | "flight";

const STEPS: StepId[] = ["spacecraft", "power", "payload", "orbit", "flight"];

/**
 * Which workbench panel is open. In a party this is shared state: whoever
 * changes step, everyone's bench follows. Outside a party it is just the
 * screen's own memory.
 */
export const workbenchStep = signal<StepId>("spacecraft");

export function isStepId(value: unknown): value is StepId {
  return typeof value === "string" && STEPS.includes(value as StepId);
}
