import React from 'react';
import { 
  X, ShieldCheck, MapPin, Radio, MessageSquare, 
  HelpCircle, Zap, Users, Award, Bell, CheckCircle2, ChevronRight
} from 'lucide-react';

interface AboutServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutServiceModal: React.FC<AboutServiceModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-xs p-0 sm:p-4 select-none">
      <div className="relative w-full max-w-xl graphite-sheet-depth rounded-t-[28px] sm:rounded-[28px] overflow-hidden flex flex-col max-h-[90vh] safe-bottom animate-in slide-in-from-bottom duration-250">
        {/* Top Edge Luster */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#4B8DFF]/40 to-transparent pointer-events-none" />

        {/* Mobile Drag Handle */}
        <div className="flex justify-center pt-2.5 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-white/20 rounded-full"></div>
        </div>

        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-2xl bg-[#111315] border border-white/10 shadow-md">
              <span className="font-mono font-bold text-sm text-white">R</span>
              <span className="w-2 h-2 rounded-full bg-[#4B8DFF] ml-0.5 animate-pulse"></span>
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-white tracking-tight">
                О сервисе ROADLIVE
              </h2>
              <p className="text-[11px] text-[#9AA0A8]">
                Версия 2.4.0 · Живая дорожная сеть водителей
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-white/5 text-[#9AA0A8] hover:text-white transition active:scale-90"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1 text-xs sm:text-sm text-[#F0F2F5] leading-relaxed">
          {/* Mission statement */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-[#181B1F] to-[#14171B] border border-white/10 shadow-sm space-y-2">
            <div className="flex items-center gap-2 text-[#4B8DFF] font-semibold text-sm">
              <Zap className="w-4 h-4 fill-current" />
              <span>Дорожная обстановка из первых рук</span>
            </div>
            <p className="text-[#9AA0A8] leading-relaxed">
              <strong className="text-white">ROADLIVE</strong> — это независимый водительский сервис реального времени. Водители на дороге мгновенно делятся актуальными событиями: состоянием переездов, ремонтом дорог, ДТП, дорожным контролем, очередями на АЗС и опасностями на трассе.
            </p>
          </div>

          {/* Core Principles */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#9AA0A8]">
              Главные правила и механики сервиса
            </h3>

            {/* Rule 1: Exact Pin Placement */}
            <div className="p-3.5 rounded-2xl bg-[#181B1F] border border-white/[0.06] flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#4B8DFF]/15 text-[#4B8DFF] border border-[#4B8DFF]/25 flex items-center justify-center shrink-0 mt-0.5">
                <MapPin className="w-4 h-4" />
              </div>
              <div className="space-y-1 flex-1">
                <p className="font-semibold text-white">Выбор точки прямо на карте</p>
                <p className="text-xs text-[#9AA0A8]">
                  Вам не нужно вводить адрес вручную: наведите центральный прицел на нужное место на карте, и адрес подставится автоматически.
                </p>
              </div>
            </div>

            {/* Rule 2: 1000m Verification Radius */}
            <div className="p-3.5 rounded-2xl bg-[#181B1F] border border-white/[0.06] flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#34C759]/15 text-[#34C759] border border-[#34C759]/25 flex items-center justify-center shrink-0 mt-0.5">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div className="space-y-1 flex-1">
                <p className="font-semibold text-white">Радиус достоверности — 1000 метров</p>
                <p className="text-xs text-[#9AA0A8]">
                  <span className="text-[#34C759] font-medium">До 1000 м:</span> метка считается подтверждённой вашим присутствием и получает высокий рейтинг доверия.<br />
                  <span className="text-[#E5A93C] font-medium">Свыше 1000 м:</span> сервис предупреждает, что информация дистанционная, чтобы водители знали о возможной неточности.
                </p>
              </div>
            </div>

            {/* Rule 3: 1-Tap Confirmations */}
            <div className="p-3.5 rounded-2xl bg-[#181B1F] border border-white/[0.06] flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#AF52DE]/15 text-[#AF52DE] border border-[#AF52DE]/25 flex items-center justify-center shrink-0 mt-0.5">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div className="space-y-1 flex-1">
                <p className="font-semibold text-white">Подтверждение «Подтверждаю»</p>
                <p className="text-xs text-[#9AA0A8]">
                  Видите актуальное событие по пути? Нажмите кнопку <strong>«Подтверждаю»</strong> в карточке. Это продлевает время жизни события на карте и повышает ваш рейтинг надёжного водителя.
                </p>
              </div>
            </div>

            {/* Rule 4: Real-time Live Chat & Questions */}
            <div className="p-3.5 rounded-2xl bg-[#181B1F] border border-white/[0.06] flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#30B0C7]/15 text-[#30B0C7] border border-[#30B0C7]/25 flex items-center justify-center shrink-0 mt-0.5">
                <Radio className="w-4 h-4" />
              </div>
              <div className="space-y-1 flex-1">
                <p className="font-semibold text-white">Водительский эфир и быстрые вопросы</p>
                <p className="text-xs text-[#9AA0A8]">
                  Вкладка «Эфир» позволяет общаться с водителями на вашем участке дороги, а «Вопросы» — быстро спросить обстановку перед выездом.
                </p>
              </div>
            </div>
          </div>

          {/* Categories Legend */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#9AA0A8]">
              Категории дорожных событий
            </h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-[#181B1F] border border-white/5 flex items-center gap-2">
                <span className="text-base">🚧</span>
                <div>
                  <p className="font-medium text-white">Ж/Д Переезды</p>
                  <p className="text-[10px] text-[#9AA0A8]">Закрыт / открыт / очередь</p>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-[#181B1F] border border-white/5 flex items-center gap-2">
                <span className="text-base">🛣️</span>
                <div>
                  <p className="font-medium text-white">Ремонт дороги</p>
                  <p className="text-[10px] text-[#9AA0A8]">Ямы, работы, гололедица</p>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-[#181B1F] border border-white/5 flex items-center gap-2">
                <span className="text-base">🚗</span>
                <div>
                  <p className="font-medium text-white">ДТП</p>
                  <p className="text-[10px] text-[#9AA0A8]">Занята полоса / перекрыто</p>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-[#181B1F] border border-white/5 flex items-center gap-2">
                <span className="text-base">👮</span>
                <div>
                  <p className="font-medium text-white">Контроль</p>
                  <p className="text-[10px] text-[#9AA0A8]">Посты, радары, проверка</p>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-[#181B1F] border border-white/5 flex items-center gap-2">
                <span className="text-base">⛽</span>
                <div>
                  <p className="font-medium text-white">АЗС и цены</p>
                  <p className="text-[10px] text-[#9AA0A8]">Очереди и стоимость 95/92</p>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-[#181B1F] border border-white/5 flex items-center gap-2">
                <span className="text-base">🚦</span>
                <div>
                  <p className="font-medium text-white">Светофоры</p>
                  <p className="text-[10px] text-[#9AA0A8]">Не работает / мигает</p>
                </div>
              </div>
            </div>
          </div>

          {/* Rating and Reputation */}
          <div className="p-4 rounded-2xl bg-[#181B1F] border border-white/10 space-y-2">
            <div className="flex items-center gap-2 text-[#E5A93C] font-semibold text-xs sm:text-sm">
              <Award className="w-4 h-4 fill-current" />
              <span>Рейтинг водителя</span>
            </div>
            <p className="text-xs text-[#9AA0A8] leading-relaxed">
              Каждое подтверждённое другими водителями сообщение и полезные ответы поднимают ваш рейтинг от «Новичка» до «Эксперта района». Достоверность ваших отметок становится ключевой для автосообщества.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#14171B] border-t border-white/[0.08] flex items-center justify-between safe-bottom">
          <span className="text-[11px] text-[#9AA0A8]">
            ROADLIVE · Дороги под контролем
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-[#4B8DFF] hover:bg-[#3C7AE6] text-white font-medium text-xs transition active:scale-95 shadow-xs"
          >
            Понятно
          </button>
        </div>
      </div>
    </div>
  );
};
