import React, { useState } from 'react';
import { RoadEvent } from '../../types';
import { ArrowRight, LifeBuoy, X } from 'lucide-react';
import { EventService } from '../../services/eventService';
import { NOTIFY_RADIUS_M } from '../../services/notificationService';

interface CriticalSosBannerProps {
  events: RoadEvent[];
  userCoords: { lat: number; lng: number } | null;
  currentUserId?: string;
  onSelectEvent: (ev: RoadEvent) => void;
}

export const CriticalSosBanner: React.FC<CriticalSosBannerProps> = ({
  events, userCoords, currentUserId, onSelectEvent,
}) => {
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  if (!userCoords) return null;

  const distanceTo = (ev: RoadEvent) =>
    EventService.calculateDistanceMeters(ev.latitude, ev.longitude, userCoords.lat, userCoords.lng);

  const eligible = events
    .filter((ev) =>
      ev.type === 'assistance' &&
      (ev.status === 'active' || ev.status === 'expiring') &&
      ev.userId !== currentUserId &&
      !dismissedIds.includes(ev.id) &&
      distanceTo(ev) <= NOTIFY_RADIUS_M.sos
    )
    .sort((a, b) => distanceTo(a) - distanceTo(b));

  if (!eligible.length) return null;
  const sos = eligible[0];
  const meters = distanceTo(sos);
  const distance = meters < 1000 ? `${meters} м` : `${(meters / 1000).toFixed(1)} км`;

  return (
    <div className="rl-nearby-sos pointer-events-auto" role="alert" aria-label="Запрос помощи поблизости">
      <div className="rl-nearby-sos-icon"><LifeBuoy size={19} strokeWidth={2.1} aria-hidden="true"/></div>
      <button
        className="rl-nearby-sos-main"
        type="button"
        onClick={() => onSelectEvent(sos)}
        aria-label={`Открыть запрос помощи ${sos.title}, ${distance}`}
      >
        <strong>Нужна помощь · {distance}</strong>
        <span>{sos.title}{sos.address ? ` · ${sos.address}` : ''}</span>
      </button>
      <button type="button" className="rl-nearby-sos-arrow"
        onClick={() => onSelectEvent(sos)} aria-label="Посмотреть запрос"><ArrowRight size={18}/></button>
      <button type="button" className="rl-nearby-sos-dismiss"
        onClick={() => setDismissedIds((prev) => [...prev, sos.id])} aria-label="Скрыть запрос"><X size={16}/></button>
    </div>
  );
};
