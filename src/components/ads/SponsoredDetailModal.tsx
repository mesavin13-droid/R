import React, { useState } from 'react';
import { SponsoredBanner } from '../../types';
import { X, MapPin, Phone, Tag, Copy, Check, Navigation, ShieldCheck, Sparkles } from 'lucide-react';

interface SponsoredDetailModalProps {
  banner: SponsoredBanner | null;
  onClose: () => void;
  onNavigateToLocation: (lat: number, lng: number) => void;
}

export const SponsoredDetailModal: React.FC<SponsoredDetailModalProps> = ({
  banner,
  onClose,
  onNavigateToLocation,
}) => {
  const [copied, setCopied] = useState(false);

  if (!banner) return null;

  const handleCopy = () => {
    if (banner.promoCode) {
      navigator.clipboard.writeText(banner.promoCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-xs p-0 sm:p-4 select-none">
      <div className="relative w-full max-w-lg graphite-sheet-depth rounded-t-[28px] sm:rounded-[28px] overflow-hidden flex flex-col max-h-[90vh] safe-bottom animate-in slide-in-from-bottom duration-250">
        {/* Luster line */}
        <div 
          className="h-1 w-full" 
          style={{ backgroundColor: banner.bannerColor || '#4B8DFF' }} 
        />

        {/* Mobile Drag Handle */}
        <div className="flex justify-center pt-2.5 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-white/20 rounded-full"></div>
        </div>

        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div 
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl border border-white/10 shadow-md shrink-0 overflow-hidden"
              style={{ backgroundColor: `${banner.bannerColor || '#4B8DFF'}25` }}
            >
              {banner.customLogoUrl ? (
                <img src={banner.customLogoUrl} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                <span>{banner.icon}</span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
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
              </div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight leading-snug">
                {banner.title}
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-white/5 text-[#9AA0A8] hover:text-white transition active:scale-90"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs sm:text-sm text-[#F0F2F5]">
          {/* Subtitle & Description */}
          <div className="p-4 rounded-2xl bg-[#181B1F] border border-white/[0.06] space-y-2">
            <p className="font-semibold text-white text-sm">
              {banner.subtitle}
            </p>
            <p className="text-xs text-[#9AA0A8] leading-relaxed">
              {banner.details}
            </p>
          </div>

          {/* Special Discount / Promo Code Card */}
          {banner.promoCode && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-[#181B1F] to-[#20242A] border border-[#E5A93C]/30 shadow-md space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[#E5A93C]">
                  <Sparkles className="w-4 h-4 fill-current" />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Спецпредложение для водителей
                  </span>
                </div>
                {banner.discountText && (
                  <span className="text-xs font-bold text-[#34C759] bg-[#34C759]/15 px-2.5 py-0.5 rounded-lg border border-[#34C759]/25">
                    {banner.discountText}
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between p-2.5 bg-[#111315] rounded-xl border border-white/10">
                <div>
                  <p className="text-[10px] text-[#9AA0A8]">Промокод:</p>
                  <p className="text-sm font-mono font-bold text-white tracking-wider">
                    {banner.promoCode}
                  </p>
                </div>
                <button
                  onClick={handleCopy}
                  className="px-3 py-1.5 bg-[#20242A] hover:bg-[#282D35] text-xs font-medium text-white rounded-lg border border-white/10 transition active:scale-95 flex items-center gap-1.5"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#34C759]" />
                      <span className="text-[#34C759]">Скопировано</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-[#9AA0A8]" />
                      <span>Скопировать</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Contact & Address info */}
          <div className="space-y-2.5">
            <div className="p-3.5 rounded-2xl bg-[#181B1F] border border-white/[0.06] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-[#4B8DFF]">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] text-[#9AA0A8]">Адрес</p>
                  <p className="text-xs font-semibold text-white">{banner.address}</p>
                </div>
              </div>
            </div>

            {banner.phone && (
              <a
                href={`tel:${banner.phone.replace(/[^\d+]/g, '')}`}
                className="p-3.5 rounded-2xl bg-[#181B1F] border border-white/[0.06] hover:border-[#4B8DFF]/40 flex items-center justify-between transition active:scale-[0.98]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-[#34C759]">
                    <Phone className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[10px] text-[#9AA0A8]">Телефон для связи</p>
                    <p className="text-xs font-semibold text-white">{banner.phone}</p>
                  </div>
                </div>
                <span className="text-xs text-[#4B8DFF] font-medium">Позвонить →</span>
              </a>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-[#14171B] border-t border-white/[0.08] flex items-center gap-2.5 safe-bottom">
          <button
            onClick={onClose}
            className="flex-1 py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-[#9AA0A8] hover:text-white font-medium text-xs transition active:scale-95 text-center"
          >
            Закрыть
          </button>
          <button
            onClick={() => {
              onNavigateToLocation(banner.latitude, banner.longitude);
              onClose();
            }}
            className="flex-[2] py-3 px-4 rounded-xl bg-[#4B8DFF] hover:bg-[#3C7AE6] text-white font-semibold text-xs shadow-md transition active:scale-95 flex items-center justify-center gap-2"
          >
            <Navigation className="w-4 h-4 fill-current" />
            <span>Показать на карте</span>
          </button>
        </div>
      </div>
    </div>
  );
};
