export type Route =
  | { name: "select" }
  | { name: "briefing"; scenarioId: string }
  | { name: "workbench"; scenarioId: string }
  | { name: "launch"; scenarioId: string }
  | { name: "not-found" };

const briefingPattern = /^\/briefing\/([^/]+)$/;
const workbenchPattern = /^\/workbench\/([^/]+)$/;
const launchPattern = /^\/launch\/([^/]+)$/;

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, "").split("?")[0] ?? "";
  if (path === "" || path === "/") return { name: "select" };
  const briefing = briefingPattern.exec(path);
  if (briefing?.[1]) {
    return { name: "briefing", scenarioId: decodeURIComponent(briefing[1]) };
  }
  const workbench = workbenchPattern.exec(path);
  if (workbench?.[1]) {
    return { name: "workbench", scenarioId: decodeURIComponent(workbench[1]) };
  }
  const launch = launchPattern.exec(path);
  if (launch?.[1]) {
    return { name: "launch", scenarioId: decodeURIComponent(launch[1]) };
  }
  return { name: "not-found" };
}

export function routeToHash(route: Route): string {
  switch (route.name) {
    case "select":
      return "#/";
    case "briefing":
      return `#/briefing/${encodeURIComponent(route.scenarioId)}`;
    case "workbench":
      return `#/workbench/${encodeURIComponent(route.scenarioId)}`;
    case "launch":
      return `#/launch/${encodeURIComponent(route.scenarioId)}`;
    case "not-found":
      return "#/not-found";
  }
}
