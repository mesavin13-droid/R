import { colors } from '../../theme/tokens';
import React, { useState } from 'react';
import { SponsoredBanner } from '../../types';
import { X, Navigation, Phone, Tag, Copy, Check, ChevronRight, MapPin, ExternalLink } from 'lucide-react';

interface MapAdBannerProps {
  banners: SponsoredBanner[];
  onCloseBanner: (bannerId: string) => void;
  onFocusLocation: (lat: number, lng: number) => void;
  onSelectBannerDetails: (banner: SponsoredBanner) => void;
}

export const MapAdBanner: React.FC<MapAdBannerProps> = ({
  banners,
  onCloseBanner,
  onFocusLocation,
  onSelectBannerDetails,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [copiedPromo, setCopiedPromo] = useState<string | null>(null);

  if (!banners || banners.length === 0) return null;

  // Ensure currentIndex is in range
  const safeIndex = currentIndex >= banners.length ? 0 : currentIndex;
  const banner = banners[safeIndex];
  if (!banner) return null;

  const handleCopyPromo = (e: React.MouseEvent, code: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(code);
    setCopiedPromo(code);
    setTimeout(() => setCopiedPromo(null), 2500);
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % banners.length);
  };

  return (
    <div className="absolute left-3 right-3 sm:left-4 sm:right-auto sm:w-[380px] top-20 sm:top-20 z-20 pointer-events-auto select-none animate-in slide-in-from-top-4 duration-300">
      <div 
        onClick={() => onSelectBannerDetails(banner)}
        className="group relative bg-surface-800/95 backdrop-blur-2xl rounded-2xl border border-white/10 hover:border-white/20 p-3 sm:p-3.5 shadow-[0_12px_36px_rgba(0,0,0,0.6)] cursor-pointer transition-all"
      >
        {/* Subtle accent light indicator */}
        <div 
          className="absolute top-0 left-6 right-6 h-0.5 rounded-full opacity-60"
          style={{ backgroundColor: banner.bannerColor || colors.accent }}
        />

        {/* Top Meta Bar */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-muted bg-white/5 px-2 py-0.5 rounded-md border border-white/5">
              Реклама
            </span>
            <span 
              className="text-[10px] font-medium px-2 py-0.5 rounded-md border"
              style={{
                backgroundColor: `${banner.bannerColor || colors.accent}15`,
                color: banner.bannerColor || colors.accent,
                borderColor: `${banner.bannerColor || colors.accent}30`,
              }}
            >
              {banner.categoryBadge}
            </span>
            {banner.discountText && (
              <span className="text-[10px] font-bold text-success bg-success/10 px-2 py-0.5 rounded-md border border-success/20">
                {banner.discountText}
              </span>
            )}
          </div>

          {/* Close Button ('✕') */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCloseBanner(banner.id);
            }}
            className="p-1 rounded-full text-muted hover:text-white hover:bg-white/10 active:scale-90 transition shrink-0"
            title="Закрыть рекламу"
            aria-label="Закрыть рекламу"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Banner Content Body */}
        <div className="flex items-start gap-3">
          <div 
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl shrink-0 border border-white/10 shadow-sm"
            style={{ backgroundColor: `${banner.bannerColor || colors.accent}20` }}
          >
            <span>{banner.icon}</span>
          </div>

          <div className="flex-1 min-w-0">
            <h4 className="text-xs sm:text-sm font-semibold text-white truncate leading-snug group-hover:text-accent transition">
              {banner.title}
            </h4>
            <p className="text-[11px] text-muted line-clamp-2 mt-0.5 leading-tight">
              {banner.subtitle}
            </p>

            {/* Address */}
            <div className="flex items-center gap-1 text-[10px] text-muted mt-1.5 truncate">
              <MapPin className="w-3 h-3 text-accent shrink-0" />
              <span className="truncate">{banner.address}</span>
            </div>
          </div>
        </div>

        {/* Bottom Actions Deck */}
        <div className="flex items-center justify-between pt-2.5 mt-2.5 border-t border-white/5 gap-2">
          {/* Promo code copy button */}
          {banner.promoCode ? (
            <button
              type="button"
              onClick={(e) => handleCopyPromo(e, banner.promoCode!)}
              className="text-[11px] font-medium text-ink hover:text-white bg-surface-700 hover:bg-surface-600 px-2.5 py-1 rounded-xl border border-white/10 transition active:scale-95 flex items-center gap-1.5 shrink-0"
            >
              {copiedPromo === banner.promoCode ? (
                <>
                  <Check className="w-3 h-3 text-success" />
                  <span className="text-success font-semibold">Скопирован</span>
                </>
              ) : (
                <>
                  <Tag className="w-3 h-3 text-warning" />
                  <span className="font-mono text-warning font-semibold">{banner.promoCode}</span>
                </>
              )}
            </button>
          ) : (
            <span className="text-[10px] text-muted">Партнёр ROADLIVE</span>
          )}

          <div className="flex items-center gap-1.5">
            {/* Show on Map / Action */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onFocusLocation(banner.latitude, banner.longitude);
              }}
              className="text-xs font-semibold text-accent hover:text-white bg-accent/15 hover:bg-accent px-3 py-1 rounded-xl border border-accent/30 hover:border-transparent transition active:scale-95 flex items-center gap-1"
            >
              <Navigation className="w-3 h-3 fill-current" />
              <span>{banner.actionText || 'На карте'}</span>
            </button>

            {/* If multiple banners, allow next */}
            {banners.length > 1 && (
              <button
                type="button"
                onClick={handleNext}
                className="text-[10px] text-muted hover:text-white p-1 rounded-lg hover:bg-white/5 transition"
                title="Следующая реклама"
              >
                {safeIndex + 1}/{banners.length} →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
