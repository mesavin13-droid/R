/**
 * ROADLIVE design tokens (runtime mirror of the CSS `@theme` block in index.css).
 *
 * Use these for colours that must live in JS — Leaflet/Yandex markers, SVG
 * gradients, dynamic category chips — where a Tailwind class cannot reach.
 * Keep the values in sync with `--color-*` in index.css; that block stays the
 * single source of truth for anything expressible as a class, and this module
 * mirrors it for the imperative/canvas cases only.
 */
export const colors = {
  /* Surfaces */
  graphite: '#111315',
  graphite950: '#0b111e',
  graphite900: '#14171b',
  graphite925: '#1c2433',
  surface800: '#181b1f',
  surface750: '#1e232b',
  surface700: '#20242a',
  surface650: '#282e36',
  surface600: '#282d35',
  surfaceBlue: '#151d2a',

  /* Brand accent */
  accent: '#4b8dff',
  accentStrong: '#3c7ae6',
  accentDeep: '#2a5bd7',

  /* Categorical */
  info: '#38bdf8',
  info2: '#30b0c7',
  telegram: '#24a1de',
  roadBlue: '#60a5fa',
  purple: '#af52de',
  purple2: '#c084fc',

  /* Status */
  success: '#34c759',
  successBright: '#30d158',
  warning: '#e5a93c',
  warningStrong: '#ff9f0a',
  amber: '#ffd60a',
  danger: '#ff453a',
  dangerStrong: '#e03126',
  dangerSoft: '#ff8a80',

  /* Text */
  ink: '#f0f2f5',
  muted: '#9aa0a8',
  faint: '#5f656d',
  faintest: '#555a60',
} as const;

/** Map-event category palette, keyed by the ids used across TopHeader & RoadMap. */
export const categoryColors: Record<string, string> = {
  all: colors.info,
  assistance: colors.danger,
  crossing: colors.warningStrong,
  accident: colors.danger,
  patrol: colors.info2,
  fuel: colors.purple,
  road: colors.roadBlue,
  traffic_light: colors.amber,
  question: colors.purple2,
};
