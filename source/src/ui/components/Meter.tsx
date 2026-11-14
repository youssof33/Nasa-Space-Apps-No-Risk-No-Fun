export type MeterTone = "ok" | "warning" | "fail" | "neutral";

interface Props {
  label: string;
  value: string;
  fraction: number;
  tone: MeterTone;
  hint?: string;
}

export function Meter({ label, value, fraction, tone, hint }: Props) {
  const width = Math.min(1, Math.max(0, fraction)) * 100;
  return (
    <div class={`meter meter--${tone}`} title={hint}>
      <div class="meter__row">
        <span class="meter__label">{label}</span>
        <span class="meter__value">{value}</span>
      </div>
      <div class="meter__track">
        <span class="meter__fill" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}
