import React from 'react';
import { X } from 'lucide-react';
import { EventType } from '../../types';
import { colors } from '../../theme/tokens';
import { getRoadLivePinSvg } from '../map/markerVisuals';

interface ReportTypePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (type: EventType) => void;
}

const eventTypes: {
  type: EventType;
  label: string;
  description: string;
  color: string;
  critical?: boolean;
}[] = [
  { type: 'crossing', label: 'Переезд', description: 'Открыт, закрыт или очередь', color: colors.warningStrong },
  { type: 'accident', label: 'ДТП', description: 'Авария или занята полоса', color: colors.danger, critical: true },
  { type: 'patrol', label: 'Дорожный контроль', description: 'Пост, экипаж или камера', color: colors.info2 },
  { type: 'fuel', label: 'АЗС', description: 'Очередь и наличие топлива', color: colors.success },
  { type: 'road', label: 'Дорога / ремонт', description: 'Яма, ремонт или гололёд', color: colors.roadBlue },
  { type: 'traffic_light', label: 'Светофор', description: 'Не работает или мигает', color: colors.amber },
  { type: 'hazard', label: 'Препятствие', description: 'Предмет или сломанное авто', color: colors.danger, critical: true },
  { type: 'assistance', label: 'Помощь SOS', description: 'Нужна помощь на дороге', color: colors.danger, critical: true },
  { type: 'other', label: 'Другое', description: 'Дорожная обстановка', color: colors.muted },
];

export const ReportTypePicker: React.FC<ReportTypePickerProps> = ({ isOpen, onClose, onSelect }) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-sm p-0 sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <section
        className="rl-dialog-surface w-full max-w-lg max-h-[88dvh] overflow-hidden rounded-t-[24px] sm:rounded-[24px] graphite-sheet-depth safe-bottom"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-type-picker-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="rl-dialog-header flex items-center justify-between gap-3 border-b border-white/10">
          <div>
            <p className="text-[10px] uppercase tracking-[.16em] font-bold text-accent mb-1">ROAD LIVE</p>
            <h2 id="report-type-picker-title" className="text-lg font-bold text-white">Что случилось на дороге?</h2>
            <p className="text-xs text-muted mt-1">Выбери категорию — на карте появится соответствующая метка.</p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 w-9 h-9 rounded-xl bg-white/5 border border-white/10 text-muted flex items-center justify-center" aria-label="Закрыть выбор категории">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="rl-report-type-grid grid grid-cols-2 overflow-y-auto max-h-[calc(88dvh-100px)]">
          {eventTypes.map((item) => (
            <button
              key={item.type}
              type="button"
              onClick={() => onSelect(item.type)}
              className="rl-report-option text-left flex items-center active:scale-[.98] transition"
              aria-label={`Выбрать категорию: ${item.label}`}
            >
              <span
                className="rl-report-icon flex items-center justify-center shrink-0"
                aria-hidden="true"
                dangerouslySetInnerHTML={{
                  __html: getRoadLivePinSvg(item.type, '', item.color, 0, false, Boolean(item.critical)),
                }}
              />
              <span className="min-w-0">
                <span className="rl-report-label">{item.label}</span>
                <span className="rl-report-description">{item.description}</span>
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};
