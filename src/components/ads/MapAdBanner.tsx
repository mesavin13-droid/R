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
        className="group relative bg-[#181B1F]/95 backdrop-blur-2xl rounded-2xl border border-white/10 hover:border-white/20 p-3 sm:p-3.5 shadow-[0_12px_36px_rgba(0,0,0,0.6)] cursor-pointer transition-all"
      >
        {/* Subtle accent light indicator */}
        <div 
          className="absolute top-0 left-6 right-6 h-0.5 rounded-full opacity-60"
          style={{ backgroundColor: banner.bannerColor || '#4B8DFF' }}
        />

        {/* Top Meta Bar */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-[#9AA0A8] bg-white/5 px-2 py-0.5 rounded-md border border-white/5">
              Реклама
            </span>
            <span 
              className="text-[10px] font-medium px-2 py-0.5 rounded-md border"
              style={{
                backgroundColor: `${banner.bannerColor || '#4B8DFF'}15`,
                color: banner.bannerColor || '#4B8DFF',
                borderColor: `${banner.bannerColor || '#4B8DFF'}30`,
              }}
            >
              {banner.categoryBadge}
            </span>
            {banner.discountText && (
              <span className="text-[10px] font-bold text-[#34C759] bg-[#34C759]/10 px-2 py-0.5 rounded-md border border-[#34C759]/20">
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
            className="p-1 rounded-full text-[#9AA0A8] hover:text-white hover:bg-white/10 active:scale-90 transition shrink-0"
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
            style={{ backgroundColor: `${banner.bannerColor || '#4B8DFF'}20` }}
          >
            <span>{banner.icon}</span>
          </div>

          <div className="flex-1 min-w-0">
            <h4 className="text-xs sm:text-sm font-semibold text-white truncate leading-snug group-hover:text-[#4B8DFF] transition">
              {banner.title}
            </h4>
            <p className="text-[11px] text-[#9AA0A8] line-clamp-2 mt-0.5 leading-tight">
              {banner.subtitle}
            </p>

            {/* Address */}
            <div className="flex items-center gap-1 text-[10px] text-[#9AA0A8] mt-1.5 truncate">
              <MapPin className="w-3 h-3 text-[#4B8DFF] shrink-0" />
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
              className="text-[11px] font-medium text-[#F0F2F5] hover:text-white bg-[#20242A] hover:bg-[#282D35] px-2.5 py-1 rounded-xl border border-white/10 transition active:scale-95 flex items-center gap-1.5 shrink-0"
            >
              {copiedPromo === banner.promoCode ? (
                <>
                  <Check className="w-3 h-3 text-[#34C759]" />
                  <span className="text-[#34C759] font-semibold">Скопирован</span>
                </>
              ) : (
                <>
                  <Tag className="w-3 h-3 text-[#E5A93C]" />
                  <span className="font-mono text-[#E5A93C] font-semibold">{banner.promoCode}</span>
                </>
              )}
            </button>
          ) : (
            <span className="text-[10px] text-[#9AA0A8]">Партнёр ROADLIVE</span>
          )}

          <div className="flex items-center gap-1.5">
            {/* Show on Map / Action */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onFocusLocation(banner.latitude, banner.longitude);
              }}
              className="text-xs font-semibold text-[#4B8DFF] hover:text-white bg-[#4B8DFF]/15 hover:bg-[#4B8DFF] px-3 py-1 rounded-xl border border-[#4B8DFF]/30 hover:border-transparent transition active:scale-95 flex items-center gap-1"
            >
              <Navigation className="w-3 h-3 fill-current" />
              <span>{banner.actionText || 'На карте'}</span>
            </button>

            {/* If multiple banners, allow next */}
            {banners.length > 1 && (
              <button
                type="button"
                onClick={handleNext}
                className="text-[10px] text-[#9AA0A8] hover:text-white p-1 rounded-lg hover:bg-white/5 transition"
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
