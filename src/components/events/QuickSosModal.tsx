import React, { useState } from 'react';
import { UserProfile, RoadEvent } from '../../types';
import { X, AlertTriangle, MapPin, BatteryCharging, Cable, Wrench, Fuel, Snowflake, Handshake, type LucideIcon } from 'lucide-react';
import { EventService } from '../../services/eventService';
import { GeocodingService } from '../../services/geocodingService';

interface QuickSosModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  userCoords: { lat: number; lng: number } | null;
  gpsPositionAt: number | null;
  gpsAccuracyM: number | null;
  onSosCreated: (event: RoadEvent) => void;
}

export const QuickSosModal: React.FC<QuickSosModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  userCoords,
  gpsPositionAt,
  gpsAccuracyM,
  onSosCreated,
}) => {
  const [selectedSubtype, setSelectedSubtype] = useState<string>('battery');
  const [customComment, setCustomComment] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const now = Date.now();
  const canPublishAtRender = Boolean(userCoords && gpsPositionAt &&
    now - gpsPositionAt <= 120_000 && gpsPositionAt <= now + 60_000 &&
    gpsAccuracyM !== null && gpsAccuracyM > 0 && gpsAccuracyM <= 1000);

  if (!isOpen) return null;

  const sosOptions: { id: string; Icon: LucideIcon; title: string; desc: string }[] = [
    { id: 'battery', Icon: BatteryCharging, title: 'Прикурить АКБ', desc: 'Сдох аккумулятор, нужны провода' },
    { id: 'tow', Icon: Cable, title: 'Застрял / Нужен трос', desc: 'Буксировка или тросом вытащить' },
    { id: 'wheel', Icon: Wrench, title: 'Пробил колесо', desc: 'Нужен домкрат или баллонник' },
    { id: 'fuel_empty', Icon: Fuel, title: 'Закончился бензин', desc: 'Нужно подвезти 3-5л топлива' },
    { id: 'snow_mud', Icon: Snowflake, title: 'Застрял в снегу/грязи', desc: 'Нужен джип / вытащить лебёдкой' },
    { id: 'other_help', Icon: Handshake, title: 'Другая помощь', desc: 'Нужна помощь любого водителя' },
  ];

  const handlePublishSos = async () => {
    const now = Date.now();
    if (!userCoords || !gpsPositionAt || gpsAccuracyM === null || gpsAccuracyM <= 0 || gpsAccuracyM > 1000 ||
        now - gpsPositionAt > 120_000 || gpsPositionAt > now + 60_000 ||
        !Number.isFinite(userCoords.lat) || !Number.isFinite(userCoords.lng) ||
        Math.abs(userCoords.lat)>85 || Math.abs(userCoords.lng)>180) {
      alert('Не удалось определить координаты. Разрешите доступ к геолокации и повторите попытку. SOS не опубликован.');
      return;
    }
    const confirmed = window.confirm(`Отправить SOS по координатам ${userCoords.lat.toFixed(5)}, ${userCoords.lng.toFixed(5)}? Другие водители увидят эту точку.`);
    if (!confirmed) return;
    setIsSubmitting(true);
    try {
      const option = sosOptions.find((o) => o.id === selectedSubtype) || sosOptions[0];
      const coords = userCoords;
      const address = await GeocodingService.reverse(coords.lat, coords.lng);

      const title = option.title;
      const description = customComment.trim()
        ? `${option.desc}. Комментарий: ${customComment.trim()}`
        : `${option.desc}. Автомобилисту требуется срочная взаимовыручка!`;

      const newSosEvent = await EventService.createEvent(
        {
          cityId: 'nsk-city-01',
          type: 'assistance',
          subType: selectedSubtype,
          title,
          description,
          latitude: coords.lat,
          longitude: coords.lng,
          address,
        },
        currentUser,
        coords
      );

      onSosCreated(newSosEvent);
      onClose();
    } catch (err: any) {
      alert(err.message || 'Ошибка создания SOS-запроса');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="rl-dialog-surface rl-sos-dialog relative w-full max-w-md bg-surface-800 border border-danger/40 rounded-3xl shadow-xl overflow-hidden flex flex-col">
        {/* Top Critical Alert Header */}
        <div className="rl-dialog-header rl-sos-dialog-header bg-gradient-to-r from-danger/20 via-surface-800 to-surface-800 border-b border-danger/25 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 shrink-0 rounded-xl bg-danger/20 border border-danger/30 text-danger flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-snug">
                Срочный SOS-запрос помощи
              </h3>
              <p className="text-[11px] text-danger font-medium">
                Водители рядом увидят запрос при работающих уведомлениях
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-muted hover:text-white transition active:scale-90"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto max-h-[75vh]">
          <p className="text-xs text-muted">
            Выберите тип нужной помощи. Ваш запрос с геолокацией появится на карте как <strong>критическое SOS-уведомление</strong>:
          </p>

          {/* Quick SOS Option Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {sosOptions.map((opt) => {
              const isSelected = selectedSubtype === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSelectedSubtype(opt.id)}
                  className={`p-3 rounded-2xl text-left border transition active:scale-98 flex items-start gap-2.5 cursor-pointer ${
                    isSelected
                      ? 'bg-danger/15 border-danger shadow-[0_4px_16px_rgba(255,59,48,0.25)]'
                      : 'bg-surface-700 hover:bg-surface-650 border-white/10'
                  }`}
                >
                  <span className="w-9 h-9 shrink-0 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/90"><opt.Icon className="w-5 h-5" strokeWidth={2} aria-hidden="true" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-white truncate">{opt.title}</p>
                    <p className="text-[10px] text-muted leading-tight mt-0.5 line-clamp-2">{opt.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Optional Comment Input */}
          <div className="space-y-1.5 pt-1">
            <label className="text-[11px] text-muted font-medium block">
              Уточнение (марка машины, детали местоположения):
            </label>
            <input
              type="text"
              value={customComment}
              onChange={(e) => setCustomComment(e.target.value)}
              placeholder="Например: Синий Солярис, около АЗС, есть провода"
              className="w-full bg-graphite border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-faint focus:outline-none focus:border-danger/60 transition"
            />
          </div>

          {/* Location Badge */}
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-graphite border border-white/5 text-[11px] text-muted">
            <MapPin className="w-3.5 h-3.5 text-danger shrink-0" />
            <span className="truncate">
              {canPublishAtRender && userCoords ? `GPS ±${Math.round(gpsAccuracyM!)} м · ${userCoords.lat.toFixed(5)}, ${userCoords.lng.toFixed(5)}` : 'Нужна свежая точная GPS-позиция — SOS пока недоступен'}
            </span>
          </div>

          {!canPublishAtRender && (
            <p role="alert" className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-xl p-3">
              Для публикации SOS необходимо разрешить доступ к геолокации. Центр карты не используется как подмена GPS. При непосредственной опасности звоните <a href="tel:112" className="underline font-bold">112</a>.
            </p>
          )}
          {/* Critical SOS Send Button */}
          <button
            onClick={handlePublishSos}
            disabled={isSubmitting || !canPublishAtRender}
            className="w-full py-3 px-4 rounded-2xl bg-danger hover:bg-danger-strong text-white font-bold text-sm shadow-[0_8px_24px_rgba(255,59,48,0.4)] transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? (
              <span>Отправка SOS...</span>
            ) : (
              <>
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                <span>Опубликовать SOS-запрос помощи</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
