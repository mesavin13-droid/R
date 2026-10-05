import React, { useState } from 'react';
import { UserProfile, RoadEvent } from '../../types';
import { X, AlertTriangle, ShieldAlert, Check, MapPin, Sparkles } from 'lucide-react';
import { EventService } from '../../services/eventService';
import { GeocodingService } from '../../services/geocodingService';

interface QuickSosModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  userCoords: { lat: number; lng: number } | null;
  onSosCreated: (event: RoadEvent) => void;
}

export const QuickSosModal: React.FC<QuickSosModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  userCoords,
  onSosCreated,
}) => {
  const [selectedSubtype, setSelectedSubtype] = useState<string>('battery');
  const [customComment, setCustomComment] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const sosOptions = [
    { id: 'battery', icon: '🔋', title: 'Прикурить АКБ', desc: 'Сдох аккумулятор, нужны провода' },
    { id: 'tow', icon: '🛞', title: 'Застрял / Нужен трос', desc: 'Буксировка или тросом вытащить' },
    { id: 'wheel', icon: '🔧', title: 'Пробил колесо', desc: 'Нужен домкрат или баллонник' },
    { id: 'fuel_empty', icon: '⛽', title: 'Закончился бензин', desc: 'Нужно подвезти 3-5л топлива' },
    { id: 'snow_mud', icon: '🚜', title: 'Застрял в снегу/грязи', desc: 'Нужен джип / вытащить лебёдкой' },
    { id: 'other_help', icon: '🤝', title: 'Другая помощь', desc: 'Нужна помощь любого водителя' },
  ];

  const handlePublishSos = async () => {
    setIsSubmitting(true);
    try {
      const option = sosOptions.find((o) => o.id === selectedSubtype) || sosOptions[0];
      const coords = userCoords || { lat: 55.0084, lng: 82.9357 };
      const address = await GeocodingService.reverse(coords.lat, coords.lng);

      const title = `${option.title} ${option.icon}`;
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
      <div className="relative w-full max-w-md bg-[#181B1F] border border-[#FF3B30]/50 rounded-3xl shadow-[0_16px_48px_rgba(255,59,48,0.3)] overflow-hidden flex flex-col">
        {/* Top Critical Alert Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-[#FF3B30]/25 via-[#181B1F] to-[#181B1F] border-b border-[#FF3B30]/30 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-[#FF3B30] text-white flex items-center justify-center text-lg font-bold shadow-md animate-pulse">
              🆘
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-snug">
                Срочный SOS-запрос помощи
              </h3>
              <p className="text-[11px] text-[#FF3B30] font-medium">
                Мгновенно уведомит водителей поблизости
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-[#9AA0A8] hover:text-white transition active:scale-90"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto max-h-[75vh]">
          <p className="text-xs text-[#9AA0A8]">
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
                      ? 'bg-[#FF3B30]/15 border-[#FF3B30] shadow-[0_4px_16px_rgba(255,59,48,0.25)]'
                      : 'bg-[#20242A] hover:bg-[#282E36] border-white/10'
                  }`}
                >
                  <span className="text-2xl shrink-0">{opt.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-white truncate">{opt.title}</p>
                    <p className="text-[10px] text-[#9AA0A8] leading-tight mt-0.5 line-clamp-2">{opt.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Optional Comment Input */}
          <div className="space-y-1.5 pt-1">
            <label className="text-[11px] text-[#9AA0A8] font-medium block">
              Уточнение (марка машины, детали местоположения):
            </label>
            <input
              type="text"
              value={customComment}
              onChange={(e) => setCustomComment(e.target.value)}
              placeholder="Например: Синий Солярис, около АЗС, есть провода"
              className="w-full bg-[#111315] border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-[#5F656D] focus:outline-none focus:border-[#FF3B30]/60 transition"
            />
          </div>

          {/* Location Badge */}
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[#111315] border border-white/5 text-[11px] text-[#9AA0A8]">
            <MapPin className="w-3.5 h-3.5 text-[#FF3B30] shrink-0" />
            <span className="truncate">
              {userCoords ? `Точка GPS: ${userCoords.lat.toFixed(4)}, ${userCoords.lng.toFixed(4)}` : 'Локация: По центру карты'}
            </span>
          </div>

          {/* Critical SOS Send Button */}
          <button
            onClick={handlePublishSos}
            disabled={isSubmitting}
            className="w-full py-3 px-4 rounded-2xl bg-[#FF3B30] hover:bg-[#E03126] text-white font-bold text-sm shadow-[0_8px_24px_rgba(255,59,48,0.4)] transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? (
              <span>Отправка SOS...</span>
            ) : (
              <>
                <span className="text-base">🚨</span>
                <span>Опубликовать SOS-запрос помощи</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
