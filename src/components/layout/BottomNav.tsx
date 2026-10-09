import React from 'react';
import { Map, MessageSquare, HelpCircle, Navigation, User } from 'lucide-react';

export type NavTab = 'map' | 'chat' | 'questions' | 'route' | 'stations' | 'profile';

interface BottomNavProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  questionsBadgeCount?: number;
  chatBadgeCount?: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onTabChange,
  questionsBadgeCount = 0,
  chatBadgeCount = 0,
}) => {
  const tabs = [
    { id: 'map', label: 'Карта', icon: Map },
    { id: 'chat', label: 'Эфир', icon: MessageSquare, badge: chatBadgeCount },
    { id: 'questions', label: 'Вопросы', icon: HelpCircle, badge: questionsBadgeCount },
    { id: 'route', label: 'Маршрут', icon: Navigation },
    { id: 'profile', label: 'Профиль', icon: User },
  ];

  return (
    <nav className="fixed bottom-0 sm:bottom-3 left-0 right-0 sm:left-1/2 sm:-translate-x-1/2 z-40 sm:max-w-md w-full bg-graphite/82 backdrop-blur-2xl border-t sm:border border-white/[0.08] sm:rounded-full shadow-[0_12px_36px_rgba(0,0,0,0.6)] px-3 safe-bottom select-none">
      <div className="grid grid-cols-5 items-center h-14 max-w-md mx-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id as NavTab)}
              className={`relative flex flex-col items-center justify-center h-full min-h-[44px] min-w-[44px] py-1 transition-all active:scale-95 ${
                isActive ? 'text-white' : 'text-faint hover:text-muted'
              }`}
            >
              <div className="relative">
                <Icon
                  className={`w-5 h-5 transition-transform duration-200 ${
                    isActive ? 'scale-105 stroke-[2]' : 'stroke-[1.6]'
                  }`}
                />
                {isActive && (
                  <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-accent"></span>
                )}
                {Boolean(tab.badge && tab.badge > 0) && (
                  <span className="absolute -top-1 -right-2 flex h-3.5 min-w-[14px] px-1 items-center justify-center rounded-full bg-accent text-white text-[9px] font-bold">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span
                className={`text-[10px] tracking-tight mt-1 transition-all ${
                  isActive ? 'font-medium text-white' : 'font-normal'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
