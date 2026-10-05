import React, { useState } from 'react';
import { RoadEvent, RoutePlan } from '../../types';
import { 
  Navigation, AlertTriangle, RotateCcw, Car, ArrowRight 
} from 'lucide-react';
import { RoutingService } from '../../services/routingService';

interface RoutePlannerProps {
  activeEvents: RoadEvent[];
  activeRoute: RoutePlan | null;
  onSetRoute: (route: RoutePlan | null) => void;
  onClose: () => void;
  userCoords: { lat: number; lng: number } | null;
}

const PRESET_PLACES = [
  { name: 'пл. Карла Маркса', coords: [54.9830, 82.8940] as [number, number] },
  { name: 'Речной вокзал', coords: [55.0080, 82.9400] as [number, number] },
  { name: 'пл. Ленина (Центр)', coords: [55.0302, 82.9205] as [number, number] },
  { name: 'Академгородок', coords: [54.8510, 83.1120] as [number, number] },
  { name: 'ул. Станционная', coords: [54.9815, 82.8680] as [number, number] },
];

export const RoutePlanner: React.FC<RoutePlannerProps> = ({
  activeEvents,
  activeRoute,
  onSetRoute,
  onClose,
  userCoords,
}) => {
  const [fromText, setFromText] = useState('Моё местоположение (пл. Маркса)');
  const [toText, setToText] = useState('Речной вокзал (Большевистская)');
  const [fromCoords] = useState<[number, number]>([
    userCoords?.lat || 54.9830,
    userCoords?.lng || 82.8940,
  ]);
  const [toCoords, setToCoords] = useState<[number, number]>([55.0080, 82.9400]);
  const [isCalculating, setIsCalculating] = useState(false);

  const handleCalculate = async () => {
    setIsCalculating(true);
    try {
      const plan = await RoutingService.calculateRoute(
        fromCoords,
        toCoords,
        fromText,
        toText,
        activeEvents
      );
      onSetRoute(plan);
    } catch {
      alert('Ошибка при построении маршрута');
    } finally {
      setIsCalculating(false);
    }
  };

  const handleSelectToPreset = (place: typeof PRESET_PLACES[0]) => {
    setToText(place.name);
    setToCoords(place.coords);
  };

  return (
    <div className="h-full flex flex-col bg-[#111315] overflow-hidden pb-16 select-none">
      {/* Top Header */}
      <div className="p-4 sm:p-5 bg-[#181B1F]/80 backdrop-blur-2xl border-b border-white/[0.08]">
        <div className="flex items-center justify-between mb-3.5 max-w-2xl mx-auto">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#20242A] border border-white/10 text-[#4B8DFF] flex items-center justify-center font-bold">
              <Navigation className="w-4 h-4 fill-current" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-semibold text-white tracking-tight leading-tight">
                Навигация и дорожные риски
              </h1>
              <p className="text-xs text-[#9AA0A8]">
                Анализ переездов, заторов и постов на пути
              </p>
            </div>
          </div>
        </div>

        {/* Automotive Inputs Card */}
        <div className="space-y-2 bg-[#181B1F] p-3.5 rounded-2xl border border-white/[0.08] max-w-2xl mx-auto">
          <div className="flex items-center gap-2.5 bg-[#111315] px-3.5 py-2.5 rounded-xl border border-white/[0.06]">
            <div className="w-2 h-2 rounded-full bg-[#4B8DFF] shrink-0"></div>
            <input
              type="text"
              value={fromText}
              onChange={(e) => setFromText(e.target.value)}
              placeholder="Откуда..."
              className="w-full text-xs sm:text-sm font-medium bg-transparent outline-none text-white"
            />
          </div>

          <div className="flex items-center gap-2.5 bg-[#111315] px-3.5 py-2.5 rounded-xl border border-white/[0.06]">
            <div className="w-2 h-2 rounded-full bg-[#FF453A] shrink-0"></div>
            <input
              type="text"
              value={toText}
              onChange={(e) => setToText(e.target.value)}
              placeholder="Куда..."
              className="w-full text-xs sm:text-sm font-medium bg-transparent outline-none text-white"
            />
          </div>

          {/* Quick presets */}
          <div className="pt-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <span className="text-[10px] text-[#5F656D] uppercase tracking-wider font-semibold shrink-0">Куда:</span>
            {PRESET_PLACES.map((p) => (
              <button
                key={p.name}
                onClick={() => handleSelectToPreset(p)}
                className="px-2.5 py-1 text-xs font-normal bg-[#20242A] text-[#9AA0A8] rounded-lg hover:text-white border border-white/[0.06] whitespace-nowrap transition active:scale-95"
              >
                {p.name.split(' ')[0]}
              </button>
            ))}
          </div>

          <div className="pt-2 flex items-center gap-2">
            <button
              onClick={handleCalculate}
              disabled={isCalculating}
              className="flex-1 py-3 bg-[#4B8DFF] hover:bg-[#3C7AE6] text-white font-semibold text-xs sm:text-sm rounded-xl transition active:scale-95 flex items-center justify-center gap-2 disabled:opacity-40"
            >
              <Car className="w-4 h-4" />
              <span>{isCalculating ? 'Расчёт...' : 'Построить маршрут'}</span>
            </button>

            {activeRoute && (
              <button
                onClick={() => onSetRoute(null)}
                className="p-3 bg-[#20242A] hover:bg-white/10 text-[#9AA0A8] hover:text-white rounded-xl transition active:scale-95 border border-white/5"
                title="Сбросить маршрут"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Route Details & Risks */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-2xl mx-auto w-full">
        {activeRoute ? (
          <div className="space-y-4">
            {/* Automotive Summary Card */}
            <div className="bg-[#181B1F] p-4 sm:p-5 rounded-2xl border border-white/[0.08] flex items-center justify-between">
              <div>
                <p className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                  {activeRoute.durationMinutes} мин
                </p>
                <p className="text-xs text-[#9AA0A8] mt-0.5">
                  {activeRoute.distanceKm} км · с учётом дорожных событий
                </p>
              </div>

              <button
                onClick={onClose}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-[#4B8DFF] hover:bg-[#3C7AE6] text-white text-xs font-semibold rounded-xl transition active:scale-95"
              >
                <span>На карте</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Risks section */}
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <AlertTriangle className="w-3.5 h-3.5 text-[#E5A93C]" />
                <h3 className="text-xs font-medium uppercase tracking-wider text-[#9AA0A8]">
                  По маршруту ({activeRoute.risks.length})
                </h3>
              </div>

              {activeRoute.risks.length === 0 ? (
                <div className="p-4 bg-[#181B1F] rounded-2xl border border-white/[0.06] text-center">
                  <p className="text-xs font-medium text-[#34C759]">
                    Маршрут свободен
                  </p>
                  <p className="text-[11px] text-[#9AA0A8] mt-0.5">
                    Переезды открыты, заторов и перекрытий не обнаружено
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {activeRoute.risks.map((risk) => (
                    <div
                      key={risk.id}
                      className="p-3.5 bg-[#181B1F] rounded-2xl border border-white/[0.06] flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-[#20242A] border border-white/[0.08] flex items-center justify-center text-sm">
                          {risk.type === 'crossing' && '🚧'}
                          {risk.type === 'accident' && '🚗'}
                          {risk.type === 'patrol' && '👮'}
                          {risk.type === 'road' && '🛣️'}
                          {risk.type === 'fuel' && '⛽'}
                          {risk.type === 'hazard' && '🚚'}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-white leading-tight">
                            {risk.title}
                          </p>
                          <p className="text-[11px] text-[#9AA0A8] truncate max-w-[200px]">
                            {risk.address} · {risk.distanceFromStartKm} км
                          </p>
                        </div>
                      </div>

                      {risk.estimatedDelayMinutes > 0 && (
                        <span className="text-xs font-semibold text-[#E5A93C] bg-[#E5A93C]/10 px-2.5 py-1 rounded-lg border border-[#E5A93C]/20 whitespace-nowrap">
                          +{risk.estimatedDelayMinutes} мин
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-16 px-4">
            <div className="w-10 h-10 rounded-2xl bg-[#20242A] border border-white/10 text-[#4B8DFF] mx-auto flex items-center justify-center mb-3">
              <Navigation className="w-5 h-5 fill-current" />
            </div>
            <p className="text-sm font-semibold text-white">Маршрут пока не построен</p>
            <p className="text-xs text-[#9AA0A8] mt-1 mb-4">
              Укажите точки для расчёта времени и проверки рисков
            </p>
            <button
              onClick={handleCalculate}
              className="px-4 py-2 bg-[#4B8DFF] text-white text-xs font-medium rounded-xl"
            >
              Рассчитать маршрут
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
