import React, { useState, useEffect } from 'react';
import { UserProfile, RoadEvent, DriverQuestion } from '../../types';
import {
  Star, Check, Info,
  MapPin, ShieldCheck, CheckCircle2, Radio, Zap, Award, HelpCircle, Trash2
} from 'lucide-react';
import { UserService } from '../../services/userService';
import { EventService } from '../../services/eventService';
import { QuestionService } from '../../services/questionService';
import { HolidayDecorator } from '../common/HolidayDecorator';

interface UserProfileModalProps {
  currentUser: UserProfile;
  events: RoadEvent[];
  questions: DriverQuestion[];
  onClose: () => void;
  onOpenAdmin: () => void;
  isAdminAuthorized?: boolean;
  onSettingsChange?: () => void;
}

// Buttery smooth swipe-to-delete container with GPU-accelerated translateX
const SwipeableListItem: React.FC<{
  onDelete: () => void;
  children: React.ReactNode;
}> = ({ onDelete, children }) => {
  const [startX, setStartX] = useState(0);
  const [currentX, setCurrentX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isDeleted, setIsDeleted] = useState(false);

  const threshold = 60; // Offset needed to keep delete button open
  const maxSwipe = 100; // Max visual swipe offset limit

  const handleTouchStart = (e: React.TouchEvent) => {
    setStartX(e.touches[0].clientX);
    setIsSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSwiping) return;
    const diffX = e.touches[0].clientX - startX;
    
    // We only swipe left (negative values)
    if (diffX < 0) {
      setSwipeOffset(Math.max(-maxSwipe, diffX));
    } else {
      setSwipeOffset(Math.min(0, swipeOffset + diffX * 0.2));
    }
  };

  const handleTouchEnd = () => {
    setIsSwiping(false);
    if (swipeOffset < -threshold) {
      setSwipeOffset(-maxSwipe); // snap open
    } else {
      setSwipeOffset(0); // snap closed
    }
  };

  const triggerDelete = () => {
    setIsDeleted(true);
    setTimeout(() => {
      onDelete();
    }, 280); // match animation speed for collapsible fade
  };

  return (
    <div 
      className={`relative overflow-hidden rounded-2xl transition-all duration-300 ${
        isDeleted ? 'max-h-0 opacity-0 mb-0 py-0 border-0 scale-95' : 'max-h-[280px] mb-2.5'
      }`}
    >
      {/* Background Red Delete Button */}
      <div className="absolute inset-0 bg-red-600 flex items-center justify-end px-5 rounded-2xl pointer-events-auto">
        <button
          onClick={triggerDelete}
          className="flex flex-col items-center gap-1 text-white font-bold text-[10px] uppercase active:scale-90 transition cursor-pointer select-none"
        >
          <Trash2 className="w-4.5 h-4.5 animate-pulse text-white" />
          <span>Удалить</span>
        </button>
      </div>

      {/* Foreground Content */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: `translateX(${swipeOffset}px)`,
          transition: isSwiping ? 'none' : 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        className="relative z-10 w-full pointer-events-auto"
      >
        {children}
      </div>
    </div>
  );
};

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  currentUser,
  events,
  questions,
  onClose,
  onOpenAdmin,
  onSettingsChange,
  isAdminAuthorized = false,
}) => {
  const [activeTab, setActiveTab] = useState<'stats' | 'events' | 'questions' | 'answers' | 'about'>('stats');
  const [hideOldEvents, setHideOldEvents] = useState(
    localStorage.getItem('roadlive_hide_old_events') === 'true'
  );

  const [localEvents, setLocalEvents] = useState<RoadEvent[]>([]);
  const [localQuestions, setLocalQuestions] = useState<DriverQuestion[]>([]);
  const [localAnswers, setLocalAnswers] = useState<{ questionId: string; questionText: string; answer: any }[]>([]);

  useEffect(() => {
    setLocalEvents(events.filter((e) => e.userId === currentUser.id));
    setLocalQuestions(questions.filter((q) => q.userId === currentUser.id));

    const ansList: { questionId: string; questionText: string; answer: any }[] = [];
    questions.forEach((q) => {
      if (q.answers) {
        q.answers.forEach((ans) => {
          if (ans.userId === currentUser.id) {
            ansList.push({
              questionId: q.id,
              questionText: q.question,
              answer: ans,
            });
          }
        });
      }
    });
    setLocalAnswers(ansList);
  }, [events, questions, currentUser.id]);

  const handleDeleteEvent = (eventId: string) => {
    EventService.deleteEvent(eventId, currentUser.id);
    setLocalEvents((prev) => prev.filter((e) => e.id !== eventId));
    if (onSettingsChange) onSettingsChange();
  };

  const handleDeleteQuestion = (questionId: string) => {
    QuestionService.deleteQuestion(questionId, currentUser.id);
    setLocalQuestions((prev) => prev.filter((q) => q.id !== questionId));
    if (onSettingsChange) onSettingsChange();
  };

  const handleDeleteAnswer = (questionId: string, answerId: string) => {
    QuestionService.deleteAnswer(questionId, answerId, currentUser.id);
    setLocalAnswers((prev) => prev.filter((item) => item.answer.id !== answerId));
    if (onSettingsChange) onSettingsChange();
  };

  return (
    <div className="h-full flex flex-col bg-graphite overflow-hidden pb-16 select-none">
      {/* Profile Header */}
      <div className="p-4 sm:p-5 bg-surface-800/80 backdrop-blur-2xl border-b border-white/[0.08]">
        <div className="flex items-center gap-4 max-w-2xl mx-auto">
          <div className="relative">
            <HolidayDecorator size="lg" />
            <div className="w-16 h-16 rounded-2xl bg-surface-700 border border-white/10 text-white flex items-center justify-center text-2xl font-bold shadow-md">
              {currentUser.fullName[0]}
            </div>
            <div className="absolute -bottom-1 -right-1 bg-surface-800 border border-accent/40 text-accent text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shadow-xs">
              <Star className="w-2.5 h-2.5 fill-current" />
              <span>{currentUser.rating.toFixed(1)}</span>
            </div>
          </div>

          <div className="flex-1">
            <h1 className="text-lg sm:text-xl font-semibold text-white tracking-tight leading-tight">
              {currentUser.fullName}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs font-medium text-accent bg-accent/10 px-2.5 py-0.5 rounded-lg border border-accent/20">
                {currentUser.level}
              </span>
              {isAdminAuthorized && (
                <span className="text-xs font-medium text-warning bg-warning/10 px-2.5 py-0.5 rounded-lg border border-warning/20">
                  Шеф-Модератор
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 3 Stats Glass Cards */}
        <div className="grid grid-cols-3 gap-2 mt-4 max-w-2xl mx-auto text-center">
          <div className="p-3 bg-graphite rounded-xl border border-white/[0.06]">
            <p className="text-lg sm:text-xl font-bold text-white">
              {currentUser.helpfulConfirmationsCount || 0}
            </p>
            <p className="text-[10px] text-muted font-normal uppercase tracking-wider mt-0.5">подтверждений</p>
          </div>
          <div className="p-3 bg-graphite rounded-xl border border-white/[0.06]">
            <p className="text-lg sm:text-xl font-bold text-white">
              {currentUser.eventsCount || 0}
            </p>
            <p className="text-[10px] text-muted font-normal uppercase tracking-wider mt-0.5">сообщений</p>
          </div>
          <div className="p-3 bg-graphite rounded-xl border border-white/[0.06]">
            <p className="text-lg sm:text-xl font-bold text-white">
              {currentUser.answersCount || 0}
            </p>
            <p className="text-[10px] text-muted font-normal uppercase tracking-wider mt-0.5">ответов</p>
          </div>
        </div>

        {/* Segmented Bar */}
        <div className="flex items-center p-1 bg-graphite rounded-xl max-w-2xl mx-auto mt-4 border border-white/[0.06] overflow-x-auto no-scrollbar">
          {[
            { id: 'stats', label: 'Настройки' },
            { id: 'events', label: `События (${localEvents.length})` },
            { id: 'questions', label: `Вопросы (${localQuestions.length})` },
            { id: 'answers', label: `Ответы (${localAnswers.length})` },
            { id: 'about', label: 'О сервисе' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium whitespace-nowrap transition-all select-none ${
                activeTab === tab.id
                  ? 'bg-surface-700 text-white border border-white/10 shadow-xs'
                  : 'text-muted hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Contents */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-2xl mx-auto w-full">
        {activeTab === 'stats' && (
          <div className="space-y-4">
            {/* Quick About Service Banner */}
            <div 
              onClick={() => setActiveTab('about')}
              className="p-4 bg-gradient-to-br from-surface-800 to-graphite-900 rounded-2xl border border-white/10 hover:border-accent/50 transition cursor-pointer flex items-center justify-between gap-3 group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-accent/15 text-accent border border-accent/25 flex items-center justify-center shrink-0">
                  <Info className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white group-hover:text-accent transition">
                    О сервисе ROADLIVE
                  </p>
                  <p className="text-xs text-muted">
                    Как работает карта, радиус 1000 м и подтверждения
                  </p>
                </div>
              </div>
              <span className="text-xs text-accent font-medium">Подробнее →</span>
            </div>

            {/* Admin Dashboard Entry (Only for admin role) */}
            {currentUser.role === 'admin' && (
              <div 
                onClick={() => {
                  onClose(); // Close the profile sheet first for clean transition
                  onOpenAdmin(); // Open the admin dashboard
                }}
                className="p-4 bg-gradient-to-r from-warning/10 to-surface-800 hover:from-warning/15 rounded-2xl border border-warning/30 hover:border-warning/60 transition cursor-pointer flex items-center justify-between gap-3 group shadow-[0_4px_20px_rgba(229,169,60,0.05)]"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-warning/20 text-warning border border-warning/35 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white group-hover:text-warning transition">
                      Панель управления ROADLIVE
                    </p>
                    <p className="text-xs text-muted">
                      Управление модерацией, рекламой 2ГИС и праздниками
                    </p>
                  </div>
                </div>
                <span className="text-xs text-warning font-semibold uppercase tracking-wider">Открыть →</span>
              </div>
            )}
          </div>
        )}

        {/* Dedicated "О сервисе" Tab */}
        {activeTab === 'about' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-surface-800 border border-white/10 space-y-3">
              <div className="flex items-center gap-2 text-accent font-semibold text-sm">
                <Zap className="w-4 h-4 fill-current" />
                <span>О проекте ROADLIVE</span>
              </div>
              <p className="text-xs text-muted leading-relaxed">
                <strong className="text-white">ROADLIVE</strong> — это живая карта и водительская сеть реального времени, созданная для того, чтобы автомобилисты помогали друг другу без задержек и недостоверных данных.
              </p>
            </div>

            <div className="space-y-2.5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
                Ключевые принципы работы
              </h2>

              <div className="p-3.5 rounded-2xl bg-surface-800 border border-white/[0.06] flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-accent/15 text-accent border border-accent/25 flex items-center justify-center shrink-0 mt-0.5">
                  <MapPin className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-white">Выбор точки прямо на карте</p>
                  <p className="text-xs text-muted">
                    Устанавливайте метку прицелом на карте — адрес определяется мгновенно, без необходимости вводить его руками.
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-surface-800 border border-white/[0.06] flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-success/15 text-success border border-success/25 flex items-center justify-center shrink-0 mt-0.5">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-white">Радиус достоверности — 1000 м</p>
                  <p className="text-xs text-muted">
                    Отметки и подтверждения в пределах 1000 метров от вашего GPS получают статус проверенных. Отметки на большем расстоянии помечаются как дистанционные с предупреждением для водителей.
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-surface-800 border border-white/[0.06] flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-purple/15 text-purple border border-purple/25 flex items-center justify-center shrink-0 mt-0.5">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-white">Кнопка «Подтверждаю»</p>
                  <p className="text-xs text-muted">
                    Нажатие кнопки подтверждения продлевает срок жизни отметки на карте и повышает ваш авторитет в сообществе.
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-surface-800 border border-white/[0.06] flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-info-2/15 text-info-2 border border-info-2/25 flex items-center justify-center shrink-0 mt-0.5">
                  <Radio className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-white">Живой Эфир и Вопросы</p>
                  <p className="text-xs text-muted">
                    Общайтесь в чате с попутчиками и задавайте вопросы о дорогах в реальном времени.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-surface-800 border border-white/10 flex items-center justify-between text-xs">
              <span className="text-muted">Версия ROADLIVE:</span>
              <span className="font-mono text-white font-semibold">v2.6.0 (2026 Release)</span>
            </div>
          </div>
        )}

        {activeTab === 'events' && (
          <div className="space-y-2.5">
            <p className="text-[10px] text-muted italic text-center mb-1">
              ← Проведите по карточке влево для удаления
            </p>
            {localEvents.length === 0 ? (
              <p className="text-xs text-faint italic text-center py-8">
                Вы ещё не публиковали дорожных событий
              </p>
            ) : (
              localEvents.map((ev) => (
                <SwipeableListItem key={ev.id} onDelete={() => handleDeleteEvent(ev.id)}>
                  <div className="p-4 bg-surface-800 rounded-2xl border border-white/[0.06] flex items-center justify-between gap-3 shadow-md">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] bg-accent/15 text-accent px-2 py-0.5 rounded border border-accent/20 font-semibold uppercase">
                          {ev.type === 'assistance' ? 'SOS' : ev.type}
                        </span>
                        <span className="text-[10px] text-muted">
                          {new Date(ev.createdAt).toLocaleDateString('ru-RU')}
                        </span>
                      </div>
                      <h3 className="text-sm font-semibold text-white leading-snug">{ev.title}</h3>
                      <p className="text-xs text-muted mt-1 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-accent shrink-0" />
                        <span className="truncate">{ev.address}</span>
                      </p>
                    </div>
                    <span className="text-[10px] text-muted bg-white/5 px-2 py-1 rounded-md shrink-0 border border-white/5 select-none">
                      ← Свайп
                    </span>
                  </div>
                </SwipeableListItem>
              ))
            )}
          </div>
        )}

        {activeTab === 'questions' && (
          <div className="space-y-2.5">
            <p className="text-[10px] text-muted italic text-center mb-1">
              ← Проведите по карточке влево для удаления
            </p>
            {localQuestions.length === 0 ? (
              <p className="text-xs text-faint italic text-center py-8">
                Вы ещё не задавали вопросов на карте
              </p>
            ) : (
              localQuestions.map((q) => (
                <SwipeableListItem key={q.id} onDelete={() => handleDeleteQuestion(q.id)}>
                  <div className="p-4 bg-surface-800 rounded-2xl border border-white/[0.06] flex items-center justify-between gap-3 shadow-md">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] bg-purple-500/15 text-purple-400 px-2 py-0.5 rounded border border-purple-500/20 font-semibold uppercase">
                          Вопрос
                        </span>
                        <span className="text-[10px] text-muted">
                          {new Date(q.createdAt).toLocaleDateString('ru-RU')}
                        </span>
                      </div>
                      <h3 className="text-sm font-semibold text-white leading-snug">{q.question}</h3>
                      <p className="text-xs text-muted mt-1 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-purple-400 shrink-0" />
                        <span className="truncate">{q.address}</span>
                      </p>
                    </div>
                    <span className="text-[10px] text-muted bg-white/5 px-2 py-1 rounded-md shrink-0 border border-white/5 select-none">
                      ← Свайп
                    </span>
                  </div>
                </SwipeableListItem>
              ))
            )}
          </div>
        )}

        {activeTab === 'answers' && (
          <div className="space-y-2.5">
            <p className="text-[10px] text-muted italic text-center mb-1">
              ← Проведите по карточке влево для удаления
            </p>
            {localAnswers.length === 0 ? (
              <p className="text-xs text-faint italic text-center py-8">
                Вы ещё не отвечали на вопросы водителей
              </p>
            ) : (
              localAnswers.map((item) => (
                <SwipeableListItem key={item.answer.id} onDelete={() => handleDeleteAnswer(item.questionId, item.answer.id)}>
                  <div className="p-4 bg-surface-800 rounded-2xl border border-white/[0.06] flex items-center justify-between gap-3 shadow-md">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[10px] bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 font-semibold uppercase">
                          Ответ
                        </span>
                        <span className="text-[10px] text-muted">
                          {new Date(item.answer.createdAt).toLocaleDateString('ru-RU')}
                        </span>
                      </div>
                      <p className="text-xs text-muted mb-1.5 leading-relaxed bg-graphite p-2 rounded-lg border border-white/5 truncate max-w-full">
                        К вопросу: «{item.questionText}»
                      </p>
                      <p className="text-sm font-medium text-white leading-relaxed">
                        {item.answer.content}
                      </p>
                    </div>
                    <span className="text-[10px] text-muted bg-white/5 px-2 py-1 rounded-md shrink-0 border border-white/5 select-none">
                      ← Свайп
                    </span>
                  </div>
                </SwipeableListItem>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
