import type { JSX } from "preact";

export type IconName =
  | "arrow-right"
  | "arrow-left"
  | "close"
  | "settings"
  | "check"
  | "clock"
  | "database"
  | "globe"
  | "target"
  | "warning"
  | "orbit"
  | "structure"
  | "solar"
  | "battery"
  | "computer"
  | "adcs"
  | "antenna"
  | "recorder"
  | "propulsion"
  | "payload"
  | "rocket"
  | "sliders"
  | "plus"
  | "trash"
  | "drag"
  | "copy"
  | "users"
  | "chevron-down";

const shapes: Record<IconName, JSX.Element> = {
  "arrow-right": <path d="M4 12h15m-5-5 5 5-5 5" />,
  "arrow-left": <path d="M20 12H5m5-5-5 5 5 5" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  settings: (
    <>
      <path d="M4 7h9M19 7h1M4 17h3M13 17h7" />
      <circle cx="16" cy="7" r="2.2" />
      <circle cx="10" cy="17" r="2.2" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="6" rx="7.5" ry="3" />
      <path d="M4.5 6v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6M4.5 12v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.2 3.6 8.5S14.4 18.2 12 20.5C9.6 18.2 8.4 15.3 8.4 12S9.6 5.8 12 3.5Z" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  warning: (
    <>
      <path d="M12 4 21 20H3L12 4Z" />
      <path d="M12 9.5V14M12 17.2v.1" />
    </>
  ),
  orbit: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <ellipse cx="12" cy="12" rx="9" ry="4.2" transform="rotate(-24 12 12)" />
      <circle cx="19.4" cy="6.6" r="1.1" />
    </>
  ),
  structure: (
    <>
      <path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5Z" />
      <path d="M4 8.5 12 13l8-4.5M12 13v7" />
    </>
  ),
  solar: (
    <>
      <path d="M4 6h9v6H4zM13 6h7v6h-7zM6 12v6M18 12v6M9 18h6" />
    </>
  ),
  battery: (
    <>
      <rect x="3.5" y="8" width="15" height="8" rx="1.6" />
      <path d="M21 10.5v3M7 11v2M10.5 10.4 9 12.6h2.6L10 14.8" />
    </>
  ),
  computer: (
    <>
      <rect x="5" y="5" width="14" height="11" rx="1.6" />
      <path d="M9 9h6M9 12h4M8 19h8M12 16v3" />
    </>
  ),
  adcs: (
    <>
      <circle cx="12" cy="12" r="2.2" />
      <path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3" />
      <path d="M6.4 6.4l2 2M15.6 15.6l2 2M17.6 6.4l-2 2M8.4 15.6l-2 2" />
    </>
  ),
  antenna: (
    <>
      <path d="M12 13v7M8.5 20h7" />
      <path d="M5.8 9.2a7 7 0 0 1 12.4 0" />
      <path d="M8.4 11.4a4 4 0 0 1 7.2 0" />
      <circle cx="12" cy="13" r="1" />
    </>
  ),
  recorder: (
    <>
      <rect x="5" y="6" width="14" height="4" rx="1" />
      <rect x="5" y="11" width="14" height="4" rx="1" />
      <rect x="5" y="16" width="14" height="3" rx="1" />
      <path d="M8 8h.01M8 13h.01" />
    </>
  ),
  propulsion: (
    <>
      <path d="M8 5h8v7l-2 2H10l-2-2Z" />
      <path d="M9.5 14c-.6 2.2-1.2 3.6-2.5 5 2.2-.3 3.8-1 5-2.2 1.2 1.2 2.8 1.9 5 2.2-1.3-1.4-1.9-2.8-2.5-5" />
    </>
  ),
  payload: (
    <>
      <path d="m12 3 7 4v9l-7 5-7-5V7Z" />
      <path d="M12 8v5M9.5 10.5h5" />
    </>
  ),
  rocket: (
    <>
      <path d="M9 15c-2.4-1-3.5-3-3.5-5.5C5.5 6 9 4 12 4s6.5 2 6.5 5.5C18.5 12 17.4 14 15 15" />
      <path d="M9 15l3 5 3-5M10 9.5h4" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h9M17 17h3" />
      <circle cx="15" cy="7" r="1.8" />
      <circle cx="9" cy="12" r="1.8" />
      <circle cx="15" cy="17" r="1.8" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  trash: (
    <>
      <path d="M4.5 7h15M10 4h4M6.5 7l1 13h9l1-13" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  drag: (
    <>
      <circle cx="9" cy="6" r="1.2" />
      <circle cx="15" cy="6" r="1.2" />
      <circle cx="9" cy="12" r="1.2" />
      <circle cx="15" cy="12" r="1.2" />
      <circle cx="9" cy="18" r="1.2" />
      <circle cx="15" cy="18" r="1.2" />
    </>
  ),
  "chevron-down": <path d="m6 9 6 6 6-6" />,
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 6.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v8.5A1.5 1.5 0 0 0 5 15h1.5" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3.5 20c0-3.2 2.5-5.4 5.5-5.4s5.5 2.2 5.5 5.4" />
      <path d="M16 5.6a3.2 3.2 0 0 1 0 6M17.2 14.9c2.1.5 3.4 2.3 3.4 4.6" />
    </>
  ),
};

interface Props {
  name: IconName;
  size?: number;
  class?: string;
}

export function Icon({ name, size = 18, class: className }: Props) {
  return (
    <svg
      class={`icon${className ? ` ${className}` : ""}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {shapes[name]}
    </svg>
  );
}
