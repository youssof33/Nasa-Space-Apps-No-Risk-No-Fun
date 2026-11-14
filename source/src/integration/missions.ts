import { SCENARIOS } from "./hussein/data";

export type ObjectiveId = "crops" | "polar" | "ice" | "dust";
export type ScienceNeed = "imaging" | "composition" | "subsurface" | "topography" | "weather";

/**
 * The merged site has one mission per body. This table is the single place
 * where the three vocabularies meet:
 *   - `id`        Hussein's scenario id (selection options + scoring)
 *   - `objective` Mission Control's objective id (the Brief tab)
 *   - `shady`     Mission Architect's mission id (take-off to orbit)
 *   - `need`      the science tags Mission Control's flight model requires
 */
export interface IntegrationMission {
  id: string;
  objective: ObjectiveId;
  shady: "ares" | "lunar" | "mars";
  name: string;
  /** The name the merged site uses on the brief and the launch stage. */
  siteName: string;
  body: "earth" | "moon" | "mars";
  need: ScienceNeed[];
}

export const MISSIONS: IntegrationMission[] = [
  {
    id: "polar-watch",
    objective: "polar",
    shady: "ares",
    name: "POLAR WATCH",
    siteName: "POLAR WATCH",
    body: "earth",
    need: ["imaging", "composition"],
  },
  {
    id: "lunar-ice",
    objective: "ice",
    shady: "lunar",
    name: "SHACKLETON",
    siteName: "LUNAR ICE",
    body: "moon",
    need: ["subsurface", "topography"],
  },
  {
    id: "mars-dust",
    objective: "dust",
    shady: "mars",
    name: "DUST WATCH",
    siteName: "MARS DUST",
    body: "mars",
    need: ["imaging", "weather"],
  },
];

export function missionById(id: string | undefined): IntegrationMission {
  return MISSIONS.find((mission) => mission.id === id) ?? MISSIONS[0];
}

/* The Brief tab lists Mission Control's whole objective catalogue. The merged
   site flies three missions, so the other objectives fall back to the mission
   on the same body instead of dumping the player on the first card. */
const OBJECTIVE_ALIASES: Record<string, string> = {
  crops: "polar-watch",
  mars: "mars-dust",
  shackleton: "lunar-ice",
};

export function missionByObjective(objective: string | undefined): IntegrationMission {
  if (objective && OBJECTIVE_ALIASES[objective]) {
    return missionById(OBJECTIVE_ALIASES[objective]);
  }
  return MISSIONS.find((mission) => mission.objective === objective) ?? MISSIONS[0];
}

export function scenarioOf(id: string | undefined) {
  const mission = missionById(id);
  return SCENARIOS.find((scenario: { id: string }) => scenario.id === mission.id) ?? SCENARIOS[0];
}
