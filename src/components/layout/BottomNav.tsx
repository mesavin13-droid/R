import React, { useState } from 'react';
import {
  BookOpenText, ChevronRight, Fuel, Map, MessageSquareText,
  Navigation, Siren, UserRound, X,
} from 'lucide-react';

export type NavTab = 'map' | 'chat' | 'questions' | 'route' | 'stations' | 'profile';

interface BottomNavProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  onSosClick?: () => void;
  questionsBadgeCount?: number;
  chatBadgeCount?: number;
}

// Four uncomplicated actions. Secondary destinations remain available in "Ещё".
export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onTabChange,
  onSosClick,
  questionsBadgeCount = 0,
  chatBadgeCount = 0,
}) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const navigate = (tab: NavTab) => {
    setMoreOpen(false);
    onTabChange(tab);
  };

  const menuItems = [
    { id: 'questions' as const, label: 'Вопросы водителей', detail: 'Спросить и ответить', Icon: BookOpenText },
    { id: 'route' as const, label: 'Маршрут', detail: 'Проверить дорогу', Icon: Navigation },
    { id: 'stations' as const, label: 'Заправки', detail: 'Топливо и очереди', Icon: Fuel },
    { id: 'profile' as const, label: 'Профиль и настройки', detail: 'Аккаунт и уведомления', Icon: UserRound },
  ];
  const menuIsActive = moreOpen || !['map', 'chat'].includes(activeTab);

  return (
    <nav className="rl-bottom-nav" aria-label="Основная навигация ROAD LIVE">
      {moreOpen && (
        <>
          <button className="rl-nav-scrim" type="button" onClick={() => setMoreOpen(false)} aria-label="Закрыть меню"/>
          <div className="rl-more-sheet" role="menu" aria-label="Разделы ROAD LIVE">
            <div className="rl-more-sheet-header">
              <div><strong>Разделы</strong><p>Всё остальное — здесь</p></div>
              <button className="rl-quiet-icon-button" type="button" onClick={() => setMoreOpen(false)} aria-label="Закрыть меню"><X size={19}/></button>
            </div>
            {menuItems.map(({ id, label, detail, Icon }) => (
              <button
                key={id}
                type="button"
                role="menuitem"
                onClick={() => navigate(id)}
                className={'rl-more-item' + (activeTab === id ? ' is-active' : '')}
              >
                <Icon size={20} strokeWidth={1.8} aria-hidden="true"/>
                <span><strong>{label}</strong><small>{detail}</small></span>
                {id === 'questions' && questionsBadgeCount > 0 && <em>{questionsBadgeCount > 99 ? '99+' : questionsBadgeCount}</em>}
                <ChevronRight size={17} strokeWidth={1.6} aria-hidden="true"/>
              </button>
            ))}
          </div>
        </>
      )}
      <div className="rl-nav-surface safe-bottom">
        <div className="rl-nav-grid">
          <button className={'rl-simple-nav-item' + (activeTab === 'map' ? ' is-active' : '')}
            type="button" onClick={() => navigate('map')} aria-current={activeTab === 'map' ? 'page' : undefined}>
            <Map size={21} strokeWidth={1.9}/>
            <span>Карта</span>
          </button>
          <button className={'rl-simple-nav-item' + (activeTab === 'chat' ? ' is-active' : '')}
            type="button" onClick={() => navigate('chat')} aria-current={activeTab === 'chat' ? 'page' : undefined}>
            <span className="rl-nav-icon-wrap"><MessageSquareText size={21} strokeWidth={1.9}/>
              {chatBadgeCount > 0 && <i className="rl-nav-count">{chatBadgeCount > 99 ? '99+' : chatBadgeCount}</i>}
            </span>
            <span>Эфир</span>
          </button>
          <button className="rl-simple-nav-item rl-simple-nav-sos" type="button"
            onClick={() => {setMoreOpen(false); onSosClick?.();}} disabled={!onSosClick}
            aria-label="Нужна помощь на дороге">
            <Siren size={21} strokeWidth={2}/>
            <span>Помощь</span>
          </button>
          <button className={'rl-simple-nav-item' + (menuIsActive ? ' is-active' : '')}
            type="button" onClick={() => setMoreOpen((value) => !value)} aria-expanded={moreOpen}
            aria-label="Открыть другие разделы">
            <span className="rl-more-icon" aria-hidden="true"><span/><span/><span/></span>
            <span>Ещё</span>
          </button>
        </div>
      </div>
    </nav>
  );
};
