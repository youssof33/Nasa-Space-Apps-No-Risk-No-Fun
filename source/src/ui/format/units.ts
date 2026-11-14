export function formatBudget(millions: number): string {
  return `$${millions.toFixed(millions % 1 === 0 ? 0 : 1)}M`;
}

export function formatMass(kilograms: number): string {
  if (!Number.isFinite(kilograms)) return "—";
  return kilograms >= 100 ? `${Math.round(kilograms)} kg` : `${kilograms.toFixed(1)} kg`;
}
