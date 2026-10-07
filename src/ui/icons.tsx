/** Small inline SVG icons so HUD values are icon + number, never color alone (brief §5 HUD). */
import type { JSX } from 'preact';

type P = { size?: number; class?: string; title?: string };

function Svg({ size = 16, children, title, class: cls }: P & { children: JSX.Element | JSX.Element[] }) {
  return (
    <svg
      class={`icon ${cls ?? ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export const IconHeart = (p: P) => (
  <Svg {...p}>
    <path
      fill="currentColor"
      d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.5 1.2 4.3 2.5.8-1.3 2.2-2.5 4.3-2.5 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"
    />
  </Svg>
);
export const IconBolt = (p: P) => (
  <Svg {...p}>
    <path fill="currentColor" d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
  </Svg>
);
export const IconFood = (p: P) => (
  <Svg {...p}>
    <path
      fill="currentColor"
      d="M7 2h2v7a2 2 0 0 1-1 1.7V22H6V10.7A2 2 0 0 1 5 9V2h2v6h0V2zm3 0h1v7h-1zM15 2c2.2 0 4 2.7 4 6 0 2.4-.9 4.4-2.2 5.4V22h-2V2z"
    />
  </Svg>
);
export const IconDrop = (p: P) => (
  <Svg {...p}>
    <path fill="currentColor" d="M12 2s7 7.6 7 12.5A7 7 0 0 1 5 14.5C5 9.6 12 2 12 2z" />
  </Svg>
);
export const IconSun = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4.5" fill="currentColor" />
    <path
      stroke="currentColor"
      stroke-width="2"
      d="M12 1v3M12 20v3M1 12h3M20 12h3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"
    />
  </Svg>
);
export const IconMoon = (p: P) => (
  <Svg {...p}>
    <path fill="currentColor" d="M20 15.5A8.5 8.5 0 0 1 8.5 4a8.5 8.5 0 1 0 11.5 11.5z" />
  </Svg>
);
export const IconEar = (p: P) => (
  <Svg {...p}>
    <path
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      d="M7 9a5 5 0 0 1 10 0c0 3-3 4-3 7a3 3 0 0 1-5 2M10 9a2 2 0 0 1 4 0"
    />
  </Svg>
);
export const IconTarget = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2" />
    <circle cx="12" cy="12" r="2.5" fill="currentColor" />
  </Svg>
);
export const IconWeight = (p: P) => (
  <Svg {...p}>
    <path fill="currentColor" d="M9 5a3 3 0 1 1 6 0h3l3 15H3L6 5z" />
  </Svg>
);
export const IconBlood = (p: P) => (
  <Svg {...p}>
    <path fill="currentColor" d="M12 3s5 5.5 5 9a5 5 0 0 1-10 0c0-3.5 5-9 5-9zM6 17l-2 4h3zM18 17l2 4h-3z" />
  </Svg>
);
export const IconBio = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" fill="currentColor" />
    <circle cx="12" cy="5" r="3" fill="none" stroke="currentColor" stroke-width="2" />
    <circle cx="5.5" cy="16" r="3" fill="none" stroke="currentColor" stroke-width="2" />
    <circle cx="18.5" cy="16" r="3" fill="none" stroke="currentColor" stroke-width="2" />
  </Svg>
);
export const IconStomach = (p: P) => (
  <Svg {...p}>
    <path
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      d="M9 3v4c0 2-3 3-3 7a6 6 0 0 0 11 3c1-2 0-5-3-5s-3-3-3-5V3"
    />
  </Svg>
);
export const IconPlus = (p: P) => (
  <Svg {...p}>
    <path fill="currentColor" d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z" />
  </Svg>
);
export const IconFlashlight = (p: P) => (
  <Svg {...p}>
    <path fill="currentColor" d="M3 9h9l6-4v14l-6-4H3z" />
  </Svg>
);
export const IconCrouch = (p: P) => (
  <Svg {...p}>
    <circle cx="14" cy="5" r="2.5" fill="currentColor" />
    <path fill="currentColor" d="M8 21l2-6 3-2-2-3 4-1 3 4-3 1 1 7h-2l-1-5-2 2-1 3z" />
  </Svg>
);
