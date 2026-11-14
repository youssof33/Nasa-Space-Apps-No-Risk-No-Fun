import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  busComponents,
  instruments,
  launchers,
  orbits,
  scenarios,
} from "../src/data/catalogs";
import type { BusComponent, Instrument, MissionDesign, Scenario } from "../src/data/types";
import { enumerateDesigns, evaluateDesign } from "../src/engine";
import type { EvaluationResult } from "../src/engine";
import { validateCatalogs } from "../src/data/catalog-validation";
import { catalogs } from "../src/data/catalogs";
import {
  EASY_RESOURCE_MARGIN_FRACTION,
  HARD_RESOURCE_MARGIN_FRACTION,
} from "../src/engine/constants";

const reportPath = resolve(dirname(fileURLToPath(import.meta.url)), "../docs/balance-report.md");
const beforeRun = process.argv.includes("--before");
const reportHeading = beforeRun ? "## Before tuning" : "## After tuning";
const policies = ["easy", "hard"] as const;
type Policy = (typeof policies)[number];
type Outcome = EvaluationResult["outcome"];

interface EvaluatedDesign {
  design: MissionDesign;
  result: EvaluationResult;
}

interface ParetoDesign {
  design: MissionDesign;
  scienceScorePoints: number;
  totalCostM: number;
}

interface AuditSummary {
  scenario: Scenario;
  policy: Policy;
  total: number;
  outcomes: Record<Outcome, number>;
  cheapestSuccess?: EvaluatedDesign;
  highestScienceSuccess?: EvaluatedDesign;
  highestScience?: EvaluatedDesign;
  successCount: number;
  successfulArchitectures: Set<string>;
  pareto: ParetoDesign[];
  limitingConstraints: Map<string, number>;
  bindingResources: Map<string, number>;
  partPicks: Map<string, number>;
  launcherPicks: Map<string, number>;
  orbitPicks: Map<string, number>;
}

if (!beforeRun) validateCatalogs(catalogs);
const summaries: AuditSummary[] = [];

for (const scenario of scenarios) {
  for (const policy of policies) {
    summaries.push(auditScenario(scenario, policy));
  }
}

const generatedReport = renderReport(summaries);
await mkdir(dirname(reportPath), { recursive: true });
const existingReport = await readFile(reportPath, "utf8").catch((error: unknown) => {
  if (isMissingFile(error)) return "";
  throw error;
});
const nextReport = replaceSection(existingReport, reportHeading, generatedReport);
await writeFile(reportPath, nextReport, "utf8");
console.log(generatedReport);
console.log(`\nWrote ${reportPath}`);

function auditScenario(scenario: Scenario, policy: Policy): AuditSummary {
  const outcomes: Record<Outcome, number> = { success: 0, partial: 0, failure: 0 };
  const successfulArchitectures = new Set<string>();
  const pareto: ParetoDesign[] = [];
  const limitingConstraints = new Map<string, number>();
  const bindingResources = new Map<string, number>();
  const partPicks = new Map<string, number>();
  const launcherPicks = new Map<string, number>();
  const orbitPicks = new Map<string, number>();
  let total = 0;
  let cheapestSuccess: EvaluatedDesign | undefined;
  let highestScienceSuccess: EvaluatedDesign | undefined;
  let highestScience: EvaluatedDesign | undefined;
  let successCount = 0;

  for (const design of enumerateDesigns(scenario)) {
    total += 1;
    const result = evaluateDesign(design, scenario, { difficulty: policy });
    outcomes[result.outcome] += 1;
    countConstraint(result, scenario, limitingConstraints);
    if (
      !highestScience ||
      result.metrics.scienceScorePoints > highestScience.result.metrics.scienceScorePoints
    ) {
      highestScience = { design, result };
    }
    if (result.outcome !== "success") continue;

    const evaluated = { design, result };
    countBindingResources(
      result,
      policy === "easy"
        ? EASY_RESOURCE_MARGIN_FRACTION
        : HARD_RESOURCE_MARGIN_FRACTION,
      bindingResources,
    );
    successCount += 1;
    successfulArchitectures.add(architectureKey(design));
    addParetoCandidate(pareto, {
      design,
      scienceScorePoints: result.metrics.scienceScorePoints,
      totalCostM: result.metrics.totalCostM,
    });
    if (
      !cheapestSuccess ||
      result.metrics.totalCostM < cheapestSuccess.result.metrics.totalCostM
    ) {
      cheapestSuccess = evaluated;
    }
    if (
      !highestScienceSuccess ||
      result.metrics.scienceScorePoints >
        highestScienceSuccess.result.metrics.scienceScorePoints
    ) {
      highestScienceSuccess = evaluated;
    }
    countPicks(design, partPicks);
    increment(launcherPicks, design.launcherId);
    increment(orbitPicks, design.orbitId);
  }

  return {
    scenario,
    policy,
    total,
    outcomes,
    cheapestSuccess,
    highestScienceSuccess,
    highestScience,
    successCount,
    successfulArchitectures,
    pareto,
    limitingConstraints,
    bindingResources,
    partPicks,
    launcherPicks,
    orbitPicks,
  };
}

function countBindingResources(
  result: EvaluationResult,
  requiredMargin: number,
  counts: Map<string, number>,
): void {
  const margins = result.shortfalls;
  const massShortfalls = margins.filter((shortfall) => shortfall.id.startsWith("mass"));
  if (massShortfalls.some((shortfall) => shortfall.actualMargin <= requiredMargin)) {
    increment(counts, "mass");
  }
  if (margins.some((shortfall) => shortfall.id === "power" && shortfall.actualMargin <= requiredMargin)) {
    increment(counts, "power");
  }
  if (margins.some((shortfall) => shortfall.id === "energy" && shortfall.actualMargin <= requiredMargin)) {
    increment(counts, "energy");
  }
  if (result.metrics.lostDataGB > 0) increment(counts, "data");
  if (result.metrics.linkMarginDb <= result.metrics.requiredLinkMarginDb) {
    increment(counts, "telecom");
  }
}

function countConstraint(
  result: EvaluationResult,
  scenario: Scenario,
  counts: Map<string, number>,
): void {
  const priority = [
    "mass",
    "power",
    "energy",
    "data",
    "telecom",
    "delta-v",
    "budget",
    "reliability",
  ];
  const scores = new Map(priority.map((name) => [name, Number.POSITIVE_INFINITY]));
  for (const shortfall of result.shortfalls) {
    const category = shortfall.id.startsWith("mass")
      ? "mass"
      : shortfall.id === "power"
        ? "power"
        : shortfall.id === "energy"
          ? "energy"
          : "telecom";
    scores.set(category, Math.min(scores.get(category) ?? Infinity, shortfall.actualMargin - shortfall.requiredMargin));
  }
  const metricMargins: Record<string, number> = {
    data:
      (result.metrics.returnedDataGB - scenario.threshold.dataReturnGB) /
      Math.max(scenario.threshold.dataReturnGB, 1),
    "delta-v":
      result.metrics.requiredDeltaVms > 0
        ? (result.metrics.availableDeltaVms - result.metrics.requiredDeltaVms) /
          result.metrics.requiredDeltaVms
        : 1,
    budget:
      result.metrics.budgetCapM > 0
        ? (result.metrics.budgetCapM - result.metrics.totalCostM) /
          result.metrics.budgetCapM
        : -1,
    reliability: result.metrics.missionSuccessProbability - 0.7,
  };
  for (const [name, margin] of Object.entries(metricMargins)) scores.set(name, margin);
  const limiting = priority.reduce((best, name) =>
    (scores.get(name) ?? Number.POSITIVE_INFINITY) <
    (scores.get(best) ?? Number.POSITIVE_INFINITY)
      ? name
      : best,
  );
  increment(counts, limiting);
}

function countPicks(design: MissionDesign, counts: Map<string, number>): void {
  for (const part of [...design.instruments, ...design.busComponents]) {
    increment(counts, part.id);
  }
}

function addParetoCandidate(frontier: ParetoDesign[], candidate: ParetoDesign): void {
  if (
    frontier.some(
      (other) =>
        other.scienceScorePoints >= candidate.scienceScorePoints &&
        other.totalCostM <= candidate.totalCostM,
    )
  ) {
    return;
  }
  for (let index = frontier.length - 1; index >= 0; index -= 1) {
    const other = frontier[index];
    if (
      other &&
      candidate.scienceScorePoints >= other.scienceScorePoints &&
      candidate.totalCostM <= other.totalCostM
    ) {
      frontier.splice(index, 1);
    }
  }
  frontier.push(candidate);
}

function architectureKey(design: MissionDesign): string {
  return [
    design.orbitId,
    design.launcherId,
    design.instruments.map(({ id }) => id).sort().join(","),
  ].join("|");
}

function renderReport(summaries: AuditSummary[]): string {
  const lines = [
    reportHeading,
    "",
    `Generated by \`npm run audit${beforeRun ? " -- --before" : ""}\`. The enumerator uses each scenario's default monthly operations cost and evaluates both difficulty policies.`,
    "",
    "| Scenario | Policy | Valid designs evaluated | Failure | Partial | Success |",
    "|---|---:|---:|---:|---:|---:|",
  ];
  for (const summary of summaries) {
    lines.push(
      `| ${summary.scenario.title} | ${capitalize(summary.policy)} | ${summary.total} | ${percent(summary.outcomes.failure, summary.total)} | ${percent(summary.outcomes.partial, summary.total)} | ${percent(summary.outcomes.success, summary.total)} |`,
    );
  }
  for (const summary of summaries) {
    lines.push(
      "",
      `### ${summary.scenario.title} — ${capitalize(summary.policy)}`,
      "",
      `- Valid enumerated designs evaluated: ${summary.total}; successful architectures: ${summary.successfulArchitectures.size}.`,
      `- Limiting constraint most often: ${mostCommon(summary.limitingConstraints)}.`,
      `- Successful designs at/below their margin target: mass ${summary.bindingResources.get("mass") ?? 0}, power ${summary.bindingResources.get("power") ?? 0}, energy ${summary.bindingResources.get("energy") ?? 0}, data ${summary.bindingResources.get("data") ?? 0}, telecom ${summary.bindingResources.get("telecom") ?? 0} (of ${summary.successCount}).`,
      `- Pareto frontier (science points vs total cost): ${summary.pareto.length} design(s).`,
      "",
    );
    appendSuccessBlock(lines, "Cheapest success", summary.cheapestSuccess);
    appendSuccessBlock(lines, "Highest-science success", summary.highestScienceSuccess);
    if (!summary.highestScienceSuccess) {
      appendSuccessBlock(lines, "Highest-science design (including failures)", summary.highestScience);
    }
    lines.push("Pareto frontier:");
    if (summary.pareto.length === 0) {
      lines.push("- None.");
    } else {
      lines.push("| Science | Cost (USD M) | Design |", "|---:|---:|---|");
      for (const entry of summary.pareto.slice(0, 30)) {
        lines.push(
          `| ${fixed(entry.scienceScorePoints)} | ${fixed(entry.totalCostM)} | ${describeDesign(entry.design)} |`,
        );
      }
      if (summary.pareto.length > 30) lines.push(`- Showing 30 of ${summary.pareto.length}.`);
    }
    lines.push("", "Part picks among successful designs:");
    if (summary.successCount === 0) {
      lines.push("- None.");
    } else {
      lines.push("| Part | Picked in | Rate |", "|---|---:|---:|");
      const allPartIds = [...instruments, ...busComponents]
        .map(({ id }) => id)
        .sort((left, right) => left.localeCompare(right));
      for (const id of allPartIds) {
        const count = summary.partPicks.get(id) ?? 0;
        lines.push(
          `| ${id} | ${count} / ${summary.successCount} | ${percent(count, summary.successCount)} |`,
        );
      }
      const eligibleInstruments = instruments.filter((instrument) =>
        instrumentCompatibleWithScenario(instrument, summary.scenario),
      );
      const frequent = eligibleInstruments
        .map((instrument) => [
          instrument.id,
          summary.partPicks.get(instrument.id) ?? 0,
        ] as const)
        .filter(([, count]) => count / summary.successCount > 0.9);
      const rare = eligibleInstruments
        .map((instrument) => [
          instrument.id,
          summary.partPicks.get(instrument.id) ?? 0,
        ] as const)
        .filter(([, count]) => count / summary.successCount < 0.05);
      lines.push(
        `- Non-mandatory instruments picked in >90%: ${idsOrNone(frequent)}.`,
        `- Non-mandatory instruments picked in <5%: ${idsOrNone(rare)}.`,
      );
    }
    lines.push("", `Launcher usage among successes: ${countsTable(summary.launcherPicks, launchers.map(({ id }) => id))}.`);
    lines.push(`Orbit usage among successes: ${countsTable(summary.orbitPicks, orbits.map(({ id }) => id))}.`);
  }
  lines.push(
    ...renderGlobalPartFrequencies(summaries),
  );
  lines.push(
    "",
    "Dominated parts (same-category bus and same-tag/body instrument comparisons; burdens = mass/cost/power, benefits = catalog performance):",
    `- ${dominatedParts().join(", ") || "None detected"}.`,
    `- Dominated launchers: ${dominatedLaunchers().join(", ") || "None detected"}.`,
    "",
  );
  return lines.join("\n");
}

function renderGlobalPartFrequencies(summaries: AuditSummary[]): string[] {
  const counts = new Map<string, number>();
  const eligibleCounts = new Map<string, number>();
  for (const summary of summaries) {
    for (const [id, count] of summary.partPicks) {
      increment(counts, id, count);
    }
    for (const instrument of instruments) {
      if (instrumentCompatibleWithScenario(instrument, summary.scenario)) {
        increment(eligibleCounts, instrument.id, summary.successCount);
      }
    }
    for (const component of busComponents) {
      increment(eligibleCounts, component.id, summary.successCount);
    }
  }
  const frequent = instruments
    .map((instrument) => [
      instrument.id,
      counts.get(instrument.id) ?? 0,
      eligibleCounts.get(instrument.id) ?? 0,
    ] as const)
    .filter(([, count, eligible]) => eligible > 0 && count / eligible > 0.9);
  const rare = instruments
    .map((instrument) => [
      instrument.id,
      counts.get(instrument.id) ?? 0,
      eligibleCounts.get(instrument.id) ?? 0,
    ] as const)
    .filter(([, count, eligible]) => eligible > 0 && count / eligible < 0.05);
  const neverPicked = [...instruments, ...busComponents]
    .filter(({ id }) => (counts.get(id) ?? 0) === 0)
    .map(({ id }) => id);
  const ids = [...instruments, ...busComponents]
    .map(({ id }) => id)
    .sort((left, right) => left.localeCompare(right));
  const lines = [
    "",
    `### Overall part picks across all scenarios and policies`,
    "",
    "| Part | Picked in | Rate |",
    "|---|---:|---:|",
  ];
  for (const id of ids) {
    const count = counts.get(id) ?? 0;
    const eligible = eligibleCounts.get(id) ?? 0;
    lines.push(
      `| ${id} | ${count} / ${eligible} eligible successful evaluations | ${eligible > 0 ? percent(count, eligible) : "n/a"} |`,
    );
  }
  lines.push(
    `- Non-mandatory instruments picked in >90% of eligible successes: ${idsOrNone(frequent.map(([id]) => id))}.`,
    `- Instruments picked in <5% of eligible successes: ${idsOrNone(rare.map(([id]) => id))}.`,
    `- Never picked in a successful design: ${idsOrNone(neverPicked)}.`,
  );
  return lines;
}

function instrumentCompatibleWithScenario(
  instrument: Instrument,
  scenario: Scenario,
): boolean {
  return scenario.allowedOrbits.some((orbitId) =>
    orbits.some(
      (orbit) =>
        orbit.id === orbitId &&
        instrument.compatibleBodies.includes(orbit.centralBody),
    ),
  );
}

function appendSuccessBlock(
  lines: string[],
  title: string,
  entry: EvaluatedDesign | undefined,
): void {
  lines.push(`#### ${title}`);
  if (!entry) {
    lines.push("- None.");
    return;
  }
  const metrics = entry.result.metrics;
  lines.push(
    `- Design: ${describeDesign(entry.design)}`,
    `- Metrics: science ${fixed(metrics.scienceScorePoints)}; dry/wet mass ${fixed(metrics.dryMassKg)}/${fixed(metrics.wetMassKg)} kg; launcher capacity ${fixed(metrics.launchCapacityKg)} kg; peak/average power ${fixed(metrics.peakPowerGenerationW)}/${fixed(metrics.orbitAveragePowerGenerationW)} W; average load ${fixed(metrics.averagePowerLoadW)} W; battery usable/eclipsed ${fixed(metrics.usableBatteryEnergyWh)}/${fixed(metrics.eclipseEnergyRequiredWh)} Wh; data generated/returned/lost ${fixed(metrics.generatedDataGB)}/${fixed(metrics.returnedDataGB)}/${fixed(metrics.lostDataGB)} GB; link ${fixed(metrics.linkMarginDb)} dB; delta-v available/required ${fixed(metrics.availableDeltaVms)}/${fixed(metrics.requiredDeltaVms)} m/s; lifetime ${fixed(metrics.achievableLifetimeMonths)} months; cost ${fixed(metrics.totalCostM)} / ${fixed(metrics.budgetCapM)} USD M; success probability ${percent(metrics.missionSuccessProbability, 1)}.`,
    `- Margins: dry mass ${percent(metrics.dryMassMarginFraction, 1)}; wet mass ${percent(metrics.wetMassMarginFraction, 1)}; power ${percent(metrics.powerMarginFraction, 1)}; energy ${percent(metrics.energyMarginFraction, 1)}; telecom ${fixed(metrics.linkMarginDb)} dB (requires ${fixed(metrics.requiredLinkMarginDb)} dB).`,
    `- Science factors: ${factorBreakdown(metrics.scienceScoreFactors)}.`,
    `- Criteria: threshold ${passed(entry.result.thresholdCriteria)}; baseline ${passed(entry.result.baselineCriteria)}.`,
  );
}

function factorBreakdown(factors: EvaluationResult["metrics"]["scienceScoreFactors"]): string {
  return `instrument value ${fixed(factors.instrumentValuePoints)}, tag fit ${fixed(factors.tagFitFraction)}, pointing ${fixed(factors.pointingFactorFraction)}, uptime ${fixed(factors.uptimeFraction)}, data returned ${fixed(factors.dataReturnedFraction)}, overlap ${fixed(factors.overlapWeightFraction)}; pre-uptime/data ${fixed(factors.preUptimeDataPoints)}`;
}

function describeDesign(design: MissionDesign): string {
  const instrumentNames = design.instruments.map(({ id, qty }) => `${id}×${qty}`).join(", ");
  const busNames = design.busComponents.map(({ id, qty }) => `${id}×${qty}`).join(", ");
  return `${design.orbitId} / ${design.launcherId}; instruments [${instrumentNames}]; bus [${busNames}]`;
}

function dominatedParts(): string[] {
  const dominated: string[] = [];
  for (const candidate of instruments) {
    if (instruments.some((other) => other.id !== candidate.id && dominatesInstrument(other, candidate))) {
      dominated.push(`${candidate.id} (instrument)`);
    }
  }
  for (const candidate of busComponents) {
    if (
      busComponents.some(
        (other) =>
          other.id !== candidate.id &&
          other.category === candidate.category &&
          dominatesBus(other, candidate),
      )
    ) {
      dominated.push(`${candidate.id} (bus)`);
    }

  }
  return dominated.sort();
}

function dominatedLaunchers(): string[] {
  return launchers
    .filter((candidate) =>
      launchers.some(
        (other) =>
          other.id !== candidate.id &&
          dominates(
            [
              other.costM,
              1 - other.reliabilityProbability,
              other.fixedOrbitRiskProbability,
              other.scheduleDelayRiskProbability,
            ],
            [
              candidate.costM,
              1 - candidate.reliabilityProbability,
              candidate.fixedOrbitRiskProbability,
              candidate.scheduleDelayRiskProbability,
            ],
            [
              ...Object.values(other.payloadKgByClass),
              other.fairingDiameterM,
              other.fairingHeightM,
            ],
            [
              ...Object.values(candidate.payloadKgByClass),
              candidate.fairingDiameterM,
              candidate.fairingHeightM,
            ],
          ),
      ),
    )
    .map(({ id }) => id);
}

function dominatesInstrument(first: Instrument, second: Instrument): boolean {
  if (
    first.scienceTags.join("|") !== second.scienceTags.join("|") ||
    first.compatibleBodies.join("|") !== second.compatibleBodies.join("|")
  ) {
    return false;
  }
  const firstBurden = [first.massKg, first.costM, first.powerW];
  const secondBurden = [second.massKg, second.costM, second.powerW];
  const firstBenefit = [
    first.scienceValuePoints,
    first.requiredPointingArcsec === 0 ? 0 : 1 / first.requiredPointingArcsec,
  ];
  const secondBenefit = [
    second.scienceValuePoints,
    second.requiredPointingArcsec === 0 ? 0 : 1 / second.requiredPointingArcsec,
  ];
  return dominates(firstBurden, secondBurden, firstBenefit, secondBenefit);
}

function dominatesBus(first: BusComponent, second: BusComponent): boolean {
  const firstBurden = [first.massKg, first.costM, first.powerW];
  const secondBurden = [second.massKg, second.costM, second.powerW];
  const firstBenefit = busBenefits(first);
  const secondBenefit = busBenefits(second);
  return dominates(firstBurden, secondBurden, firstBenefit, secondBenefit);
}

function busBenefits(part: BusComponent): number[] {
  const performance = part.performance;
  return [
    performance.solarAreaM2 ?? 0,
    performance.solarEfficiencyFraction ?? 0,
    performance.batteryCapacityWh ?? 0,
    performance.storageGB ?? 0,
    performance.downlinkMbps ?? 0,
    performance.antennaGainDb ?? 0,
    performance.baseLinkMarginDb ?? 0,
    performance.propellantKg ?? 0,
    performance.specificImpulseSec ?? 0,
    performance.radiationHardeningFraction ?? 0,
    performance.reliabilityProbability ?? 0,
    performance.pointingAccuracyArcsec === undefined
      ? 0
      : 1 / performance.pointingAccuracyArcsec,
  ];
}

function dominates(
  firstBurden: number[],
  secondBurden: number[],
  firstBenefit: number[],
  secondBenefit: number[],
): boolean {
  const noWorse =
    firstBurden.every((value, index) => value <= (secondBurden[index] ?? Infinity)) &&
    firstBenefit.every((value, index) => value >= (secondBenefit[index] ?? -Infinity));
  const strictlyBetter =
    firstBurden.some((value, index) => value < (secondBurden[index] ?? Infinity)) ||
    firstBenefit.some((value, index) => value > (secondBenefit[index] ?? -Infinity));
  return noWorse && strictlyBetter;
}

function passed(criteria: EvaluationResult["thresholdCriteria"]): string {
  return criteria.map((criterion) => `${criterion.id}=${criterion.passed ? "pass" : "fail"}`).join(", ");
}

function mostCommon(counts: Map<string, number>): string {
  const entry = [...counts].sort((left, right) => right[1] - left[1])[0];
  return entry ? `${entry[0]} (${entry[1]} designs)` : "none";
}

function countsTable(counts: Map<string, number>, ids: string[] = [...counts.keys()]): string {
  return ids
    .map((id) => [id, counts.get(id) ?? 0] as const)
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([id, count]) => `${id}: ${count}`)
    .join("; ") || "none";
}

function idsOrNone(
  items: readonly string[] | readonly (readonly [string, number])[],
): string {
  return (
    items
      .map((item) => (typeof item === "string" ? item : item[0]))
      .join(", ") || "none"
  );
}

function increment(counts: Map<string, number>, key: string, amount = 1): void {
  counts.set(key, (counts.get(key) ?? 0) + amount);
}

function percent(value: number, total: number): string {
  return `${total === 1 ? fixed(value * 100) : fixed((value / total) * 100)}%`;
}

function fixed(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "n/a";
}

function capitalize(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function replaceSection(document: string, heading: string, section: string): string {
  const headings = ["## Before tuning", "## After tuning"];
  const start = document.indexOf(heading);
  if (start >= 0) {
    const nextHeading = headings
      .filter((candidate) => candidate !== heading)
      .map((candidate) => document.indexOf(candidate, start + heading.length))
      .filter((index) => index >= 0)
      .sort((left, right) => left - right)[0];
    return `${document.slice(0, start)}${section}${nextHeading === undefined ? "" : `\n\n${document.slice(nextHeading)}`}`;
  }
  const separator = document.trim().length > 0 ? "\n\n" : "";
  return `${document}${separator}${section}`;
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
