import { colors } from '../../theme/tokens';
import React, { useState, useEffect, useRef } from 'react';
import { SponsoredBanner } from '../../types';
import { AdService } from '../../services/adService';
import { get3DAdSvg } from './adVisuals';

interface FloatingMapAdStickerProps {
  banners: SponsoredBanner[];
  onCloseBanner: (bannerId: string) => void;
  onSelectBanner: (banner: SponsoredBanner) => void;
}

export const FloatingMapAdSticker: React.FC<FloatingMapAdStickerProps> = ({
  banners,
  onCloseBanner,
  onSelectBanner,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const [isHovered, setIsHovered] = useState(false);

  const config = AdService.getConfig();
  const autoDismissSec = config.autoDismissSeconds || 30;
  const intervalSec = config.intervalSeconds || 900; // Default 15 mins (900s)

  const [timeLeft, setTimeLeft] = useState(autoDismissSec);
  const reappearTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-dismiss 30s timer logic when ad becomes visible
  useEffect(() => {
    let countdownInterval: NodeJS.Timeout | null = null;

    if (isVisible && !isHovered) {
      setTimeLeft(autoDismissSec);

      countdownInterval = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            // Auto dismiss reached 0s -> Hide banner & schedule next show in 15 mins
            handleAutoDismiss();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (countdownInterval) clearInterval(countdownInterval);
    };
  }, [isVisible, isHovered, currentIndex, autoDismissSec]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (reappearTimerRef.current) clearTimeout(reappearTimerRef.current);
    };
  }, []);

  const handleAutoDismiss = () => {
    setIsVisible(false);
    scheduleNextAppearance();
  };

  const scheduleNextAppearance = () => {
    if (reappearTimerRef.current) clearTimeout(reappearTimerRef.current);

    // Schedule next ad appearance after intervalSec (15 min = 900,000 ms)
    const delayMs = Math.max(3, intervalSec) * 1000;
    reappearTimerRef.current = setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % Math.max(1, banners.length));
      setIsVisible(true);
      setTimeLeft(autoDismissSec);
    }, delayMs);
  };

  const handleManualClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!ad) return;

    onCloseBanner(ad.id);
    setIsVisible(false);
    scheduleNextAppearance();
  };

  const handleAdClick = () => {
    // Clear auto dismiss when user opens banner details
    setIsHovered(true);
    onSelectBanner(ad);
  };

  if (!config.enabled || !banners || banners.length === 0) return null;

  const safeIndex = currentIndex >= banners.length ? 0 : currentIndex;
  const ad = banners[safeIndex];

  if (!isVisible || !ad) return null;

  const visual = AdService.resolveAdVisualSource(ad);
  const adSvg = get3DAdSvg(
    ad.id,
    ad.icon,
    ad.bannerColor || colors.accent,
    visual.customLogoUrl || ad.customLogoUrl
  );

  return (
    <div 
      className="absolute left-3 top-[210px] sm:left-5 sm:top-[190px] z-20 pointer-events-auto select-none animate-in fade-in zoom-in-90 duration-300"
      style={{
        filter: 'drop-shadow(0 12px 28px rgba(0, 0, 0, 0.75))',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role="complementary"
      aria-label={`Рекламная акция партнера: ${ad.title}`}
    >
      <div 
        onClick={handleAdClick}
        className="twogis-map-ad-pin relative flex flex-col items-center cursor-pointer group transition-all duration-300 hover:scale-110 active:scale-95"
        title={`⭐ ${ad.title} — Нажмите для подробностей (скроется через ${timeLeft} с)`}
      >
        {/* Close Button '✕' in Top-Right Corner */}
        <button
          type="button"
          onClick={handleManualClose}
          className="twogis-close-ad-btn absolute -top-1 -right-1 z-50 w-5 h-5 rounded-full bg-black/60 hover:bg-black/90 text-white/70 hover:text-white border border-white/20 backdrop-blur-md flex items-center justify-center text-[10px] font-bold shadow-xs cursor-pointer transition active:scale-90"
          title="Скрыть рекламу"
          aria-label="Скрыть рекламу"
        >
          ✕
        </button>

        {/* Top Countdown Pill (30s auto-hide indicator) */}
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-40 bg-graphite-950/90 text-info text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-full border border-info/40 shadow-xs flex items-center gap-1 backdrop-blur-md">
          <span className="w-1.5 h-1.5 rounded-full bg-info animate-ping shrink-0" />
          <span>{timeLeft}s</span>
        </div>

        {/* 3D Logo / Icon Badge */}
        <div 
          className="relative w-12 h-12 flex items-center justify-center pointer-events-none mt-1"
          dangerouslySetInnerHTML={{ __html: adSvg }}
        />

        {/* "Реклама" Under Badge */}
        <div className="flex items-center gap-1 text-[8px] font-medium text-white/70 bg-black/60 backdrop-blur-md px-1.5 py-0.2 rounded mt-0.5 border border-white/15 uppercase tracking-wide pointer-events-none">
          <span>Реклама</span>
        </div>
      </div>
    </div>
  );
};
