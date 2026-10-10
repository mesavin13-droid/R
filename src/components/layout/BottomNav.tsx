import React from 'react';
import { Map, MessageSquare, HelpCircle, User, Siren } from 'lucide-react';

export type NavTab = 'map' | 'chat' | 'questions' | 'route' | 'stations' | 'profile';

interface BottomNavProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  /** Opens the emergency SOS flow — wired to the raised centre button. */
  onSosClick?: () => void;
  questionsBadgeCount?: number;
  chatBadgeCount?: number;
}

/**
 * RoadOS bottom navigation: four tabs (Карта · Эфир · Вопросы · Профиль)
 * around a raised central SOS button. The SOS is always one tap away —
 * it no longer lives inside the map's action cluster.
 */
export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onTabChange,
  onSosClick,
  questionsBadgeCount = 0,
  chatBadgeCount = 0,
}) => {
  // `route` / `stations` are map sub-screens — highlight «Карта» for them.
  const effectiveTab: NavTab =
    activeTab === 'route' || activeTab === 'stations' ? 'map' : activeTab;

  const tabs: { id: NavTab; label: string; icon: typeof Map; badge?: number }[] = [
    { id: 'map', label: 'Карта', icon: Map },
    { id: 'chat', label: 'Эфир', icon: MessageSquare, badge: chatBadgeCount },
    { id: 'questions', label: 'Вопросы', icon: HelpCircle, badge: questionsBadgeCount },
    { id: 'profile', label: 'Профиль', icon: User },
  ];

  // Interleave tabs around the centre SOS: left pair, SOS slot, right pair.
  const left = tabs.slice(0, 2);
  const right = tabs.slice(2);

  const renderTab = (tab: (typeof tabs)[number]) => {
    const Icon = tab.icon;
    const isActive = effectiveTab === tab.id;
    const badge = tab.badge ?? 0;

    return (
      <button
        key={tab.id}
        type="button"
        onClick={() => onTabChange(tab.id)}
        aria-current={isActive ? 'page' : undefined}
        aria-label={tab.badge ? `${tab.label}, ${tab.badge} новых` : tab.label}
        className={`relative flex flex-col items-center justify-center h-full min-h-[48px] min-w-[48px] gap-0.5 rounded-2xl transition-all active:scale-95 ${
          isActive ? 'text-white' : 'text-faint hover:text-muted'
        }`}
      >
        <span
          className={`relative flex items-center justify-center w-7 h-7 rounded-xl transition-all duration-200 ${
            isActive
              ? 'bg-accent/18 shadow-[0_0_14px_rgba(79,168,255,0.35)]'
              : 'bg-transparent'
          }`}
        >
          <Icon
            className={`w-[19px] h-[19px] transition-all ${
              isActive ? 'stroke-[2.2]' : 'stroke-[1.7]'
            }`}
          />
          {Boolean(tab.badge && tab.badge > 0) && (
            <span className="absolute -top-1 -right-1.5 flex h-3.5 min-w-[14px] px-1 items-center justify-center rounded-full bg-danger text-white text-[9px] font-bold ring-2 ring-graphite-900">
              {badge > 99 ? '99+' : badge}
            </span>
          )}
        </span>
        <span
          className={`text-[10px] leading-none tracking-tight transition-all ${
            isActive ? 'font-semibold text-white' : 'font-medium'
          }`}
        >
          {tab.label}
        </span>
      </button>
    );
  };

  return (
    <nav
      className="fixed bottom-0 sm:bottom-3 left-0 right-0 sm:left-1/2 sm:-translate-x-1/2 z-40 sm:max-w-md w-full select-none"
      aria-label="Основная навигация RoadOS"
    >
      <div className="relative bg-graphite-900/90 backdrop-blur-2xl border-t sm:border border-white/[0.09] sm:rounded-3xl shadow-[0_16px_44px_rgba(0,0,0,0.65)] px-3 safe-bottom">
        <div className="grid grid-cols-5 items-center h-[62px] max-w-md mx-auto">
          {left.map(renderTab)}

          {/* Centre raised SOS button */}
          <div className="relative flex justify-center">
            <button
              type="button"
              onClick={onSosClick}
              disabled={!onSosClick}
              aria-label="Экстренный вызов помощи SOS"
              title="SOS — вызов помощи"
              className="rl-sos"
            >
              <Siren className="w-6 h-6 stroke-[2.2]" />
              <span className="rl-sos-ping" aria-hidden="true" />
            </button>
            <span className="mt-7 text-[10px] font-semibold leading-none text-danger">
              SOS
            </span>
          </div>

          {right.map(renderTab)}
        </div>
      </div>
    </nav>
  );
};
