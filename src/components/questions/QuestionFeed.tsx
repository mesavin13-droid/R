import React, { useState } from 'react';
import { DriverQuestion, UserProfile } from '../../types';
import { 
  HelpCircle, MessageCircle, MapPin, ThumbsUp, CheckCircle, 
  Send, Plus, Navigation 
} from 'lucide-react';
import { QuestionService } from '../../services/questionService';
import { EventService } from '../../services/eventService';

interface QuestionFeedProps {
  questions: DriverQuestion[];
  currentUser: UserProfile;
  userCoords: { lat: number; lng: number } | null;
  onOpenAskModal: () => void;
  onFocusMap: (lat: number, lng: number) => void;
  onQuestionUpdated: () => void;
}

export const QuestionFeed: React.FC<QuestionFeedProps> = ({
  questions,
  currentUser,
  userCoords,
  onOpenAskModal,
  onFocusMap,
  onQuestionUpdated,
}) => {
  const [filter, setFilter] = useState<'all' | 'new' | 'unanswered' | 'popular' | 'my'>('all');
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const [swipedCardId, setSwipedCardId] = useState<string | null>(null);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const getTimeAgo = (dateStr: string) => {
    const elapsedMs = Date.now() - new Date(dateStr).getTime();
    const mins = Math.max(0, Math.round(elapsedMs / (60 * 1000)));
    if (mins < 1) return 'только что';
    if (mins < 60) return `${mins} мин`;
    const hours = Math.round(mins / 60);
    return `${hours} ч`;
  };

  const filteredQuestions = QuestionService.getQuestions(filter, currentUser.id);

  const handleTouchStart = (e: React.TouchEvent, qId: string, isOwner: boolean) => {
    if (!isOwner) return;
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent, qId: string, isOwner: boolean) => {
    if (!isOwner || touchStartX === null) return;
    const currentX = e.touches[0].clientX;
    const diff = touchStartX - currentX;
    if (diff > 50) {
      setSwipedCardId(qId);
    } else if (diff < -30) {
      setSwipedCardId(null);
    }
  };

  const handleTouchEnd = () => {
    setTouchStartX(null);
  };

  const handleDelete = async (qId: string) => {
    if (window.confirm('Удалить ваш вопрос?')) {
      await QuestionService.deleteQuestion(qId, currentUser.id);
      onQuestionUpdated();
      setSwipedCardId(null);
    }
  };

  const handleSendReply = async (questionId: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) return;

    setIsReplying(true);
    try {
      await QuestionService.answerQuestion(questionId, replyText, currentUser);
      setReplyText('');
      onQuestionUpdated();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsReplying(false);
    }
  };

  const handleHelpful = async (questionId: string, answerId: string) => {
    await QuestionService.markAnswerHelpful(questionId, answerId);
    onQuestionUpdated();
  };

  return (
    <div className="h-full flex flex-col bg-[#111315] overflow-hidden pb-16 select-none">
      {/* Top Header */}
      <div className="p-4 sm:p-5 bg-[#181B1F]/80 backdrop-blur-2xl border-b border-white/[0.08]">
        <div className="flex items-center justify-between gap-3 mb-3.5 max-w-2xl mx-auto">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#20242A] border border-white/10 text-[#4B8DFF] flex items-center justify-center font-bold">
              <HelpCircle className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-semibold text-white tracking-tight leading-tight">
                Вопросы водителей
              </h1>
              <p className="text-xs text-[#9AA0A8]">Обстановка на дорогах из первых уст</p>
            </div>
          </div>
          <button
            onClick={onOpenAskModal}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#4B8DFF] hover:bg-[#3C7AE6] text-white rounded-xl text-xs font-medium transition active:scale-95 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Спросить</span>
          </button>
        </div>

        {/* Filter Segmented Control */}
        <div className="flex items-center p-1 bg-[#111315] rounded-xl max-w-2xl mx-auto border border-white/[0.06] overflow-x-auto no-scrollbar">
          {[
            { id: 'all', label: 'Все' },
            { id: 'new', label: 'Новые' },
            { id: 'unanswered', label: 'Без ответа' },
            { id: 'popular', label: 'Популярные' },
            { id: 'my', label: 'Мои' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setFilter(item.id as any)}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium whitespace-nowrap transition-all select-none ${
                filter === item.id
                  ? 'bg-[#20242A] text-white border border-white/10 shadow-xs'
                  : 'text-[#9AA0A8] hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stream of Glass Cards */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 max-w-2xl mx-auto w-full">
        {filteredQuestions.length === 0 ? (
          <div className="text-center py-16 px-4">
            <div className="w-10 h-10 rounded-2xl bg-[#20242A] border border-white/10 text-[#4B8DFF] mx-auto flex items-center justify-center mb-3">
              <HelpCircle className="w-5 h-5" />
            </div>
            <p className="text-sm font-semibold text-white">Вопросов пока нет</p>
            <p className="text-xs text-[#9AA0A8] mt-1 mb-4">
              {filter === 'my'
                ? 'Вы еще не задавали вопросов. Нажмите «Спросить», чтобы создать вопрос.'
                : 'Спросите у других водителей, что происходит на нужном переезде или улице'}
            </p>
            <button
              onClick={onOpenAskModal}
              className="px-4 py-2 bg-[#4B8DFF] text-white text-xs font-medium rounded-xl"
            >
              Задать вопрос
            </button>
          </div>
        ) : (
          filteredQuestions.map((q) => {
            const isExpanded = activeQuestionId === q.id;
            const isOwner = q.userId === currentUser.id;
            const isSwiped = swipedCardId === q.id;

            let distText = '';
            if (userCoords) {
              const d = EventService.calculateDistanceMeters(
                q.latitude,
                q.longitude,
                userCoords.lat,
                userCoords.lng
              );
              distText = d < 1000 ? `${d} м` : `${(d / 1000).toFixed(1)} км`;
            }

            return (
              <div
                key={q.id}
                className="relative overflow-hidden rounded-2xl border border-white/[0.08]"
                onTouchStart={(e) => handleTouchStart(e, q.id, isOwner)}
                onTouchMove={(e) => handleTouchMove(e, q.id, isOwner)}
                onTouchEnd={handleTouchEnd}
              >
                {/* Background Delete Action Drawer (Telegram-style Swipe Reveal) */}
                {isOwner && (
                  <div className="absolute inset-0 bg-[#FF3B30] flex items-center justify-end pr-6 z-0">
                    <button
                      type="button"
                      onClick={() => handleDelete(q.id)}
                      className="flex items-center gap-1.5 text-white font-semibold text-xs bg-black/20 px-4 py-2 rounded-xl transition active:scale-95"
                    >
                      <span>🗑️</span>
                      <span>Удалить</span>
                    </button>
                  </div>
                )}

                {/* Foreground Card Content with Slide Transform */}
                <div
                  className={`relative z-10 bg-[#181B1F] p-4 transition-transform duration-200 ${
                    isSwiped ? '-translate-x-24' : 'translate-x-0'
                  }`}
                >
                  {/* Meta Header */}
                  <div className="flex items-center justify-between text-xs text-[#9AA0A8] mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-[#4B8DFF] bg-[#4B8DFF]/10 px-2 py-0.5 rounded-lg border border-[#4B8DFF]/20">
                        {q.category}
                      </span>
                      <span>· {getTimeAgo(q.createdAt)}</span>
                      {distText && <span>· {distText}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onFocusMap(q.latitude, q.longitude)}
                        className="flex items-center gap-1 text-[11px] text-[#4B8DFF] hover:underline"
                        title="Показать на карте"
                      >
                        <Navigation className="w-3 h-3" />
                        <span>На карте</span>
                      </button>
                      {isOwner && (
                        <button
                          type="button"
                          onClick={() => handleDelete(q.id)}
                          className="text-[#FF3B30] hover:text-red-400 text-xs px-1"
                          title="Удалить вопрос"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                {/* Question Text */}
                <h3 className="text-sm font-medium text-white mb-2 leading-relaxed">
                  {q.question}
                </h3>

                <div className="flex items-center gap-1 text-xs text-[#9AA0A8] mb-3">
                  <MapPin className="w-3.5 h-3.5 text-[#5F656D] shrink-0" />
                  <span className="truncate">{q.address}</span>
                </div>

                {/* Answers Count & Toggle */}
                <div className="pt-2.5 border-t border-white/[0.06] flex items-center justify-between">
                  <div className="text-xs text-[#9AA0A8]">
                    Автор: <span className="text-white font-medium">{q.authorName}</span>
                  </div>

                  <button
                    onClick={() => setActiveQuestionId(isExpanded ? null : q.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#20242A] hover:bg-white/10 rounded-xl transition border border-white/[0.08] active:scale-95"
                  >
                    <MessageCircle className="w-3.5 h-3.5 text-[#4B8DFF]" />
                    <span>
                      {q.answersCount > 0
                        ? `${q.answersCount} ${q.answersCount === 1 ? 'ответ' : 'ответа'}`
                        : 'Ответить'}
                    </span>
                  </button>
                </div>

                {/* Expanded Answers */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-3 animate-in fade-in">
                    <div className="space-y-2">
                      {q.answers && q.answers.length > 0 ? (
                        q.answers.map((ans) => (
                          <div
                            key={ans.id}
                            className="p-3 bg-[#111315] rounded-xl border border-white/[0.05] text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between text-[11px] text-[#9AA0A8]">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-white">{ans.authorName}</span>
                                {ans.isVerified && (
                                  <span className="flex items-center gap-0.5 text-[#34C759] text-[10px]">
                                    <CheckCircle className="w-2.5 h-2.5" /> Проверено
                                  </span>
                                )}
                              </div>
                              <span>{getTimeAgo(ans.createdAt)}</span>
                            </div>
                            <p className="text-[#F0F2F5] leading-relaxed">
                              {ans.content}
                            </p>
                            <div className="flex justify-end pt-1">
                              <button
                                onClick={() => handleHelpful(q.id, ans.id)}
                                className="flex items-center gap-1 text-[11px] text-[#4B8DFF] hover:underline"
                              >
                                <ThumbsUp className="w-3 h-3" />
                                <span>Полезно ({ans.helpfulCount})</span>
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-[#5F656D] italic py-1">
                          Пока нет ответов. Напишите первым!
                        </p>
                      )}
                    </div>

                    {/* Reply Input Form */}
                    <form
                      onSubmit={(e) => handleSendReply(q.id, e)}
                      className="flex items-center gap-2 pt-1"
                    >
                      <input
                        type="text"
                        placeholder="Напишите ответ..."
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        className="flex-1 text-xs bg-[#111315] border border-white/[0.08] focus:border-[#4B8DFF]/60 rounded-xl px-3.5 py-2 outline-none text-white placeholder:text-[#5F656D]"
                      />
                      <button
                        type="submit"
                        disabled={!replyText.trim() || isReplying}
                        className="p-2 bg-[#4B8DFF] hover:bg-[#3C7AE6] disabled:opacity-30 text-white rounded-xl transition active:scale-95 shadow-xs"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  </div>
                )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
