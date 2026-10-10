import React, { useState, useEffect } from 'react';
import { UserProfile, DriverQuestion } from '../../types';
import { X, HelpCircle, MapPin, Send, Radio } from 'lucide-react';
import { QuestionService } from '../../services/questionService';
import { GeocodingService } from '../../services/geocodingService';
import { NotificationService } from '../../services/notificationService';

interface AskQuestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  userCoords: { lat: number; lng: number } | null;
  initialCoords?: { lat: number; lng: number };
  initialAddress?: string;
  onReopenPinPicker?: () => void;
  onQuestionCreated: (question: DriverQuestion) => void;
}

export const AskQuestionModal: React.FC<AskQuestionModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  userCoords,
  initialCoords,
  initialAddress,
  onReopenPinPicker,
  onQuestionCreated,
}) => {
  const [category, setCategory] = useState('Переезд');
  const [questionText, setQuestionText] = useState('');
  const [address, setAddress] = useState('Определение адреса...');
  const [coords, setCoords] = useState<{ lat: number; lng: number }>({
    lat: userCoords?.lat || 55.0084,
    lng: userCoords?.lng || 82.9357,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const categories = [
    'Переезд',
    'АЗС',
    'Дорога',
    'ДТП',
    'Контроль',
    'Проезд',
    'Другое',
  ];

  useEffect(() => {
    if (initialCoords && initialAddress) {
      setCoords(initialCoords);
      setAddress(initialAddress);
    } else if (userCoords) {
      setCoords(userCoords);
      GeocodingService.reverse(userCoords.lat, userCoords.lng).then((addr) => {
        setAddress(addr);
      });
    }
  }, [userCoords, initialCoords, initialAddress, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionText.trim()) return;

    setIsSubmitting(true);
    try {
      const q = await QuestionService.askQuestion(
        {
          category,
          question: questionText,
          latitude: coords.lat,
          longitude: coords.lng,
          address,
        },
        currentUser
      );

      // Trigger Web Push alert to drivers in radius
      await NotificationService.broadcastQuestionAlert(q, currentUser.fullName, userCoords ?? null);

      onQuestionCreated(q);
      onClose();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 select-none">
      <div className="relative w-full max-w-md graphite-sheet rounded-t-[24px] sm:rounded-[24px] overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-200">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-surface-700 border border-white/10 text-accent flex items-center justify-center font-bold">
              <HelpCircle className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white tracking-tight">Задать вопрос водителям</h2>
              <div className="flex items-center gap-1 text-[11px] text-muted">
                <MapPin className="w-3 h-3 text-accent" />
                <span className="truncate max-w-[220px] text-white">{address}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full bg-white/5 text-muted hover:text-white transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
          {/* Location Pin Selection Deck */}
          <div className="bg-surface-800 p-3 rounded-2xl border border-white/[0.08] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-info/15 border border-info/30 text-info flex items-center justify-center shrink-0">
                <MapPin className="w-4 h-4" />
              </div>
              <div className="truncate">
                <p className="text-[11px] font-medium text-muted">Метка на карте:</p>
                <p className="text-xs font-semibold text-white truncate">{address}</p>
              </div>
            </div>

            {onReopenPinPicker && (
              <button
                type="button"
                onClick={onReopenPinPicker}
                className="px-3 py-1.5 rounded-xl bg-surface-700 hover:bg-white/10 text-info border border-info/40 text-xs font-semibold transition active:scale-95 shrink-0 cursor-pointer"
              >
                Изменить точку
              </button>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-2">
              Категория
            </label>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-xl transition-all ${
                    category === cat
                      ? 'bg-surface-700 text-white border border-accent/60 shadow-xs'
                      : 'bg-surface-800 text-muted border border-white/[0.06] hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              Ваш вопрос
            </label>
            <textarea
              rows={3}
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder="Например: Переезд сейчас открыт? Есть ли очередь на АЗС?"
              className="w-full text-sm p-3.5 bg-surface-800 border border-white/[0.08] focus:border-accent/60 rounded-xl outline-none resize-none text-white placeholder:text-faint"
              required
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting || !questionText.trim()}
              className="w-full py-3 bg-accent hover:bg-accent-strong text-white font-semibold text-sm rounded-xl transition active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              <span>{isSubmitting ? 'Публикация...' : 'Опубликовать'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
