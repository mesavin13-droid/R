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
  graphite: '#0b111e',
  graphite950: '#070c16',
  graphite900: '#101726',
  graphite925: '#16223b',
  surface800: '#131b2c',
  surface750: '#182135',
  surface700: '#1d2740',
  surface650: '#2b3757',
  surface600: '#25314f',
  surfaceBlue: '#11203a',

  /* Brand accent */
  accent: '#4fa8ff',
  accentStrong: '#3b8ef0',
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
  ink: '#eaf0fa',
  muted: '#93a1b8',
  faint: '#5a6b85',
  faintest: '#4c5a70',
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
