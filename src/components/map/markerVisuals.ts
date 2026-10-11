// ROAD LIVE map markers — compact circular tokens inspired by the supplied marker board.
// Dark steel housing keeps markers legible on both light and dark map tiles;
// the rim communicates event state and the icon remains high-contrast.
import { colors } from '../../theme/tokens';

export function getRoadLivePinSvg(
  type: string,
  subType: string,
  accentColor: string,
  confirmationCount: number = 0,
  isHighActivity: boolean = false,
  critical: boolean = false
): string {
  const iconColor = colors.ink;
  let iconContent = '';

  if (type === 'crossing' || type === 'road_work') {
    iconContent = `
      <g stroke="${iconColor}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <path d="M4 8h16v7H4z"/><path d="M7 8l5 7M14 8l5 7"/>
        <path d="M6 15v5M18 15v5M4 20h16"/>
      </g>`;
  } else if (type === 'accident') {
    iconContent = `
      <g stroke="${iconColor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <path d="M3.5 14 5 10h6l2 4v4H3.5zM5.5 18v2M11 18v2"/>
        <path d="M13 11h5l2.5 3.5V18H13zM15 18v2M19 18v2"/>
        <path d="m14 4 1.5 2.5L18 5M18 8l2 1"/>
      </g>`;
  } else if (type === 'patrol') {
    iconContent = `
      <g stroke="${iconColor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <path d="M4 11.5 12 6l8 5.5-1.3 2H5.3z"/>
        <path d="M6 14.5c.5 3 2.5 4.5 6 4.5s5.5-1.5 6-4.5"/>
        <path d="M9 10.5h6M11 15h2"/>
      </g>
      <path d="M10 7.5 12 5l2 2.5" stroke="${accentColor}" stroke-width="1.7" fill="none" stroke-linecap="round"/>`;
  } else if (type === 'fuel' || type === 'station') {
    iconContent = `
      <g stroke="${iconColor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <path d="M5 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16z"/>
        <path d="M8 6h5v5H8zM16 8h2l2 2v6a1.5 1.5 0 0 0 3 0v-5"/>
        <path d="M3 21h14"/>
      </g>`;
  } else if (type === 'traffic_light') {
    iconContent = `
      <rect x="6" y="2.5" width="12" height="19" rx="3" fill="#0A101B" stroke="${iconColor}" stroke-width="1.4"/>
      <circle cx="12" cy="7" r="2.1" fill="#FF5661" stroke="#FF9AA0" stroke-width=".5"/>
      <circle cx="12" cy="12" r="2.1" fill="#FFC34D" stroke="#FFE2A1" stroke-width=".5"/>
      <circle cx="12" cy="17" r="2.1" fill="#39D98A" stroke="#A0F5C7" stroke-width=".5"/>`;
  } else if (type === 'road') {
    iconContent = `
      <g stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <path d="M7 3 4 21M17 3l3 18"/><path d="M12 4v3M12 10v3M12 16v3"/>
      </g>`;
  } else if (type === 'hazard') {
    iconContent = `
      <g stroke="${iconColor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <path d="M2.5 6h12v11h-12zM14.5 10h4l3 3v4h-7z"/>
        <circle cx="7" cy="19" r="2"/><circle cx="18" cy="19" r="2"/>
        <path d="M4.5 9h8M4.5 12h5"/>
      </g>`;
  } else if (type === 'assistance') {
    iconContent = `
      <g stroke="${iconColor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/>
        <path d="m6 6 3 3M15 15l3 3M18 6l-3 3M9 15l-3 3"/>
      </g>`;
  } else {
    iconContent = `
      <g stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <circle cx="12" cy="12" r="9"/>
        <path d="M9.5 9a2.6 2.6 0 1 1 4.4 1.9c-1.1 1-1.9 1.4-1.9 3"/>
        <path d="M12 17.5h.01"/>
      </g>`;
  }

  const ringGlow = isHighActivity
    ? `<circle cx="22" cy="22" r="21" fill="none" stroke="${accentColor}" stroke-width="2.3" opacity=".9" class="animate-pulse" filter="drop-shadow(0 0 5px ${accentColor})"/>`
    : '';
  const badgeCounter = confirmationCount > 1
    ? `<g transform="translate(28, 2)">
        <circle cx="7" cy="7" r="7.2" fill="#080D17" stroke="${accentColor}" stroke-width="1.5"/>
        <text x="7" y="10.4" text-anchor="middle" fill="#F4F7FF" font-size="8" font-weight="700" font-family="sans-serif">${confirmationCount > 99 ? '99+' : confirmationCount}</text>
      </g>`
    : '';
  const rimWidth = critical ? 3 : 1.8;
  const innerStrokeOpacity = critical ? '.95' : '.58';
  const centerFill = critical ? '#191D2A' : '#101827';
  // Every marker carries its own SVG ids so simultaneous pins with different
  // status colours cannot accidentally share another marker's gradient.
  const markerId = `rl-pin-${type}-${subType || 'default'}-${accentColor.replace('#', '')}-${critical ? 'critical' : 'normal'}`.replace(/[^a-z0-9_-]/gi, '-');

  return `
    <div class="relative flex items-center justify-center w-11 h-11 cursor-pointer transition-transform duration-200 hover:scale-110 active:scale-95">
      <svg width="44" height="44" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg" class="drop-shadow-[0_5px_12px_rgba(0,0,0,0.65)]">
        <defs>
          <linearGradient id="${markerId}-housing" x1="8" y1="3" x2="37" y2="42" gradientUnits="userSpaceOnUse">
            <stop stop-color="#536783"/><stop offset=".24" stop-color="#1A2639"/>
            <stop offset=".72" stop-color="#080D17"/><stop offset="1" stop-color="#3D506A"/>
          </linearGradient>
          <linearGradient id="${markerId}-core" x1="12" y1="7" x2="33" y2="34" gradientUnits="userSpaceOnUse">
            <stop stop-color="#202F49"/><stop offset="1" stop-color="${centerFill}"/>
          </linearGradient>
          <linearGradient id="${markerId}-rim" x1="7" y1="3" x2="36" y2="40" gradientUnits="userSpaceOnUse">
            <stop stop-color="${critical ? accentColor : '#AFC4E4'}"/>
            <stop offset=".45" stop-color="${accentColor}"/>
            <stop offset="1" stop-color="${critical ? accentColor : '#415675'}"/>
          </linearGradient>
        </defs>
        ${ringGlow}
        <circle cx="22" cy="22" r="19.3" fill="url(#${markerId}-housing)" stroke="#7587A2" stroke-width="1.1"/>
        <circle cx="22" cy="22" r="16.2" fill="url(#${markerId}-core)" stroke="url(#${markerId}-rim)" stroke-width="${rimWidth}"/>
        <circle cx="22" cy="22" r="13.5" stroke="${accentColor}" stroke-opacity="${innerStrokeOpacity}" stroke-width=".8"/>
        <path d="M12 13.5a13.5 13.5 0 0 1 19-2" stroke="#F6FAFF" stroke-opacity=".4" stroke-width="1.2" stroke-linecap="round"/>
        <g transform="translate(10, 10)">${iconContent}</g>
        ${badgeCounter}
      </svg>
    </div>
  `;
}
