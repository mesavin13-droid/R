import React, { useState, useEffect } from 'react';
import { EventType, UserProfile, RoadEvent } from '../../types';
import { 
  X, MapPin, AlertCircle, ArrowLeft, Check, Navigation, ShieldCheck, ShieldAlert, Map as MapIcon
} from 'lucide-react';
import { EventService } from '../../services/eventService';
import { GeocodingService } from '../../services/geocodingService';

interface CreateEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  userCoords: { lat: number; lng: number } | null;
  onEventCreated: (event: RoadEvent) => void;
  initialCoords?: { lat: number; lng: number } | null;
  initialAddress?: string;
  onReopenPinPicker?: () => void;
}

export const CreateEventModal: React.FC<CreateEventModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  userCoords,
  onEventCreated,
  initialCoords,
  initialAddress,
  onReopenPinPicker,
}) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedType, setSelectedType] = useState<EventType | null>(null);
  const [subType, setSubType] = useState<string>('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState(initialAddress || 'Определение адреса...');
  const [direction, setDirection] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number }>({
    lat: initialCoords?.lat || userCoords?.lat || 55.0084,
    lng: initialCoords?.lng || userCoords?.lng || 82.9357,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [publishedNotice, setPublishedNotice] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<RoadEvent | null>(null);

  // Sync initial coords & address
  useEffect(() => {
    if (initialCoords) {
      setCoords(initialCoords);
      if (initialAddress) {
        setAddress(initialAddress);
      } else {
        GeocodingService.reverse(initialCoords.lat, initialCoords.lng).then((addr) => {
          setAddress(addr);
        });
      }
    } else if (userCoords) {
      setCoords(userCoords);
      GeocodingService.reverse(userCoords.lat, userCoords.lng).then((addr) => {
        setAddress(addr);
      });
    }
  }, [initialCoords, initialAddress, userCoords, isOpen]);

  // Compute distance from user GPS
  const distanceFromUserMeters = userCoords
    ? EventService.calculateDistanceMeters(coords.lat, coords.lng, userCoords.lat, userCoords.lng)
    : 0;

  const isWithin1000m = userCoords ? distanceFromUserMeters <= 1000 : true;

  if (!isOpen) return null;

  const handleSnapToUser = () => {
    if (userCoords) {
      setCoords(userCoords);
      GeocodingService.reverse(userCoords.lat, userCoords.lng).then((addr) => {
        setAddress(addr);
      });
    }
  };

  const categories: {
    type: EventType;
    label: string;
    icon: string;
    subTypes: { id: string; label: string; defaultTitle: string }[];
  }[] = [
    {
      type: 'assistance',
      label: '🆘 Помощь на дороге',
      icon: '🆘',
      subTypes: [
        { id: 'battery', label: 'Прикурить (АКБ)', defaultTitle: 'Нужно прикурить аккумулятор 🔋' },
        { id: 'tow', label: 'Застрял / Нужен трос', defaultTitle: 'Нужен трос / Буксировка 🛞' },
        { id: 'wheel', label: 'Пробил колесо / Домкрат', defaultTitle: 'Нужен домкрат / Помощь с колесом 🔧' },
        { id: 'fuel_empty', label: 'Закончился бензин', defaultTitle: 'Закончился бензин (нужно подвезти) ⛽' },
        { id: 'snow_mud', label: 'Вытащить из снега/грязи', defaultTitle: 'Застрял в снегу/грязи 🚜' },
        { id: 'other_help', label: 'Другая помощь', defaultTitle: 'Нужна помощь водителей 🤝' },
      ],
    },
    {
      type: 'road',
      label: 'Ремонт / Дорога',
      icon: '🛣️',
      subTypes: [
        { id: 'repair', label: 'Ремонт дороги', defaultTitle: 'Ремонт дороги' },
        { id: 'pothole', label: 'Глубокая яма', defaultTitle: 'Глубокая яма' },
        { id: 'ice', label: 'Гололедица', defaultTitle: 'Гололедица' },
      ],
    },
    {
      type: 'crossing',
      label: 'Переезд',
      icon: '🚧',
      subTypes: [
        { id: 'closed', label: 'Закрыт', defaultTitle: 'Переезд закрыт' },
        { id: 'open', label: 'Открыт', defaultTitle: 'Переезд открыт' },
        { id: 'large_queue', label: 'Очередь', defaultTitle: 'Очередь на переезде' },
      ],
    },
    {
      type: 'accident',
      label: 'ДТП',
      icon: '🚗',
      subTypes: [
        { id: 'minor', label: 'Мелкое ДТП', defaultTitle: 'Мелкое ДТП' },
        { id: 'lane_blocked', label: 'Занята полоса', defaultTitle: 'ДТП: занята полоса' },
        { id: 'road_blocked', label: 'Перекрыто', defaultTitle: 'ДТП: дорога перекрыта' },
      ],
    },
    {
      type: 'patrol',
      label: 'Контроль',
      icon: '👮',
      subTypes: [
        { id: 'check', label: 'Дорожный контроль', defaultTitle: 'Дорожный контроль' },
        { id: 'radar', label: 'Скорость / Камера', defaultTitle: 'Контроль скорости' },
      ],
    },
    {
      type: 'traffic_light',
      label: 'Светофор',
      icon: '🚦',
      subTypes: [
        { id: 'broken', label: 'Не работает', defaultTitle: 'Светофор не работает' },
        { id: 'blinking', label: 'Мигает жёлтым', defaultTitle: 'Светофор мигает жёлтым' },
      ],
    },
    {
      type: 'hazard',
      label: 'Препятствие',
      icon: '🚚',
      subTypes: [
        { id: 'truck', label: 'Поломка фуры', defaultTitle: 'Сломалась фура' },
        { id: 'obstacle', label: 'Предмет на полосе', defaultTitle: 'Препятствие на дороге' },
      ],
    },
    {
      type: 'fuel',
      label: 'АЗС',
      icon: '⛽',
      subTypes: [
        { id: 'none', label: 'Очереди нет', defaultTitle: 'АЗС: очереди нет' },
        { id: 'small', label: 'Небольшая', defaultTitle: 'АЗС: небольшая очередь' },
        { id: 'large', label: 'Большая очередь', defaultTitle: 'АЗС: большая очередь' },
      ],
    },
    {
      type: 'other',
      label: 'Другое',
      icon: '❓',
      subTypes: [
        { id: 'other', label: 'Обстановка', defaultTitle: 'Дорожная обстановка' },
      ],
    },
  ];

  const handleQuickPreset = async (
    type: EventType,
    presetSubType: string,
    defaultTitle: string
  ) => {
    setSelectedType(type);
    setSubType(presetSubType);
    setTitle(defaultTitle);

    const duplicate = EventService.findPossibleDuplicate(type, coords.lat, coords.lng);
    if (duplicate) {
      setDuplicateWarning(duplicate);
      return;
    }

    await submitEvent(type, presetSubType, defaultTitle, '');
  };

  const submitEvent = async (
    eType: EventType,
    eSubType: string,
    eTitle: string,
    eDesc: string
  ) => {
    setIsSubmitting(true);
    try {
      const created = await EventService.createEvent(
        {
          type: eType,
          subType: eSubType,
          title: eTitle,
          description: eDesc,
          latitude: coords.lat,
          longitude: coords.lng,
          address,
          direction,
        },
        currentUser,
        userCoords
      );
      setPublishedNotice(true);
      setTimeout(() => {
        onEventCreated(created);
        onClose();
      }, 600);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedType || !title.trim()) return;
    submitEvent(selectedType, subType, title, description);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 select-none">
      <div className="relative w-full max-w-lg graphite-sheet-depth rounded-t-[28px] sm:rounded-[24px] overflow-hidden flex flex-col max-h-[92vh] safe-bottom animate-in slide-in-from-bottom duration-250">
        {/* Mobile Drag Handle */}
        <div className="flex justify-center pt-2.5 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-white/20 rounded-full"></div>
        </div>

        {publishedNotice ? (
          <div className="p-12 text-center flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-full bg-accent/20 text-accent flex items-center justify-center">
              <Check className="w-6 h-6 stroke-[3]" />
            </div>
            <p className="text-base font-semibold text-white">Опубликовано</p>
            <p className="text-xs text-muted">
              {isWithin1000m
                ? 'Метка подтверждена вашим присутствием (до 1000 м)'
                : 'Метка опубликована с пометкой дистанционного сообщения'}
            </p>
          </div>
        ) : (
          <>
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-white/[0.08] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                {step > 1 && (
                  <button
                    onClick={() => setStep(1)}
                    className="p-1.5 text-muted hover:text-white rounded-full transition active:scale-95"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                )}
                <div>
                  <h2 className="text-base sm:text-lg font-semibold text-ink">
                    {step === 1 ? 'Сообщить о событии' : 'Детали события'}
                  </h2>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted mt-0.5">
                    <MapPin className="w-3.5 h-3.5 text-accent shrink-0" />
                    <span className="truncate max-w-[200px] sm:max-w-[280px] text-white font-medium">
                      {address}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-full bg-white/5 text-muted hover:text-white transition active:scale-90"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Selected Location Strip with Map Adjustment Button */}
            <div className="px-4 sm:px-5 py-3 bg-graphite-900 border-b border-white/[0.06] space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  {isWithin1000m ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-success/15 text-success border border-success/30 text-xs font-medium">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>В радиусе {distanceFromUserMeters < 1000 ? `${distanceFromUserMeters} м` : '1 км'} (достоверно)</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-warning/15 text-warning border border-warning/30 text-xs font-medium">
                      <ShieldAlert className="w-3.5 h-3.5" />
                      <span>Вне радиуса 1000 м ({(distanceFromUserMeters / 1000).toFixed(1)} км)</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  {onReopenPinPicker && (
                    <button
                      type="button"
                      onClick={onReopenPinPicker}
                      className="text-xs text-accent hover:text-white font-medium px-2.5 py-1.5 rounded-xl bg-accent/10 hover:bg-accent/20 border border-accent/30 transition active:scale-95 flex items-center gap-1.5"
                    >
                      <MapIcon className="w-3.5 h-3.5" />
                      <span>Указать на карте</span>
                    </button>
                  )}

                  {userCoords && !isWithin1000m && (
                    <button
                      type="button"
                      onClick={handleSnapToUser}
                      className="text-xs text-white bg-accent hover:bg-accent-strong px-2.5 py-1.5 rounded-xl font-medium transition active:scale-95 flex items-center gap-1"
                    >
                      <Navigation className="w-3 h-3" />
                      <span>Ко мне</span>
                    </button>
                  )}
                </div>
              </div>

              {/* >1000m Distance Warning Notice */}
              {!isWithin1000m && (
                <div className="p-3 rounded-2xl bg-warning/10 border border-warning/30 text-xs text-warning leading-relaxed flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-warning" />
                  <div className="space-y-1">
                    <p className="font-semibold text-white">
                      Информация не может считаться гарантированно достоверной
                    </p>
                    <p className="text-muted">
                      Вы находитесь в <strong>{(distanceFromUserMeters / 1000).toFixed(1)} км</strong> от выбранной точки (порог достоверности — 1000 м). Метка будет отмечена для других водителей как дистанционная.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Duplicate Warning */}
            {duplicateWarning && (
              <div className="p-3.5 bg-surface-800 border-b border-white/10 text-xs">
                <p className="font-medium text-white flex items-center gap-1.5 mb-1">
                  <AlertCircle className="w-4 h-4 text-warning" />
                  Рядом уже есть похожее сообщение:
                </p>
                <p className="text-muted">«{duplicateWarning.title}»</p>
                <div className="flex gap-2 mt-2.5">
                  <button
                    onClick={() => {
                      onEventCreated(duplicateWarning);
                      onClose();
                    }}
                    className="px-3.5 py-1.5 bg-accent text-white rounded-xl font-medium"
                  >
                    Открыть существующее
                  </button>
                  <button
                    onClick={() => {
                      setDuplicateWarning(null);
                      submitEvent(selectedType!, subType, title, description);
                    }}
                    className="px-3.5 py-1.5 bg-white/5 text-muted border border-white/10 rounded-xl"
                  >
                    Опубликовать новое
                  </button>
                </div>
              </div>
            )}

            {/* Content Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-3.5 flex-1">
              {step === 1 && (
                <div className="space-y-3">
                  <p className="text-xs text-muted">
                    Выберите тип события для моментальной публикации в 1 тап:
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {categories.map((cat) => {
                      const isSelected = selectedType === cat.type;
                      return (
                        <div
                          key={cat.type}
                          className={`p-3.5 rounded-2xl bg-surface-800 transition border ${
                            isSelected ? 'border-accent' : 'border-white/[0.06] hover:border-white/15'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-2.5">
                            <span className="text-base">{cat.icon}</span>
                            <span className="text-xs font-semibold text-white">{cat.label}</span>
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            {cat.subTypes.map((sub) => (
                              <button
                                key={sub.id}
                                type="button"
                                onClick={() => handleQuickPreset(cat.type, sub.id, sub.defaultTitle)}
                                className="px-3 py-1.5 text-xs font-medium bg-surface-700 text-ink hover:border-accent/60 hover:text-white rounded-xl transition active:scale-95 border border-white/[0.08]"
                              >
                                {sub.label}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedType(cat.type);
                                setSubType(cat.subTypes[0].id);
                                setTitle(cat.subTypes[0].defaultTitle);
                                setStep(2);
                              }}
                              className="px-2 py-1.5 text-xs text-accent hover:underline"
                            >
                              Подробнее...
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {step === 2 && (
                <form onSubmit={handleManualSubmit} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1">
                      Заголовок события
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full text-sm p-3 bg-surface-800 rounded-xl border border-white/[0.08] focus:border-accent/60 outline-none text-white font-medium"
                      placeholder="Например: Ремонт дороги, закрыта правая полоса"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-muted mb-1">
                      Точный адрес (определен по карте)
                    </label>
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full text-sm p-3 bg-surface-800 rounded-xl border border-white/[0.08] focus:border-accent/60 outline-none text-white"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-muted mb-1">
                      Направление движения (необязательно)
                    </label>
                    <input
                      type="text"
                      value={direction}
                      onChange={(e) => setDirection(e.target.value)}
                      placeholder="в сторону центра / из города"
                      className="w-full text-sm p-3 bg-surface-800 rounded-xl border border-white/[0.08] focus:border-accent/60 outline-none text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-muted mb-1">
                      Подробности для водителей
                    </label>
                    <textarea
                      rows={3}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Сняли асфальт, ямы глубиной 10 см, объезжайте через соседнюю улицу..."
                      className="w-full text-sm p-3 bg-surface-800 rounded-xl border border-white/[0.08] focus:border-accent/60 outline-none text-white resize-none"
                    />
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-3.5 bg-accent hover:bg-accent-strong text-white font-semibold text-sm rounded-xl transition active:scale-95 disabled:opacity-40 shadow-xs"
                    >
                      {isSubmitting
                        ? 'Публикация...'
                        : isWithin1000m
                        ? 'Опубликовать подтверждённое событие'
                        : 'Опубликовать дистанционное сообщение'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
