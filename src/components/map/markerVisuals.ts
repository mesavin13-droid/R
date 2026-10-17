// Shared ROAD LIVE map marker visual.
// Match the category rail: graphite metallic teardrop, circular steel bezel,
// and a high-contrast category glyph. All event/station/question markers use it.
import { colors } from '../../theme/tokens';

// Eight original glossy icons from ROAD LIVE. Static sprite, 8 cells × 28 px,
// no remote image hosts or base64 JavaScript payloads. The pin tip is at y=34.
const SPRITE_URL = '/markers/roadlive-sprite.webp';
export const ROAD_PIN_WIDTH = 28;
export const ROAD_PIN_HEIGHT = 34;

export function roadMarkerIconIndex(type: string, subType: string): number | null {
  const sub = (subType || '').toLowerCase();
  if (type === 'accident') return 0; // red collision
  if (type === 'patrol') return /radar|camera|speed/.test(sub) ? 6 : 1;
  if (type === 'road') return /repair|work|construction/.test(sub) ? 2 :
    /traffic|jam|queue/.test(sub) ? 7 : /breakdown/.test(sub) ? 3 : 4;
  if (type === 'hazard') return /truck|broken|breakdown/.test(sub) ? 3 :
    /tow|evac/.test(sub) ? 5 : 4;
  if (type === 'assistance') return /tow|snow_mud/.test(sub) ? 5 :
    /wheel|battery/.test(sub) ? 3 : null; // ordinary SOS keeps its distinct lifebuoy
  if (type === 'traffic_light') return 4;
  if (type === 'crossing') return /large_queue/.test(sub) ? 7 : null;
  if (type === 'fuel') return /large/.test(sub) ? 7 : null;
  if (type === 'other') return /traffic|jam/.test(sub) ? 7 : 4;
  return null;
}

function glossyPin(index: number, confirmations: number, critical: boolean): string {
  const safeCount = Number.isFinite(confirmations) ? Math.max(0, Math.floor(confirmations)) : 0;
  // Image source is a bundled first-party asset; background-position indexes
  // the exact 8 source images without changing their category colors.
  return `<span aria-hidden="true" style="position:relative;display:block;width:28px;height:34px;cursor:pointer;
    background-image:url('${SPRITE_URL}');background-size:224px 34px;
    background-repeat:no-repeat;background-position:-${index * 28}px 0;
    filter:drop-shadow(0 3px 4px rgba(0,0,0,.42))">
    ${safeCount > 1 ? `<span style="position:absolute;top:-4px;right:-7px;
      min-width:15px;height:15px;padding:0 2px;border-radius:9px;
      background:${critical ? '#E53935' : '#172131'};border:1px solid #fff6;
      color:white;font:700 9px/13px system-ui;text-align:center">${safeCount > 99 ? '99+' : safeCount}</span>` : ''}
  </span>`;
}

export function getRoadLivePinSvg(
  type: string,
  subType: string,
  accentColor: string,
  confirmationCount: number = 0,
  isHighActivity: boolean = false,
  critical: boolean = false
): string {
  const spriteIndex = roadMarkerIconIndex(type, subType);
  if (spriteIndex !== null) return glossyPin(spriteIndex, confirmationCount, critical);

  // Glyphs are authored in a 24×24 coordinate space and placed in the centre
  // of the circular head (32,25), matching the category banner.
  const iconColor = '#EAF1FC';
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

  // Keep the pin dark for every category, exactly like the banner. Severity and
  // queue/availability status are encoded by the coloured steel ring, not by
  // turning the complete pin into a flat bright circle.
  const ringWidth = critical ? 3 : isHighActivity ? 2.6 : 1.8;
  const ringColor = accentColor || colors.info;
  const markerId = `rl-marker-${type}-${subType || 'default'}-${ringColor.replace('#', '')}`.replace(/[^a-z0-9_-]/gi, '-');

  const badgeCounter = confirmationCount > 1
    ? `<g transform="translate(43, 3)">
        <circle cx="7" cy="7" r="7.5" fill="#080D17" stroke="${ringColor}" stroke-width="1.6"/>
        <text x="7" y="10.5" text-anchor="middle" fill="#F4F7FF" font-size="8" font-weight="700" font-family="sans-serif">${confirmationCount > 99 ? '99+' : confirmationCount}</text>
      </g>`
    : '';

  const glow = isHighActivity
    ? `<circle cx="32" cy="25" r="22" fill="none" stroke="${ringColor}" stroke-width="1.5" opacity=".42"/>`
    : '';

  return `
    <div style="position:relative;display:flex;align-items:center;justify-content:center;width:28px;height:34px;cursor:pointer;filter:drop-shadow(0 3px 4px rgba(0,0,0,.42));">
      <svg width="28" height="34" viewBox="0 0 64 72" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <linearGradient id="${markerId}-housing" x1="8" y1="2" x2="54" y2="68" gradientUnits="userSpaceOnUse">
            <stop stop-color="#526681"/>
            <stop offset=".22" stop-color="#1A2639"/>
            <stop offset=".72" stop-color="#080D17"/>
            <stop offset="1" stop-color="#344A68"/>
          </linearGradient>
          <linearGradient id="${markerId}-rim" x1="11" y1="4" x2="51" y2="54" gradientUnits="userSpaceOnUse">
            <stop stop-color="${critical ? ringColor : '#B8CBE6'}"/>
            <stop offset=".45" stop-color="${ringColor}"/>
            <stop offset="1" stop-color="${critical ? ringColor : '#415675'}"/>
          </linearGradient>
          <linearGradient id="${markerId}-core" x1="13" y1="7" x2="49" y2="45" gradientUnits="userSpaceOnUse">
            <stop stop-color="#202F49"/>
            <stop offset="1" stop-color="#0C1421"/>
          </linearGradient>
        </defs>
        ${glow}
        <path d="M32 68S7 43 7 25a25 25 0 1 1 50 0C57 43 32 68 32 68Z"
          fill="url(#${markerId}-housing)" stroke="#70829C" stroke-width="1.2"/>
        <circle cx="32" cy="25" r="20" fill="url(#${markerId}-housing)"
          stroke="url(#${markerId}-rim)" stroke-width="${ringWidth}"/>
        <circle cx="32" cy="25" r="16.5" fill="url(#${markerId}-core)"
          stroke="${ringColor}" stroke-opacity=".62" stroke-width=".8"/>
        <path d="M19 12.5a18 18 0 0 1 23-1.2" fill="none"
          stroke="#F5F8FF" stroke-opacity=".52" stroke-width="1.1" stroke-linecap="round"/>
        <g transform="translate(20,13)">${iconContent}</g>
        ${badgeCounter}
      </svg>
    </div>
  `;
}
