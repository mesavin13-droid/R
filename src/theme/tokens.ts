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
  /* Surfaces — deep blue-graphite base */
  graphite: '#10151d',
  graphite950: '#0b1118',
  graphite900: '#121a24',
  graphite925: '#16223b',
  surface800: '#19222d',
  surface750: '#1d2732',
  surface700: '#222e3b',
  surface650: '#2b3757',
  surface600: '#30404e',
  surfaceBlue: '#11203a',

  /* Brand accent */
  accent: '#83b3ff',
  accentStrong: '#669be8',
  accentDeep: '#2563eb',

  /* Categorical */
  info: '#38bdf8',
  info2: '#30b0c7',
  telegram: '#2a9fe0',
  roadBlue: '#60a5fa',
  purple: '#af52de',
  purple2: '#c084fc',

  /* Status */
  success: '#32d17d',
  successBright: '#30d158',
  warning: '#e5a93c',
  warningStrong: '#ff9f0a',
  amber: '#ffd60a',
  danger: '#ff4d55',
  dangerStrong: '#e03126',
  dangerSoft: '#ff8a80',

  /* Text */
  ink: '#eef3f8',
  muted: '#a1aeba',
  faint: '#7d8d9e',
  faintest: '#6d7f90',
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
