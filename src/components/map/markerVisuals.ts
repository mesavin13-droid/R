// Helper module to generate RoadLive signature map pins.
//
// Two marker styles, chosen by how urgent the event is:
//   * critical → a solid colour teardrop (variant "A"): the whole pin takes the
//     event colour with a white icon, so danger reads instantly from afar.
//   * normal   → a graphite teardrop with a coloured icon inside (variant "B"):
//     calm on the map, colour carried by the glyph only.
// Both keep the graphite/blue identity and share the confirmation-count badge.

import { colors } from '../../theme/tokens';

export function getRoadLivePinSvg(
  type: string,
  subType: string,
  accentColor: string,
  confirmationCount: number = 0,
  isHighActivity: boolean = false,
  critical: boolean = false
): string {
  // Style "A" (critical): solid coloured pin with a white glyph. The colour IS
  // the message, so it reads at a glance. A graphite stroke keeps depth.
  // Style "B" (normal): graphite pin, colour carried by the icon glyph only.
  // Declared up-front so the icon builder below can reference `iconColor`.
  const iconColor = critical ? colors.ink : accentColor;

  // Select vector SVG path based on event type
  let iconContent = '';

  if (type === 'accident') {
    // Car Collision / Crash Icon
    iconContent = `
      <path d="M12 4L3 19h18L12 4zm0 3.5l6.5 10.5h-13L12 7.5zM11 10h2v4h-2v-4zm0 5h2v2h-2v-2z" fill="${iconColor}"/>
    `;
  } else if (type === 'patrol') {
    // Police Officer Cap / Badge
    iconContent = `
      <path d="M12 4a8 8 0 00-8 8v1h16v-1a8 8 0 00-8-8zm-6 7a6 6 0 0112 0H6zm-3 3v2a1 1 0 001 1h16a1 1 0 001-1v-2H3zm9 4a2 2 0 100 4 2 2 0 000-4z" fill="${iconColor}"/>
    `;
  } else if (type === 'fuel') {
    // Fuel Pump
    iconContent = `
      <path d="M6 3a2 2 0 00-2 2v13a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2H6zm2 3h4v3H8V6zm10 1a1 1 0 011 1v5a1.5 1.5 0 003 0V9a1 1 0 10-2 0v4a.5.5 0 01-1 0V8a1 1 0 00-1-1z" fill="${iconColor}"/>
    `;
  } else if (type === 'road_work') {
    // Construction Barrier
    iconContent = `
      <path d="M3 6a1 1 0 011-1h16a1 1 0 110 2H4a1 1 0 01-1-1zm2 3h14v2H5V9zm0 4h14v2H5v-2zm-2 5a1 1 0 011-1h16a1 1 0 110 2H4a1 1 0 01-1-1z" fill="${iconColor}"/>
    `;
  } else if (type === 'traffic_light') {
    // Traffic Light
    iconContent = `
      <path d="M8 3a2 2 0 00-2 2v14a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2H8zm4 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm0 5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm0 5a1.5 1.5 0 110 3 1.5 1.5 0 010-3z" fill="${iconColor}"/>
    `;
  } else if (type === 'hazard') {
    // Hazard Warning Triangle
    iconContent = `
      <path d="M12 3L2 20h20L12 3zm0 4l6.5 11h-13L12 7zm-1 3v4h2v-4h-2zm0 5v2h2v-2h-2z" fill="${iconColor}"/>
    `;
  } else if (type === 'assistance') {
    // SOS / Help Lifebuoy Cross
    iconContent = `
      <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm-1 5h2v4h4v2h-4v4h-2v-4H7v-2h4V7z" fill="${iconColor}"/>
    `;
  } else if (type === 'station') {
    // Station Fuel
    iconContent = `
      <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V4zm2 2v3h6V6H7zm9 2a1 1 0 011 1v4a1 1 0 002 0V9a2 2 0 10-4 0v3a1 1 0 01-1 1" fill="${iconColor}"/>
    `;
  } else if (type === 'question') {
    // Question Mark
    iconContent = `
      <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 15a1.25 1.25 0 110 2.5 1.25 1.25 0 010-2.5zm1.5-5.5a1.5 1.5 0 00-1.5-1.5A1.5 1.5 0 0110.5 8.5 3.5 3.5 0 0114 12c0 1.25-.8 2-1.5 2.5-.5.35-1 .85-1 1.5h-1c0-1.25.8-2 1.5-2.5.5-.35 1-.85 1-1.5z" fill="${iconColor}"/>
    `;
  } else {
    // Default Road Lane
    iconContent = `
      <path d="M6 3l-2 18h3l1.5-18H6zm6 0v3h-1v3h1v3h-1v3h1v3h-1v3h1.5V3H12zm6 0l-1.5 18h3L21 3h-3z" fill="${iconColor}"/>
    `;
  }

  const ringGlow = isHighActivity
    ? `<circle cx="22" cy="22" r="21" fill="none" stroke="${colors.info}" stroke-width="2.5" class="animate-pulse" filter="drop-shadow(0 0 8px ${colors.info})"/>`
    : '';

  const badgeCounter =
    confirmationCount > 1
      ? `<g transform="translate(28, 2)">
          <circle cx="7" cy="7" r="7" fill="${colors.ink}" stroke="${accentColor}" stroke-width="1.5"/>
          <text x="7" y="10.5" text-anchor="middle" fill="${colors.graphite}" font-size="9" font-weight="bold" font-family="sans-serif">${confirmationCount}</text>
        </g>`
      : '';

  // Style "A" (critical): solid coloured pin; "B" (normal): graphite pin.
  // `iconColor` is already computed at the top of the function.
  const pinFill = critical ? accentColor : colors.graphite950;
  const pinFillOpacity = critical ? '1' : '0.9';
  const pinStroke = critical ? colors.ink : accentColor;
  const innerFill = critical ? 'none' : colors.surfaceBlue;

  return `
    <div class="relative flex items-center justify-center w-11 h-11 cursor-pointer transition-transform duration-200 hover:scale-110 active:scale-95">
      <svg width="44" height="44" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg" class="drop-shadow-[0_8px_20px_rgba(0,0,0,0.8)]">
        <!-- High Activity Glowing Halo Ring -->
        ${ringGlow}

        <!-- Teardrop Pin Outer Contour -->
        <path d="M22 3C12.611 3 5 10.611 5 20c0 12.5 17 21 17 21s17-8.5 17-21C39 10.611 31.389 3 22 3z"
              fill="${pinFill}"
              fill-opacity="${pinFillOpacity}"
              stroke="${pinStroke}"
              stroke-width="2"
              stroke-linecap="round"/>

        <!-- Inner Highlight Circle (only for graphite style B) -->
        ${critical ? '' : `<circle cx="22" cy="19" r="13" fill="${innerFill}" fill-opacity="0.75" stroke="${accentColor}" stroke-opacity="0.4" stroke-width="1"/>`}

        <!-- Vector Icon Centered -->
        <g transform="translate(10, 7)">
          ${iconContent}
        </g>
      </svg>
      ${badgeCounter}
    </div>
  `;
}
