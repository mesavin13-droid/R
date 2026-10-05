// Pure Brand Logo / Icon Badge in 2GIS Map Style (Clean without building)

export const get3DAdSvg = (
  id: string,
  icon: string,
  accentColor: string = '#4B8DFF',
  customLogoUrl?: string
): string => {
  const clipId = `logo-clip-${id.replace(/[^a-zA-Z0-9]/g, '_')}`;

  const isImageLogo = Boolean(
    customLogoUrl || icon.startsWith('data:image') || icon.startsWith('http') || icon.startsWith('/')
  );
  const logoSrc = customLogoUrl || icon;

  return `
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="${clipId}">
          <circle cx="24" cy="24" r="17" />
        </clipPath>
        <radialGradient id="grad-${clipId}" cx="0.5" cy="0.3" r="0.7">
          <stop offset="0%" stop-color="#20252D" stop-opacity="0.55" />
          <stop offset="100%" stop-color="#111315" stop-opacity="0.65" />
        </radialGradient>
      </defs>

      <!-- Soft map drop shadow -->
      <circle cx="24" cy="25.5" r="21" fill="black" fill-opacity="0.3" filter="blur(2.5px)" />

      <!-- Outer accent glow ring -->
      <circle cx="24" cy="24" r="20" fill="${accentColor}" fill-opacity="0.2" stroke="${accentColor}" stroke-width="1.5" stroke-opacity="0.95" />

      <!-- Inner semi-transparent graphite background disc -->
      <circle cx="24" cy="24" r="18" fill="url(#grad-${clipId})" stroke="white" stroke-opacity="0.25" stroke-width="1" />

      <!-- Brand Logo / Custom Image or Clean Center Icon -->
      ${
        isImageLogo
          ? `<image href="${logoSrc}" x="7" y="7" width="34" height="34" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})" />`
          : `<text x="24" y="29.5" font-size="20" text-anchor="middle" fill="white" font-family="system-ui, -apple-system">${icon}</text>`
      }
    </svg>
  `;
};
