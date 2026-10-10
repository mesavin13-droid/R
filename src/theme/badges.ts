/**
 * ROADLIVE driver badges & trust score.
 *
 * Badges are earned from real activity (helpfulConfirmationsCount, eventsCount,
 * answersCount, rating) and rendered in the profile. They give a driver a
 * visible identity — like the 💚 "helped other drivers" signal on gdebenz.ru.
 * Colours come from the shared design tokens so they stay on-palette.
 */

export interface BadgeDefinition {
  id: string;
  icon: string;
  title: string;
  description: string;
  /** Token name from src/theme/tokens.ts — drives the badge accent colour. */
  tone: 'success' | 'accent' | 'warning' | 'purple' | 'info' | 'danger';
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  { id: 'first_help',   icon: '🤝', title: 'Первый помощник',   description: 'Отметил помощь на дороге',            tone: 'success' },
  { id: 'helper',       icon: '💚', title: 'Взаимовыручка',     description: '5+ подтверждений помощи',             tone: 'success' },
  { id: 'guardian',     icon: '🛡️', title: 'Страж трассы',      description: '25+ подтверждений помощи',            tone: 'info' },
  { id: 'reporter',     icon: '📍', title: 'Наблюдатель',       description: '10+ отметок на карте',                tone: 'accent' },
  { id: 'answerer',     icon: '💬', title: 'Советчик',          description: '10+ ответов водителям',               tone: 'purple' },
  { id: 'trusted',      icon: '⭐', title: 'Проверенный',       description: 'Рейтинг 4.5 и выше',                  tone: 'warning' },
  { id: 'expert',       icon: '🏆', title: 'Эксперт района',    description: 'Рейтинг 4.8 и 50+ подтверждений',     tone: 'danger' },
];

export interface EarnedBadge {
  definition: BadgeDefinition;
  earned: boolean;
  /** Progress toward the badge, 0..1 — used for the "almost there" hint. */
  progress: number;
}

export interface TrustProfile {
  /** 0..100 — how much the community can rely on this driver. */
  score: number;
  label: string;
  tone: 'success' | 'accent' | 'warning' | 'danger';
}

/**
 * Derive earned badges from real profile stats. Deterministic and cheap, so it
 * can be called on every render without memoisation.
 */
export function computeBadges(user: {
  helpfulConfirmationsCount: number;
  eventsCount: number;
  answersCount: number;
  rating: number;
}): EarnedBadge[] {
  const help = user.helpfulConfirmationsCount || 0;
  const events = user.eventsCount || 0;
  const answers = user.answersCount || 0;
  const rating = user.rating || 0;

  const rules: Record<string, { earned: boolean; progress: number }> = {
    first_help: { earned: help >= 1,  progress: clamp01(help / 1) },
    helper:     { earned: help >= 5,  progress: clamp01(help / 5) },
    guardian:   { earned: help >= 25, progress: clamp01(help / 25) },
    reporter:   { earned: events >= 10, progress: clamp01(events / 10) },
    answerer:   { earned: answers >= 10, progress: clamp01(answers / 10) },
    trusted:    { earned: rating >= 4.5, progress: clamp01(rating / 4.5) },
    expert:     { earned: rating >= 4.8 && help >= 50, progress: clamp01(Math.min(rating / 4.8, help / 50)) },
  };

  return BADGE_DEFINITIONS.map((definition) => ({
    definition,
    earned: rules[definition.id].earned,
    progress: rules[definition.id].progress,
  }));
}

/**
 * A transparent trust score (0..100) so a driver knows how reliable they look
 * to others. Weighted: help given matters most, then rating, then volume.
 */
export function computeTrust(user: {
  helpfulConfirmationsCount: number;
  eventsCount: number;
  answersCount: number;
  rating: number;
}): TrustProfile {
  const help = user.helpfulConfirmationsCount || 0;
  const events = user.eventsCount || 0;
  const answers = user.answersCount || 0;
  const rating = user.rating || 0;

  const helpPts = clamp01(help / 50) * 50;        // up to 50
  const ratingPts = clamp01((rating - 3) / 2) * 30; // 3.0 → 0, 5.0 → 30
  const volumePts = clamp01((events + answers) / 40) * 20; // up to 20
  const score = Math.round(helpPts + ratingPts + volumePts);

  if (score >= 75) return { score, label: 'Высокое доверие', tone: 'success' };
  if (score >= 45) return { score, label: 'Доверенный водитель', tone: 'accent' };
  if ( score >= 20) return { score, label: 'Пока набирает', tone: 'warning' };
  return { score, label: 'Новый участник', tone: 'danger' };
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
