import React from 'react';
import { 
  ShieldAlert, AlertTriangle, LifeBuoy, Fuel, Construction, 
  HelpCircle, Compass, ShieldCheck, Navigation, Disc, Radio
} from 'lucide-react';
import { HolidayDecorator } from '../common/HolidayDecorator';
import { EventType, UserProfile, SponsoredBanner, RoadEvent } from '../../types';
import { AdService } from '../../services/adService';
import { CriticalSosBanner } from '../events/CriticalSosBanner';

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
    { id: 'all', label: 'Все', icon: Compass, color: '#38BDF8' },
    { id: 'assistance', label: 'Помощь SOS', icon: LifeBuoy, color: '#FF3B30' },
    { id: 'crossing', label: 'Переезд', icon: Construction, color: '#FF9F0A' },
    { id: 'accident', label: 'ДТП', icon: AlertTriangle, color: '#FF453A' },
    { id: 'patrol', label: 'Контроль', icon: ShieldCheck, color: '#30B0C7' },
    { id: 'fuel', label: 'АЗС', icon: Fuel, color: '#AF52DE' },
    { id: 'road', label: 'Дорога', icon: Navigation, color: '#60A5FA' },
    { id: 'traffic_light', label: 'Светофор', icon: Disc, color: '#FFD60A' },
    { id: 'question', label: 'Вопросы', icon: HelpCircle, color: '#C084FC' },
  ];

  return (
    <header 
      className="absolute top-0 left-0 right-0 z-40 pointer-events-none p-2.5 sm:p-4 flex flex-col gap-2 safe-top max-w-3xl mx-auto w-full"
      role="banner"
      aria-label="Верхняя панель навигации и фильтрации ROADLIVE"
    >
      {/* 1. Mobile-Perfect Glass Deck: Left Brand Logo -> Middle Marquee -> Right Profile */}
      <div className="pointer-events-auto relative w-full flex items-center gap-2 graphite-glass rounded-2xl px-2.5 py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.5)] border border-white/10 z-20">
        
        {/* Left Brand Service Logo (R) */}
        <button
          type="button"
          onClick={onOpenAbout}
          className="flex items-center justify-center w-8 h-8 rounded-xl bg-[#111315] hover:bg-[#20242A] border border-white/10 shrink-0 transition active:scale-95 cursor-pointer shadow-xs"
          title="О сервисе ROADLIVE"
          aria-label="Открыть справку о сервисе ROADLIVE"
        >
          <span className="font-mono font-bold text-xs text-white">R</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#4B8DFF] ml-0.5"></span>
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
                  className="flex items-center gap-2 hover:text-[#4B8DFF] transition cursor-pointer shrink-0"
                  title={`⭐ ${ad.title} — Нажмите для подробностей`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Рекламная кампания: ${ad.title}`}
                >
                  <span className="text-xs">{ad.icon || '📢'}</span>
                  <span className="font-bold text-white group-hover:text-[#4B8DFF]">{ad.title}:</span>
                  <span className="text-[#9AA0A8]">{ad.subtitle}</span>
                  {ad.promoCode && (
                    <span className="text-[10px] font-mono text-[#E5A93C] bg-[#E5A93C]/10 px-1.5 py-0.2 rounded border border-[#E5A93C]/20">
                      {ad.promoCode}
                    </span>
                  )}
                  <span className="text-[#4B8DFF]/40 px-1">✦</span>
                </div>
              ))}

              {/* Loop 2 for Continuous Infinite Scrolling */}
              {adsToDisplay.map((ad, idx) => (
                <div
                  key={`ad_loop2_${ad.id}_${idx}`}
                  onClick={() => onSelectSponsoredPlace && onSelectSponsoredPlace(ad)}
                  className="flex items-center gap-2 hover:text-[#4B8DFF] transition cursor-pointer shrink-0"
                  title={`⭐ ${ad.title} — Нажмите для подробностей`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Рекламная кампания: ${ad.title}`}
                >
                  <span className="text-xs">{ad.icon || '📢'}</span>
                  <span className="font-bold text-white group-hover:text-[#4B8DFF]">{ad.title}:</span>
                  <span className="text-[#9AA0A8]">{ad.subtitle}</span>
                  {ad.promoCode && (
                    <span className="text-[10px] font-mono text-[#E5A93C] bg-[#E5A93C]/10 px-1.5 py-0.2 rounded border border-[#E5A93C]/20">
                      {ad.promoCode}
                    </span>
                  )}
                  <span className="text-[#4B8DFF]/40 px-1">✦</span>
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
            className="flex items-center gap-1.5 bg-[#20242A] hover:bg-white/10 px-2.5 py-1.5 rounded-xl border border-white/10 transition active:scale-95 shadow-xs cursor-pointer"
            title="Профиль водителя"
            aria-label={`Профиль водителя ${currentUser.fullName}, рейтинг ${currentUser.rating.toFixed(1)}`}
          >
            <div className="relative">
              <HolidayDecorator size="sm" />
              <div className="w-5 h-5 rounded-full bg-[#111315] text-white flex items-center justify-center text-[10px] font-bold border border-white/20">
                {currentUser.fullName[0]}
              </div>
            </div>
            <span className="text-[11px] font-semibold text-[#F0F2F5]">
              ★ {currentUser.rating.toFixed(1)}
            </span>
          </button>
        </div>
      </div>

      {/* 2. Horizontal Scrollable Category Filter Chips Bar */}
      <div 
        className="pointer-events-auto flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 px-0.5 w-full"
        role="tablist"
        aria-label="Фильтры категорий событий на карте"
      >
        {categories.map((cat) => {
          const isSelected = selectedCategory === cat.id;
          const IconComp = cat.icon;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelectCategory(cat.id as any)}
              role="tab"
              aria-selected={isSelected}
              aria-label={`Фильтр карты: ${cat.label}`}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all duration-200 cursor-pointer shrink-0 active:scale-95 shadow-xs border ${
                isSelected
                  ? 'bg-[#0B111E]/90 text-white border-[#38BDF8] shadow-[0_0_12px_rgba(56,189,248,0.4)] font-semibold'
                  : 'bg-[#0B111E]/70 hover:bg-[#151D2A] text-[#9AA0A8] hover:text-white border-white/10 backdrop-blur-md'
              }`}
            >
              <IconComp className="w-3.5 h-3.5" style={{ color: isSelected ? '#38BDF8' : cat.color }} aria-hidden="true" />
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* 3. Flow-based Critical SOS Banner */}
      <CriticalSosBanner
        events={events}
        userCoords={userCoords}
        onSelectEvent={onSelectEvent}
      />
    </header>
  );
};
