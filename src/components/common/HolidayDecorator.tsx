import React, { useState, useEffect } from 'react';

export const HolidayDecorator: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => {
  const [activeHoliday, setActiveHoliday] = useState('none');

  const checkHoliday = () => {
    const holiday = localStorage.getItem('roadlive_active_holiday') || 'none';
    setActiveHoliday(holiday);
  };

  useEffect(() => {
    checkHoliday();
    // Periodically sync or listen to custom events
    const handleSync = () => checkHoliday();
    window.addEventListener('roadlive_holiday_changed', handleSync);
    return () => window.removeEventListener('roadlive_holiday_changed', handleSync);
  }, []);

  if (activeHoliday === 'none') return null;

  let style = '';
  let emoji = '';
  if (activeHoliday === 'new_year') {
    // Santa Claus hat emoji (or custom red hat emoji)
    emoji = '🤶'; // Santa hat/person or we can use 🧑‍🎄 / 🎅
    style = size === 'sm' 
      ? 'absolute -top-2 -right-1.5 text-[12px] rotate-[15deg] drop-shadow-[0_1.5px_2px_rgba(0,0,0,0.4)]'
      : size === 'md'
      ? 'absolute -top-3.5 -right-2.5 text-[18px] rotate-[15deg] drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]'
      : 'absolute -top-4 -right-3 text-[26px] rotate-[15deg] drop-shadow-[0_3px_6px_rgba(0,0,0,0.5)]';
  } else if (activeHoliday === 'halloween') {
    emoji = '🎃'; // Jack-o-lantern Pumpkin
    style = size === 'sm'
      ? 'absolute -top-2 -right-1 text-[11px] rotate-[-10deg] drop-shadow-[0_1.5px_2px_rgba(0,0,0,0.4)] animate-bounce'
      : size === 'md'
      ? 'absolute -top-2.5 -right-1.5 text-[15px] rotate-[-10deg] drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] animate-bounce'
      : 'absolute -top-3.5 -right-2 text-[22px] rotate-[-10deg] drop-shadow-[0_3px_6px_rgba(0,0,0,0.5)] animate-bounce';
  } else if (activeHoliday === 'driver_day') {
    emoji = '🏆'; // Driver Golden Trophy
    style = size === 'sm'
      ? 'absolute -top-1.5 -right-1 text-[10px] drop-shadow-[0_1px_1.5px_rgba(0,0,0,0.3)]'
      : size === 'md'
      ? 'absolute -top-2 -right-1.5 text-[14px] drop-shadow-[0_1.5px_2px_rgba(0,0,0,0.4)]'
      : 'absolute -top-2.5 -right-2 text-[20px] drop-shadow-[0_2px_3px_rgba(0,0,0,0.5)]';
  }

  if (!emoji) return null;
  return (
    <span className={`${style} pointer-events-none select-none z-30`} aria-hidden="true">
      {emoji}
    </span>
  );
};
