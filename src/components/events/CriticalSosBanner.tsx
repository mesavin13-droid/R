import React, { useState } from 'react';
import { RoadEvent } from '../../types';
import { X, ArrowRight } from 'lucide-react';
import { EventService } from '../../services/eventService';

interface CriticalSosBannerProps {
  events: RoadEvent[];
  userCoords: { lat: number; lng: number } | null;
  /** The signed-in driver (`tg-<id>`). Used to hide their OWN SOS from the banner. */
  currentUserId?: string;
  onSelectEvent: (ev: RoadEvent) => void;
  onRespondHelp?: (ev: RoadEvent) => void;
}

/**
 * The banner is only shown to drivers who can realistically get there:
 * city-scale help radius around the caller's position.
 */
const SOS_BANNER_RADIUS_M = 15000;

export const CriticalSosBanner: React.FC<CriticalSosBannerProps> = ({
  events,
  userCoords,
  currentUserId,
  onSelectEvent,
  onRespondHelp,
}) => {
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  const distanceTo = (ev: RoadEvent) =>
    userCoords ? EventService.calculateDistanceMeters(ev.latitude, ev.longitude, userCoords.lat, userCoords.lng) : null;

  // Active SOS not dismissed by the user, not their own call, and within the
  // help radius (when the driver's position is known) — nearest first.
  const activeSosEvents = events
    .filter((ev) => {
      if (ev.type !== 'assistance') return false;
      if (ev.status !== 'active' && ev.status !== 'expiring') return false;
      if (dismissedIds.includes(ev.id)) return false;
      // Never show a driver their own SOS call.
      if (currentUserId && ev.userId === currentUserId) return false;
      const meters = distanceTo(ev);
      return meters === null || meters <= SOS_BANNER_RADIUS_M;
    })
    .sort((a, b) => (distanceTo(a) ?? 0) - (distanceTo(b) ?? 0));

  if (activeSosEvents.length === 0) return null;

  // Pick the most recent/closest active SOS event
  const latestSos = activeSosEvents[0];

  let distanceText = '';
  if (userCoords) {
    const meters = EventService.calculateDistanceMeters(
      latestSos.latitude,
      latestSos.longitude,
      userCoords.lat,
      userCoords.lng
    );
    distanceText = meters < 1000 ? `${meters} м` : `${(meters / 1000).toFixed(1)} км`;
  }

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissedIds((prev) => [...prev, latestSos.id]);
  };

  return (
    <div 
      className="w-full max-w-md mx-auto z-30 pointer-events-auto animate-in slide-in-from-top-3 duration-250 mt-2"
      role="alert"
      aria-live="assertive"
      aria-label="Срочный экстренный вызов помощи SOS на дороге"
    >
      <div className="p-2.5 sm:p-3 rounded-2xl bg-danger/95 backdrop-blur-2xl border border-white/30 text-white shadow-[0_10px_32px_rgba(255,59,48,0.55)] flex flex-col gap-2">
        {/* Header Row with Close Button */}
        <div className="flex items-center justify-between gap-2 border-b border-white/20 pb-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="flex h-2.5 w-2.5 relative shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-90"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
            </span>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-white truncate">
              🚨 СРОЧНЫЙ ВЫЗОВ ПОМОЩИ {distanceText ? `(${distanceText})` : ''}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[9px] bg-black/40 text-white font-mono px-1.5 py-0.5 rounded-md border border-white/20">
              SOS
            </span>
            <button
              type="button"
              onClick={handleDismiss}
              className="p-1 rounded-full bg-black/30 hover:bg-black/60 text-white/90 hover:text-white transition active:scale-90 cursor-pointer"
              title="Скрыть уведомление"
              aria-label="Закрыть"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Content Summary */}
        <div 
          className="flex items-start gap-2 cursor-pointer group"
          onClick={() => onSelectEvent(latestSos)}
        >
          <span className="text-xl shrink-0 leading-none">🆘</span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-white leading-tight truncate group-hover:underline">
              {latestSos.authorName}: {latestSos.title}
            </p>
            <p className="text-[11px] text-white/90 truncate mt-0.5">
              📍 {latestSos.address}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2 pt-0.5">
          <button
            type="button"
            onClick={() => onSelectEvent(latestSos)}
            className="py-1.5 px-2 rounded-xl bg-black/30 hover:bg-black/50 text-white font-medium text-[11px] border border-white/20 transition active:scale-95 flex items-center justify-center gap-1 cursor-pointer"
          >
            <span>На карте</span>
            <ArrowRight className="w-3 h-3" />
          </button>

          <button
            type="button"
            onClick={() => {
              if (onRespondHelp && !latestSos.helperUserId) {
                onRespondHelp(latestSos);
              } else {
                // Someone is already on the way — just open the card.
                onSelectEvent(latestSos);
              }
            }}
            className="py-1.5 px-2 rounded-xl bg-white hover:bg-slate-100 text-danger font-bold text-[11px] shadow-sm transition active:scale-95 flex items-center justify-center gap-1 cursor-pointer"
          >
            {latestSos.helperUserId ? (
              <span>🤝 Уже едут</span>
            ) : (
              <span>🤝 Еду помочь</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
