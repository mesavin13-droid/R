import React from 'react';
import {
  AlertTriangle, CircleHelp, Construction, Fuel, LifeBuoy, MapPin,
  ShieldCheck, TrafficCone, TrafficLight, X, type LucideIcon,
} from 'lucide-react';
import { EventType } from '../../types';

interface ReportTypePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (type: EventType) => void;
}

const eventTypes: {type: EventType; label: string; detail: string; Icon: LucideIcon; urgent?: boolean }[] = [
  { type: 'accident', label: 'ДТП', detail: 'Авария, занята полоса', Icon: AlertTriangle, urgent: true },
  { type: 'patrol', label: 'ДПС', detail: 'Дорожный контроль', Icon: ShieldCheck },
  { type: 'hazard', label: 'Опасность', detail: 'Препятствие или предмет', Icon: TrafficCone, urgent: true },
  { type: 'road', label: 'Дорога', detail: 'Ремонт, яма, гололёд', Icon: MapPin },
  { type: 'crossing', label: 'Переезд', detail: 'Очередь, закрыт, открыт', Icon: Construction },
  { type: 'traffic_light', label: 'Светофор', detail: 'Не работает, мигает', Icon: TrafficLight },
  { type: 'fuel', label: 'АЗС', detail: 'Очередь, топливо', Icon: Fuel },
  { type: 'assistance', label: 'Помощь', detail: 'Нужна помощь водителя', Icon: LifeBuoy, urgent: true },
  { type: 'other', label: 'Другое', detail: 'Другая обстановка', Icon: CircleHelp },
];

export const ReportTypePicker: React.FC<ReportTypePickerProps> = ({isOpen, onClose, onSelect}) => {
  if (!isOpen) return null;
  return (
    <div className="rl-report-picker-backdrop" role="presentation" onClick={onClose}>
      <section
        className="rl-report-picker-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rl-report-picker-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="rl-report-picker-head">
          <div>
            <span className="rl-report-picker-kicker">НОВОЕ СОБЫТИЕ</span>
            <h2 id="rl-report-picker-title">Что произошло?</h2>
            <p>Выберите тип события, затем укажите точку на карте.</p>
          </div>
          <button type="button" className="rl-quiet-icon-button" onClick={onClose} aria-label="Закрыть"><X size={19}/></button>
        </header>
        <div className="rl-report-picker-grid">
          {eventTypes.map(({type, label, detail, Icon, urgent}) => (
            <button
              key={type}
              type="button"
              onClick={() => onSelect(type)}
              className="rl-report-picker-option"
              aria-label={`${label}: ${detail}`}
            >
              <span className={'rl-report-picker-icon' + (urgent ? ' is-urgent' : '')}>
                <Icon size={19} strokeWidth={1.9} aria-hidden="true"/>
              </span>
              <span className="rl-report-picker-labels"><strong>{label}</strong><small>{detail}</small></span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};
