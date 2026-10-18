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
  isGuest?: boolean;
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
  isGuest = false,
}) => {
  // Always fetch all active campaigns for the marquee line
  const allAds = AdService.getAllAds();
  const adsToDisplay = allAds.filter((b) => b.isActive !== false);

  const categories = [
    { id: 'all', label: 'Все', icon: Compass, color: colors.info },
    { id: 'crossing', label: 'Переезд', icon: Construction, color: colors.warningStrong },
    { id: 'accident', label: 'ДТП', icon: CarFront, color: colors.danger },
    { id: 'patrol', label: 'ДПС', icon: ShieldCheck, color: colors.info2 },
    { id: 'fuel', label: 'АЗС', icon: Fuel, color: colors.success },
    { id: 'road', label: 'Ремонт', icon: Navigation, color: colors.roadBlue },
    { id: 'traffic_light', label: 'Светофор', icon: Disc, color: colors.amber },
    { id: 'hazard', label: 'Опасность', icon: Truck, color: colors.warningStrong },
    { id: 'assistance', label: 'SOS', icon: LifeBuoy, color: colors.danger },
    { id: 'other', label: 'Другое', icon: CircleHelp, color: colors.muted },
    { id: 'question', label: 'Вопросы', icon: HelpCircle, color: colors.purple2 },
  ];

  return (
    <header 
      className="absolute top-0 left-0 right-0 z-40 pointer-events-none px-3 pt-2 pb-1 sm:p-4 flex flex-col gap-1.5 safe-top max-w-3xl mx-auto w-full rl-map-topbar"
      role="banner"
      aria-label="Верхняя панель навигации и фильтрации ROADLIVE"
    >
      {/* 1. Mobile-Perfect Glass Deck: Left Brand Logo -> Middle Marquee -> Right Profile */}
      <div className="pointer-events-auto relative w-full flex items-center gap-2 graphite-glass rl-map-brand-deck rounded-[17px] px-2.5 py-1.5 z-20">
        
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

        {/* Show an actual app title instead of a blank advertising bar. */}
        {adsToDisplay.length === 0 ? (
          <div className="flex-1 min-w-0 flex flex-col justify-center pl-1">
            <span className="text-[13px] font-extrabold tracking-[.06em] leading-tight text-white">ROAD LIVE</span>
            <span className="text-[10px] text-muted truncate leading-tight">Дорожная обстановка рядом</span>
          </div>
        ) : (
          <div className="relative flex-1 min-w-0 h-8 overflow-hidden flex items-center px-1" aria-label="Предложения партнёров">
            <div className="animate-marquee flex items-center gap-5 whitespace-nowrap text-xs text-white/90">
              {adsToDisplay.map((ad) => (
                <button key={ad.id} type="button" onClick={() => onSelectSponsoredPlace?.(ad)}
                  className="shrink-0 flex items-center gap-1.5 text-left" title={ad.title}>
                  <span className="text-accent text-[11px]">●</span>
                  <strong className="font-semibold">{ad.title}</strong>
                  <span className="text-muted">{ad.subtitle}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Right Controls: User Account Avatar Button */}
        <div className="flex items-center gap-1 shrink-0">
          {/* User Account Logo / Avatar */}
          <button
            type="button"
            onClick={onOpenProfile}
            className="flex items-center gap-1.5 bg-surface-700 hover:bg-white/10 px-2.5 py-1.5 rounded-xl border border-white/10 transition active:scale-95 shadow-xs cursor-pointer"
            title="Профиль водителя"
            aria-label={isGuest ? "Войти через Telegram" : `Профиль водителя ${currentUser.fullName}, рейтинг ${currentUser.rating.toFixed(1)}`}
          >
            <div className="relative">
              <HolidayDecorator size="sm" />
              <div className="w-5 h-5 rounded-full bg-graphite text-white flex items-center justify-center text-[10px] font-bold border border-white/20">
                {isGuest ? "Г" : currentUser.fullName?.[0] || "В"}
              </div>
            </div>
            <span className="text-[11px] font-semibold text-ink">
              {isGuest ? "Гость" : `★ ${currentUser.rating.toFixed(1)}`}
            </span>
          </button>
        </div>
      </div>

      {/* Compact, single-line road category pills: labels are never wrapped. */}
      <div className="rl-category-filter-rail pointer-events-auto" role="group"
        aria-label="Фильтры дорожных событий">
        {categories.map((cat) => {
          const selected = selectedCategory === cat.id;
          const Icon = cat.icon;
          const spriteIndex = roadMarkerIconIndex(cat.id, cat.id === 'road' ? 'repair' : '');
          return (
            <button key={cat.id} type="button"
              onClick={() => onSelectCategory(cat.id as EventType | 'all' | 'question' | 'station')}
              aria-pressed={selected}
              aria-label={'Показать на карте: ' + cat.label}
              title={cat.label}
              className={'rl-category-filter' + (selected ? ' rl-category-filter-active' : '')}>
              <span className="rl-category-pin" aria-hidden="true">
                {spriteIndex !== null ? (
                  <span className="rl-category-sprite" style={{
                    backgroundImage: "url('/markers/roadlive-sprite.webp')",
                    backgroundSize: '192px 29px',
                    backgroundPosition: (-spriteIndex * 24) + 'px 0',
                  }} />
                ) : (
                  <Icon className="rl-category-pin-icon" style={{ color: cat.color }} />
                )}
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
