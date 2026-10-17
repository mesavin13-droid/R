import React from 'react';
import { 
  ShieldAlert, AlertTriangle, LifeBuoy, Fuel, Construction, 
  HelpCircle, Compass, ShieldCheck, Navigation, Disc, Radio, CarFront, Truck, CircleHelp
} from 'lucide-react';
import { HolidayDecorator } from '../common/HolidayDecorator';
import { EventType, UserProfile, SponsoredBanner, RoadEvent } from '../../types';
import { AdService } from '../../services/adService';
import { CriticalSosBanner } from '../events/CriticalSosBanner';
import { roadMarkerIconIndex } from '../map/markerVisuals';
import { colors } from '../../theme/tokens';

interface TopHeaderProps {
  selectedCategory: EventType | 'all' | 'question' | 'station';
  onSelectCategory: (cat: EventType | 'all' | 'question' | 'station') => void;
  currentUser: UserProfile;
  onOpenProfile: () => void;
  onOpenAdmin: () => void;
  onOpenAbout?: () => void;
  sponsoredBanners?: SponsoredBanner[];
  onSelectSponsoredPlace?: (ad: SponsoredBanner) => void;
  events: RoadEvent[];
  userCoords: { lat: number; lng: number } | null;
  onSelectEvent: (ev: RoadEvent) => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  selectedCategory,
  onSelectCategory,
  currentUser,
  onOpenProfile,
  onOpenAdmin,
  onOpenAbout,
  onSelectSponsoredPlace,
  events,
  userCoords,
  onSelectEvent,
}) => {
  // Always fetch all active campaigns for the marquee line
  const allAds = AdService.getAllAds();
  const adsToDisplay = allAds.filter((b) => b.isActive !== false);

  const categories = [
    { id: 'all', label: 'Все', icon: Compass, color: colors.info },
    { id: 'crossing', label: 'Переезд', icon: Construction, color: colors.warningStrong },
    { id: 'accident', label: 'ДТП', icon: CarFront, color: colors.danger },
    { id: 'patrol', label: 'Дорожный контроль', icon: ShieldCheck, color: colors.info2 },
    { id: 'fuel', label: 'АЗС', icon: Fuel, color: colors.success },
    { id: 'road', label: 'Дорога / ремонт', icon: Navigation, color: colors.roadBlue },
    { id: 'traffic_light', label: 'Светофор', icon: Disc, color: colors.amber },
    { id: 'hazard', label: 'Препятствие', icon: Truck, color: colors.warningStrong },
    { id: 'assistance', label: 'Помощь SOS', icon: LifeBuoy, color: colors.danger },
    { id: 'other', label: 'Другое', icon: CircleHelp, color: colors.muted },
    { id: 'question', label: 'Вопросы', icon: HelpCircle, color: colors.purple2 },
  ];

  return (
    <header 
      className="absolute top-0 left-0 right-0 z-40 pointer-events-none p-2.5 sm:p-4 flex flex-col gap-2 safe-top max-w-3xl mx-auto w-full"
      role="banner"
      aria-label="Верхняя панель навигации и фильтрации ROADLIVE"
    >
      {/* 1. Mobile-Perfect Glass Deck: Left Brand Logo -> Middle Marquee -> Right Profile */}
      <div className="pointer-events-auto relative w-full flex items-center gap-2 graphite-glass rl-map-brand-deck rounded-2xl px-2.5 py-1.5 z-20">
        
        {/* Left Brand Service Logo (R) */}
        <button
          type="button"
          onClick={onOpenAbout}
          className="flex items-center justify-center w-8 h-8 rounded-xl bg-graphite hover:bg-surface-700 border border-white/10 shrink-0 transition active:scale-95 cursor-pointer shadow-xs"
          title="О сервисе ROADLIVE"
          aria-label="Открыть справку о сервисе ROADLIVE"
        >
          <span className="font-mono font-bold text-xs text-white">R</span>
          <span className="w-1.5 h-1.5 rounded-full bg-accent ml-0.5"></span>
        </button>

        {/* Middle Full-Width Marquee Running Line (Бегущая строка от логотипа до аккаунта) */}
        <div 
          className="relative flex-1 flex items-center overflow-hidden min-w-0 h-8 cursor-pointer group px-1"
          role="region"
          aria-label="Бегущая строка рекламных предложений и акций"
        >
          <div className="w-full overflow-hidden flex items-center">
            <div className="animate-marquee flex items-center gap-6 whitespace-nowrap text-xs font-medium text-white/90">
              {/* Loop 1 */}
              {adsToDisplay.map((ad, idx) => (
                <div
                  key={`ad_loop1_${ad.id}_${idx}`}
                  onClick={() => onSelectSponsoredPlace && onSelectSponsoredPlace(ad)}
                  className="flex items-center gap-2 hover:text-accent transition cursor-pointer shrink-0"
                  title={`⭐ ${ad.title} — Нажмите для подробностей`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Рекламная кампания: ${ad.title}`}
                >
                  <span className="text-xs">{ad.icon || '📢'}</span>
                  <span className="font-bold text-white group-hover:text-accent">{ad.title}:</span>
                  <span className="text-muted">{ad.subtitle}</span>
                  {ad.promoCode && (
                    <span className="text-[10px] font-mono text-warning bg-warning/10 px-1.5 py-0.2 rounded border border-warning/20">
                      {ad.promoCode}
                    </span>
                  )}
                  <span className="text-accent/40 px-1">✦</span>
                </div>
              ))}

              {/* Loop 2 for Continuous Infinite Scrolling */}
              {adsToDisplay.map((ad, idx) => (
                <div
                  key={`ad_loop2_${ad.id}_${idx}`}
                  onClick={() => onSelectSponsoredPlace && onSelectSponsoredPlace(ad)}
                  className="flex items-center gap-2 hover:text-accent transition cursor-pointer shrink-0"
                  title={`⭐ ${ad.title} — Нажмите для подробностей`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Рекламная кампания: ${ad.title}`}
                >
                  <span className="text-xs">{ad.icon || '📢'}</span>
                  <span className="font-bold text-white group-hover:text-accent">{ad.title}:</span>
                  <span className="text-muted">{ad.subtitle}</span>
                  {ad.promoCode && (
                    <span className="text-[10px] font-mono text-warning bg-warning/10 px-1.5 py-0.2 rounded border border-warning/20">
                      {ad.promoCode}
                    </span>
                  )}
                  <span className="text-accent/40 px-1">✦</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Controls: User Account Avatar Button */}
        <div className="flex items-center gap-1 shrink-0">
          {/* User Account Logo / Avatar */}
          <button
            type="button"
            onClick={onOpenProfile}
            className="flex items-center gap-1.5 bg-surface-700 hover:bg-white/10 px-2.5 py-1.5 rounded-xl border border-white/10 transition active:scale-95 shadow-xs cursor-pointer"
            title="Профиль водителя"
            aria-label={`Профиль водителя ${currentUser.fullName}, рейтинг ${currentUser.rating.toFixed(1)}`}
          >
            <div className="relative">
              <HolidayDecorator size="sm" />
              <div className="w-5 h-5 rounded-full bg-graphite text-white flex items-center justify-center text-[10px] font-bold border border-white/20">
                {currentUser.fullName[0]}
              </div>
            </div>
            <span className="text-[11px] font-semibold text-ink">
              ★ {currentUser.rating.toFixed(1)}
            </span>
          </button>
        </div>
      </div>

      {/* 2. Scrollable category pins — large visual targets on narrow Telegram screens */}
      <div
        className="rl-category-filter-rail pointer-events-auto"
        role="tablist"
        aria-label="Категории дорожных событий на карте"
      >
        {categories.map((cat) => {
          const isSelected = selectedCategory === cat.id;
          const IconComp = cat.icon;
          const pinId = cat.id.replace(/[^a-z0-9_-]/gi, '-');
          const spriteIndex = roadMarkerIconIndex(cat.id, cat.id === 'road' ? 'repair' : '');
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelectCategory(cat.id as any)}
              role="tab"
              aria-selected={isSelected}
              aria-label={`Фильтр карты: ${cat.label}`}
              title={cat.label}
              className={`rl-category-filter ${isSelected ? 'rl-category-filter-active' : ''}`}
            >
              <span className="rl-category-pin">
                {spriteIndex !== null && (
                  <span aria-hidden="true"
                    className="absolute top-0 left-1/2 -translate-x-1/2 pointer-events-none"
                    style={{
                      width: 48, height: 58, zIndex: 2,
                      backgroundImage: "url('/markers/roadlive-sprite.webp')",
                      backgroundRepeat: 'no-repeat',
                      backgroundSize: '384px 58px',
                      backgroundPosition: `-${spriteIndex * 48}px 0`,
                      filter: 'drop-shadow(0 3px 4px rgba(0,0,0,.48))',
                    }}
                  />
                )}
                <svg className="rl-category-pin-shell" style={spriteIndex !== null ? { opacity: 0 } : undefined} viewBox="0 0 64 72" aria-hidden="true">
                  <defs>
                    <linearGradient id={`rl-category-housing-${pinId}`} x1="8" y1="2" x2="54" y2="68" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#526681" />
                      <stop offset=".22" stopColor="#1A2639" />
                      <stop offset=".72" stopColor="#080D17" />
                      <stop offset="1" stopColor="#344A68" />
                    </linearGradient>
                    <linearGradient id={`rl-category-rim-${pinId}`} x1="11" y1="4" x2="51" y2="54" gradientUnits="userSpaceOnUse">
                      <stop stopColor={isSelected ? "#B8D9FF" : "#91A4C0"} />
                      <stop offset=".45" stopColor={isSelected ? colors.accent : "#526681"} />
                      <stop offset="1" stopColor={isSelected ? colors.accentDeep : "#283A52"} />
                    </linearGradient>
                  </defs>
                  <path d="M32 68S7 43 7 25a25 25 0 1 1 50 0C57 43 32 68 32 68Z" fill={`url(#rl-category-housing-${pinId})`} stroke={isSelected ? colors.accent : "#70829C"} strokeWidth={isSelected ? "1.8" : "1.2"} />
                  <circle cx="32" cy="25" r="20" fill={`url(#rl-category-housing-${pinId})`} stroke={`url(#rl-category-rim-${pinId})`} strokeWidth={isSelected ? "2.8" : "1.8"} />
                  <circle cx="32" cy="25" r="16.5" fill="#0C1421" stroke="#415470" strokeWidth=".8" />
                  <path d="M19 12.5a18 18 0 0 1 23-1.2" fill="none" stroke="#F5F8FF" strokeOpacity=".52" strokeWidth="1.1" strokeLinecap="round" />
                  <path d="M20 48 32 64 44 48" fill="none" stroke="#03070D" strokeOpacity=".55" strokeWidth="1.2" />
                </svg>
                <IconComp className="rl-category-pin-icon" style={{ color: "#EAF1FC", opacity: spriteIndex !== null ? 0 : 1 }} aria-hidden="true" />
                {isSelected && <span className="rl-category-pin-glow" aria-hidden="true" />}
              </span>
              <span className="rl-category-filter-label">{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* 3. Flow-based Critical SOS Banner */}
      <CriticalSosBanner
        events={events}
        userCoords={userCoords}
        currentUserId={currentUser.id}
        onSelectEvent={onSelectEvent}
      />
    </header>
  );
};
