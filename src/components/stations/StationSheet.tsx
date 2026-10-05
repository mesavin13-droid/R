import React, { useState } from 'react';
import { FuelStation, UserProfile } from '../../types';
import { X, MapPin, Check, Users } from 'lucide-react';
import { StationService } from '../../services/stationService';

interface StationSheetProps {
  station: FuelStation | null;
  onClose: () => void;
  currentUser: UserProfile;
  onStationUpdated: (updatedStation: FuelStation) => void;
}

export const StationSheet: React.FC<StationSheetProps> = ({
  station,
  onClose,
  currentUser,
  onStationUpdated,
}) => {
  const [isReporting, setIsReporting] = useState(false);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  if (!station) return null;

  const handleAnimatedClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
    }, 240);
  };

  const getTimeAgo = (dateStr: string) => {
    const elapsedMs = Date.now() - new Date(dateStr).getTime();
    const mins = Math.max(0, Math.round(elapsedMs / (60 * 1000)));
    if (mins < 1) return 'только что';
    if (mins < 60) return `${mins} мин`;
    const hours = Math.round(mins / 60);
    return `${hours} ч`;
  };

  const handleReportQueue = (status: 'none' | 'small' | 'large') => {
    setIsReporting(true);
    try {
      StationService.reportQueue(station.id, status, currentUser);
      const updated = {
        ...station,
        queueStatus: status,
        lastReportedAt: new Date().toISOString(),
        observationsCount: (station.observationsCount || 0) + 1,
      };
      onStationUpdated(updated);
      setSuccessNotice('Статус очереди обновлён');
      setTimeout(() => setSuccessNotice(null), 2500);
    } finally {
      setIsReporting(false);
    }
  };

  const getQueueBadge = () => {
    switch (station.queueStatus) {
      case 'none':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#34C759]/10 text-[#34C759] text-xs font-medium border border-[#34C759]/20">
            <span className="w-1.5 h-1.5 rounded-full bg-[#34C759]"></span>
            Свободно
          </span>
        );
      case 'small':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#E5A93C]/10 text-[#E5A93C] text-xs font-medium border border-[#E5A93C]/20">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E5A93C]"></span>
            2–4 авто
          </span>
        );
      case 'large':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#FF453A]/10 text-[#FF453A] text-xs font-medium border border-[#FF453A]/20">
            <span className="w-1.5 h-1.5 rounded-full bg-[#FF453A]"></span>
            Большая очередь
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 md:inset-x-auto md:right-4 md:bottom-20 md:top-20 md:w-96 flex flex-col justify-end pointer-events-none select-none">
      {/* Dynamic Depth Backdrop with Blur */}
      <div 
        onClick={handleAnimatedClose}
        className={`fixed inset-0 bg-black/55 md:hidden pointer-events-auto transition-opacity duration-300 ${
          isClosing ? 'opacity-0' : 'animate-backdrop-enter opacity-100'
        }`}
      />

      {/* Expressive Spring Depth Sheet Container */}
      <div
        className={`relative w-full graphite-sheet-depth rounded-t-[28px] md:rounded-[28px] flex flex-col overflow-hidden pointer-events-auto transition-all duration-250 ease-in ${
          isClosing
            ? 'translate-y-full opacity-0'
            : 'animate-sheet-enter'
        }`}
      >
        {/* Top Edge Luster Accent */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none" />

        {/* Drag Handle */}
        <div className="flex justify-center pt-2.5 pb-1 md:hidden">
          <div className="w-11 h-1.2 bg-white/25 rounded-full"></div>
        </div>

        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/[0.08] flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2 py-0.5 rounded-lg bg-[#20242A] text-[#9AA0A8] border border-white/5 text-[10px] font-medium">
                {station.brand}
              </span>
              <span className="text-[11px] text-[#9AA0A8]">
                {getTimeAgo(station.lastReportedAt)} назад
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-semibold text-white leading-tight">
              {station.name}
            </h2>
            <div className="flex items-center gap-1 text-xs text-[#9AA0A8] mt-1">
              <MapPin className="w-3.5 h-3.5 text-[#4B8DFF] shrink-0" />
              <span className="truncate text-white">{station.address}</span>
            </div>
          </div>
          <button
            onClick={handleAnimatedClose}
            className="p-1.5 rounded-full bg-white/5 text-[#9AA0A8] hover:text-white transition active:scale-90"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 space-y-4">
          {successNotice && (
            <div className="p-3 rounded-xl bg-[#4B8DFF]/15 border border-[#4B8DFF]/30 text-xs text-white font-medium flex items-center gap-2">
              <Check className="w-4 h-4 text-[#4B8DFF] shrink-0" />
              <span>{successNotice}</span>
            </div>
          )}

          {/* Current Queue Status */}
          <div className="p-3.5 bg-[#181B1F] rounded-2xl border border-white/[0.06] flex items-center justify-between">
            <div>
              <p className="text-[10px] text-[#9AA0A8] uppercase tracking-wider font-medium">Очередь сейчас</p>
              <div className="mt-1">{getQueueBadge()}</div>
            </div>
            <div className="text-right">
              <p className="text-base font-bold text-white">
                {station.observationsCount || 12}
              </p>
              <p className="text-[10px] uppercase font-normal tracking-wider text-[#9AA0A8]">отметок</p>
            </div>
          </div>

          {/* Fuel Prices in Dark Grid */}
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wider text-[#9AA0A8] mb-2">
              Цены на топливо
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {station.fuelTypes.ai92 && (
                <div className="p-2.5 bg-[#181B1F] rounded-xl border border-white/[0.06] flex justify-between items-center text-xs">
                  <span className="text-[#9AA0A8]">АИ-92</span>
                  <span className="font-semibold text-white">{station.fuelTypes.ai92.toFixed(2)} ₽</span>
                </div>
              )}
              {station.fuelTypes.ai95 && (
                <div className="p-2.5 bg-[#181B1F] rounded-xl border border-white/[0.06] flex justify-between items-center text-xs">
                  <span className="text-[#9AA0A8]">АИ-95</span>
                  <span className="font-semibold text-white">{station.fuelTypes.ai95.toFixed(2)} ₽</span>
                </div>
              )}
              {station.fuelTypes.ai98 && (
                <div className="p-2.5 bg-[#181B1F] rounded-xl border border-white/[0.06] flex justify-between items-center text-xs">
                  <span className="text-[#9AA0A8]">АИ-98</span>
                  <span className="font-semibold text-white">{station.fuelTypes.ai98.toFixed(2)} ₽</span>
                </div>
              )}
              {station.fuelTypes.ai100 && (
                <div className="p-2.5 bg-[#181B1F] rounded-xl border border-white/[0.06] flex justify-between items-center text-xs">
                  <span className="text-[#9AA0A8]">АИ-100</span>
                  <span className="font-semibold text-white">{station.fuelTypes.ai100.toFixed(2)} ₽</span>
                </div>
              )}
              {station.fuelTypes.dt && (
                <div className="p-2.5 bg-[#181B1F] rounded-xl border border-white/[0.06] flex justify-between items-center text-xs">
                  <span className="text-[#9AA0A8]">Дизель</span>
                  <span className="font-semibold text-white">{station.fuelTypes.dt.toFixed(2)} ₽</span>
                </div>
              )}
            </div>
          </div>

          {/* 1-Tap Queue Reporter */}
          <div className="pt-2 border-t border-white/[0.08] safe-bottom">
            <p className="text-xs font-medium text-[#9AA0A8] mb-2.5 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-[#4B8DFF]" />
              <span>Отметить очередь в 1 тап:</span>
            </p>

            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => handleReportQueue('none')}
                disabled={isReporting}
                className="py-2.5 px-2 text-xs font-medium text-white bg-[#181B1F] hover:border-[#34C759]/50 border border-white/[0.08] rounded-xl transition active:scale-95 text-center"
              >
                Нет
              </button>
              <button
                onClick={() => handleReportQueue('small')}
                disabled={isReporting}
                className="py-2.5 px-2 text-xs font-medium text-white bg-[#181B1F] hover:border-[#E5A93C]/50 border border-white/[0.08] rounded-xl transition active:scale-95 text-center"
              >
                2–4 авто
              </button>
              <button
                onClick={() => handleReportQueue('large')}
                disabled={isReporting}
                className="py-2.5 px-2 text-xs font-medium text-white bg-[#181B1F] hover:border-[#FF453A]/50 border border-white/[0.08] rounded-xl transition active:scale-95 text-center"
              >
                Большая
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
