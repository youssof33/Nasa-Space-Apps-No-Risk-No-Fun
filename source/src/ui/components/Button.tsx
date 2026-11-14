import type { ComponentChildren, JSX } from "preact";

interface Props extends Omit<JSX.IntrinsicElements["button"], "size"> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "md" | "lg";
  children?: ComponentChildren;
}

export function Button({
  variant = "secondary",
  size = "md",
  class: className,
  children,
  ...rest
}: Props) {
  return (
    <button
      class={`btn btn--${variant} btn--${size}${className ? ` ${className}` : ""}`}
      {...rest}
    >
      {children}
    </button>
  );
}
