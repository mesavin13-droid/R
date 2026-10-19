import React, { useState } from 'react';
import {
  AlertTriangle, CircleHelp, Construction, Fuel, HelpCircle,
  LifeBuoy, MapPin, MoreHorizontal, ShieldCheck, TrafficCone, TrafficCone as RoadIcon,
  Disc, X, type LucideIcon,
} from 'lucide-react';
import { EventType, UserProfile, SponsoredBanner, RoadEvent } from '../../types';
import { CriticalSosBanner } from '../events/CriticalSosBanner';

type CategoryId = EventType | 'all' | 'question' | 'station';
type Category = { id: CategoryId; label: string; Icon: LucideIcon };

interface TopHeaderProps {
  selectedCategory: CategoryId;
  onSelectCategory: (cat: CategoryId) => void;
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

// Only the most useful road filters stay visible. The rest are one tap away.
const primaryCategories: Category[] = [
  { id: 'all', label: 'Все', Icon: MapPin },
  { id: 'accident', label: 'ДТП', Icon: AlertTriangle },
  { id: 'patrol', label: 'ДПС', Icon: ShieldCheck },
  { id: 'hazard', label: 'Опасность', Icon: TrafficCone },
  { id: 'assistance', label: 'Помощь', Icon: LifeBuoy },
];
const otherCategories: Category[] = [
  { id: 'crossing', label: 'Переезды', Icon: Construction },
  { id: 'road', label: 'Ремонт и дорога', Icon: RoadIcon },
  { id: 'traffic_light', label: 'Светофоры', Icon: Disc },
  { id: 'fuel', label: 'АЗС', Icon: Fuel },
  { id: 'station', label: 'Заправки на карте', Icon: Fuel },
  { id: 'question', label: 'Вопросы', Icon: HelpCircle },
  { id: 'other', label: 'Другое', Icon: MoreHorizontal },
];

export const TopHeader: React.FC<TopHeaderProps> = ({
  selectedCategory,
  onSelectCategory,
  currentUser,
  onOpenAbout,
  events,
  userCoords,
  onSelectEvent,
}) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const activeOther = otherCategories.find((category) => category.id === selectedCategory);

  const selectCategory = (category: CategoryId) => {
    onSelectCategory(category);
    setMoreOpen(false);
  };

  return (
    <header
      className="rl-map-topbar absolute top-0 left-0 right-0 z-40 safe-top pointer-events-none w-full"
      aria-label="ROAD LIVE: карта и фильтры"
    >
      {moreOpen && (
        <button
          className="rl-map-filter-dismiss pointer-events-auto"
          type="button"
          onClick={() => setMoreOpen(false)}
          aria-label="Закрыть фильтры"
        />
      )}
      <div className="rl-topbar-inner">
        <div className="rl-map-brand-deck pointer-events-auto">
          <div className="rl-brand-mark" aria-hidden="true">R<span /></div>
          <div className="rl-brand-copy">
            <strong>ROAD LIVE</strong>
            <span>Дорожная обстановка · Новосибирск</span>
          </div>
          <button
            type="button"
            onClick={onOpenAbout}
            className="rl-quiet-icon-button"
            aria-label="О сервисе ROAD LIVE"
            title="О сервисе"
          >
            <CircleHelp size={19} strokeWidth={1.9}/>
          </button>
        </div>
        <div className="rl-filter-line pointer-events-auto" role="group" aria-label="Категории на карте">
          {primaryCategories.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              className={'rl-simple-filter' + (selectedCategory === id ? ' is-active' : '')}
              aria-pressed={selectedCategory === id}
              onClick={() => selectCategory(id)}
            >
              <Icon size={15} strokeWidth={2} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
          <button
            type="button"
            className={'rl-simple-filter rl-filter-more' + (moreOpen || activeOther ? ' is-active' : '')}
            aria-expanded={moreOpen}
            aria-controls="rl-more-map-filters"
            onClick={() => setMoreOpen((open) => !open)}
          >
            <MoreHorizontal size={17} aria-hidden="true" />
            <span>{activeOther ? activeOther.label : 'Ещё'}</span>
          </button>
        </div>
        {moreOpen && (
          <div id="rl-more-map-filters" className="rl-filter-menu pointer-events-auto" role="group" aria-label="Другие дорожные события">
            <div className="rl-filter-menu-heading">
              <span>Другие категории</span>
              <button type="button" onClick={() => setMoreOpen(false)} aria-label="Закрыть"><X size={16}/></button>
            </div>
            <div className="rl-filter-menu-grid">
              {otherCategories.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  className={'rl-filter-menu-item' + (selectedCategory === id ? ' is-active' : '')}
                  onClick={() => selectCategory(id)}
                  aria-pressed={selectedCategory === id}
                >
                  <Icon size={17} strokeWidth={1.8} aria-hidden="true"/>
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <CriticalSosBanner
          events={events}
          userCoords={userCoords}
          currentUserId={currentUser.id}
          onSelectEvent={onSelectEvent}
        />
      </div>
    </header>
  );
};
