import type { ComponentChildren } from "preact";

export type ChipTone = "neutral" | "nominal" | "warning" | "critical" | "info" | "accent";

interface Props {
  tone?: ChipTone;
  children: ComponentChildren;
  class?: string;
}

export function Chip({ tone = "neutral", children, class: className }: Props) {
  return (
    <span class={`chip chip--${tone}${className ? ` ${className}` : ""}`}>{children}</span>
  );
}
