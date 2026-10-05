import React, { useState } from 'react';
import { RoadEvent, UserProfile } from '../../types';
import { 
  X, Check, Share2, 
  MapPin, Send, MessageCircle, AlertCircle, ShieldCheck, ShieldAlert
} from 'lucide-react';
import { EventService } from '../../services/eventService';

interface EventDetailSheetProps {
  event: RoadEvent | null;
  onClose: () => void;
  currentUser: UserProfile;
  userCoords: { lat: number; lng: number } | null;
  onEventUpdated: (updatedEvent: RoadEvent) => void;
}

export const EventDetailSheet: React.FC<EventDetailSheetProps> = ({
  event,
  onClose,
  currentUser,
  userCoords,
  onEventUpdated,
}) => {
  const [commentText, setCommentText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [hasConfirmed, setHasConfirmed] = useState(false);
  const [isConfirmingAnim, setIsConfirmingAnim] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [warningNotice, setWarningNotice] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [showRemoteConfirmModal, setShowRemoteConfirmModal] = useState(false);

  if (!event) return null;

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

  // Distance calculation from current user
  let distanceMeters: number | null = null;
  let distanceText: string | null = null;
  let isWithin1000m = true;

  if (userCoords) {
    distanceMeters = EventService.calculateDistanceMeters(
      event.latitude,
      event.longitude,
      userCoords.lat,
      userCoords.lng
    );
    distanceText = distanceMeters < 1000 ? `${distanceMeters} м` : `${(distanceMeters / 1000).toFixed(1)} км`;
    isWithin1000m = distanceMeters <= 1000;
  }

  const getStatusBadge = () => {
    if (event.status === 'expiring') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-[#E5A93C] font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-[#E5A93C]"></span>
          Устаревает
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[#34C759] font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-[#34C759]"></span>
        Сейчас
      </span>
    );
  };

  const executeConfirmation = (isRemote: boolean) => {
    setIsConfirmingAnim(true);
    try {
      const res = EventService.confirmEvent(
        event.id,
        currentUser,
        userCoords ? { lat: userCoords.lat, lng: userCoords.lng } : undefined
      );
      setHasConfirmed(true);
      onEventUpdated(res.event);

      if (isRemote) {
        setWarningNotice(`⚠️ Дистанционное подтверждение (${distanceText}) принято с пониженным весом`);
        setTimeout(() => setWarningNotice(null), 4000);
      } else {
        setNotice(distanceMeters !== null ? `✓ Подтверждено на месте (${distanceText})` : '✓ Подтверждено');
        setTimeout(() => setNotice(null), 3000);
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setTimeout(() => setIsConfirmingAnim(false), 200);
      setShowRemoteConfirmModal(false);
    }
  };

  const handleConfirmClick = () => {
    if (hasConfirmed) return;

    if (userCoords && !isWithin1000m) {
      // Out of 1000m radius -> Show distance prompt
      setShowRemoteConfirmModal(true);
    } else {
      // Within 1000m radius -> Instant verified confirmation
      executeConfirmation(false);
    }
  };

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;

    setIsSubmittingComment(true);
    try {
      EventService.addComment(event.id, commentText, currentUser);
      setCommentText('');
      const updated = EventService.getEvents().find((e) => e.id === event.id) || event;
      onEventUpdated(updated);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleShare = async () => {
    const text = `ROADLIVE: ${event.title} (${event.address})`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'ROADLIVE', text, url: window.location.href });
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        try {
          if (navigator.clipboard) {
            await navigator.clipboard.writeText(`${text} — ${window.location.href}`);
            setNotice('Ссылка скопирована');
            setTimeout(() => setNotice(null), 2500);
          }
        } catch {}
      }
    } else {
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          await navigator.clipboard.writeText(`${text} — ${window.location.href}`);
          setNotice('Ссылка скопирована');
          setTimeout(() => setNotice(null), 2500);
        }
      } catch {}
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
        className={`relative w-full max-h-[85vh] md:max-h-full graphite-sheet-depth rounded-t-[28px] md:rounded-[28px] flex flex-col overflow-hidden pointer-events-auto transition-all duration-250 ease-in ${
          isClosing
            ? 'translate-y-full opacity-0'
            : 'animate-sheet-enter'
        }`}
      >
        {/* Top Edge Luster Accent */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none" />

        {/* Sleek Touch Drag Handle */}
        <div className="flex justify-center pt-2.5 pb-1 md:hidden">
          <div className="w-11 h-1.2 bg-white/25 rounded-full"></div>
        </div>

        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/[0.08] flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              {getStatusBadge()}
              <span className="text-xs text-[#9AA0A8]">· {getTimeAgo(event.createdAt)}</span>
              {distanceText && (
                <span className={`text-xs ${isWithin1000m ? 'text-[#34C759]' : 'text-[#9AA0A8]'}`}>
                  · {distanceText} {isWithin1000m ? '(рядом)' : ''}
                </span>
              )}
            </div>

            <h2 className="text-lg sm:text-xl font-semibold text-[#F0F2F5] leading-snug">
              {event.title}
            </h2>

            <div className="flex items-center gap-1.5 text-xs text-[#9AA0A8] mt-1">
              <MapPin className="w-3.5 h-3.5 text-[#4B8DFF] shrink-0" />
              <span className="truncate text-white font-medium">{event.address}</span>
            </div>
          </div>

          <button
            onClick={handleAnimatedClose}
            className="p-1.5 rounded-full bg-white/5 text-[#9AA0A8] hover:text-white hover:bg-white/10 transition shrink-0 active:scale-90"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {notice && (
            <div className="p-3 rounded-2xl bg-[#34C759]/15 border border-[#34C759]/30 text-xs text-[#34C759] font-medium flex items-center gap-2 animate-in fade-in">
              <Check className="w-4 h-4 text-[#34C759] shrink-0" />
              <span>{notice}</span>
            </div>
          )}

          {warningNotice && (
            <div className="p-3 rounded-2xl bg-[#E5A93C]/15 border border-[#E5A93C]/30 text-xs text-[#E5A93C] font-medium flex items-center gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-[#E5A93C] shrink-0" />
              <span>{warningNotice}</span>
            </div>
          )}

          {event.isRemoteReport && (
            <div className="p-3 rounded-2xl bg-[#E5A93C]/10 border border-[#E5A93C]/25 text-xs text-[#E5A93C] flex items-start gap-2.5">
              <span className="text-base leading-none">⚠️</span>
              <div>
                <p className="font-semibold text-white">Дистанционное сообщение</p>
                <p className="text-[11px] text-[#9AA0A8] mt-0.5">
                  Автор указал точку вне радиуса присутствия ({event.distanceFromAuthorMeters ? `${(event.distanceFromAuthorMeters / 1000).toFixed(1)} км` : '>1 км'}).
                </p>
              </div>
            </div>
          )}

          {event.type === 'assistance' && (
            <div className="p-3.5 rounded-2xl bg-[#FF3B30]/15 border border-[#FF3B30]/35 space-y-2.5 animate-in fade-in">
              <div className="flex items-center gap-2 text-xs font-bold text-[#FF3B30]">
                <span className="text-base">🆘</span>
                <span>Запрос взаимовыручки водителей!</span>
              </div>
              <p className="text-[11px] text-[#F0F2F5] leading-relaxed">
                Водителю необходима помощь с аккумулятором, тросом, колесом или топливом.
              </p>

              {/* Case 1: No helper has responded yet */}
              {!event.helperUserId && (
                <button
                  onClick={() => {
                    const updated = EventService.respondToAssistance(event.id, currentUser);
                    onEventUpdated(updated);
                    setNotice('🤝 Автор уведомлён: вы выехали на помощь!');
                    setTimeout(() => setNotice(null), 4000);
                  }}
                  className="w-full py-2.5 px-3 rounded-xl bg-[#FF3B30] hover:bg-[#E03126] text-white text-xs font-bold transition active:scale-95 shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>🤝 Выехать на помощь водителю</span>
                </button>
              )}

              {/* Case 2: Current user is the registered helper */}
              {event.helperUserId === currentUser.id && (
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 space-y-2">
                  <p className="text-[11px] text-white font-medium">
                    Вы выехали на помощь! Подтвердите завершение:
                  </p>
                  {event.helperConfirmedResolved ? (
                    <div className="text-center text-[#34C759] text-xs font-semibold py-1">
                      ✓ Вы подтвердили, что помогли. Ждем подтверждения автора.
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        const updated = EventService.confirmResolved(event.id, currentUser.id);
                        onEventUpdated(updated);
                        setNotice('✓ Вы подтвердили оказание помощи!');
                        setTimeout(() => setNotice(null), 4000);
                        if (updated.status === 'resolved') {
                          handleAnimatedClose();
                        }
                      }}
                      className="w-full py-2 px-3 rounded-lg bg-[#34C759] hover:bg-[#2fb350] text-white text-xs font-semibold transition active:scale-95 flex items-center justify-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Я помог (закрыть)</span>
                    </button>
                  )}
                </div>
              )}

              {/* Case 3: Current user is the creator of the SOS */}
              {event.userId === currentUser.id && event.helperUserId && (
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 space-y-2">
                  <p className="text-[11px] text-[#4B8DFF] font-semibold">
                    🤝 {event.helperName} едет к вам на помощь!
                  </p>
                  <button
                    onClick={() => {
                      const updated = EventService.confirmResolved(event.id, currentUser.id);
                      onEventUpdated(updated);
                      setNotice('✓ Ситуация успешно закрыта!');
                      setTimeout(() => setNotice(null), 4000);
                      handleAnimatedClose();
                    }}
                    className="w-full py-2 px-3 rounded-lg bg-[#34C759] hover:bg-[#2fb350] text-white text-xs font-semibold transition active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Помощь получена (закрыть вызов)</span>
                  </button>
                </div>
              )}

              {/* Case 4: Any other driver viewing the card when someone is already on their way */}
              {event.helperUserId && event.helperUserId !== currentUser.id && event.userId !== currentUser.id && (
                <div className="p-2.5 rounded-xl bg-[#34C759]/10 border border-[#34C759]/20 text-center">
                  <p className="text-[11px] text-[#34C759] font-semibold flex items-center justify-center gap-1.5">
                    <span>🤝</span>
                    <span>{event.helperName} уже едет на помощь!</span>
                  </p>
                </div>
              )}
            </div>
          )}

          {event.description && (
            <div className="p-3.5 rounded-2xl bg-[#181B1F] border border-white/[0.06] text-xs sm:text-sm text-[#F0F2F5] leading-relaxed">
              {event.description}
            </div>
          )}

          {/* Verification Metrics Card */}
          <div className="grid grid-cols-2 gap-2 p-3 rounded-2xl bg-[#181B1F] border border-white/[0.06] text-center">
            <div>
              <p className="text-lg font-bold text-white">
                {event.confirmationCount}
              </p>
              <p className="text-[10px] text-[#9AA0A8] font-normal uppercase tracking-wider">
                {event.type === 'assistance' ? 'откликов' : 'подтверждений'}
              </p>
            </div>
            <div>
              <p className="text-lg font-bold text-[#4B8DFF]">
                {Math.round(event.confidenceScore * 100)}%
              </p>
              <p className="text-[10px] text-[#9AA0A8] font-normal uppercase tracking-wider">достоверность</p>
            </div>
          </div>

          {/* Remote Confirmation Warning Dialog Prompt */}
          {showRemoteConfirmModal && (
            <div className="p-3.5 rounded-2xl bg-[#181B1F] border border-[#E5A93C]/40 space-y-2.5 animate-in fade-in">
              <div className="flex items-start gap-2 text-xs">
                <ShieldAlert className="w-4 h-4 text-[#E5A93C] shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-white">
                    Вы находитесь в {distanceText} от события
                  </p>
                  <p className="text-[11px] text-[#9AA0A8] leading-relaxed">
                    Радиус достоверного подтверждения — <strong>1000 метров</strong>. Информация не может считаться гарантированно точной без присутствия на месте.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => setShowRemoteConfirmModal(false)}
                  className="py-2 px-2 text-xs font-medium text-[#9AA0A8] hover:text-white bg-white/5 rounded-xl transition"
                >
                  Отмена
                </button>
                <button
                  onClick={() => executeConfirmation(true)}
                  className="py-2 px-2 text-xs font-medium text-white bg-[#E5A93C]/20 border border-[#E5A93C]/40 hover:bg-[#E5A93C]/30 rounded-xl transition"
                >
                  Всё равно подтвердить
                </button>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleConfirmClick}
              className={`flex items-center justify-center gap-2 py-3 px-3 rounded-2xl font-medium text-xs transition active:scale-95 ${
                hasConfirmed
                  ? 'bg-[#34C759]/20 text-[#34C759] border border-[#34C759]/40'
                  : 'bg-[#4B8DFF] hover:bg-[#3C7AE6] text-white shadow-xs'
              } ${isConfirmingAnim ? 'scale-105' : ''}`}
            >
              <Check className="w-4 h-4" />
              <span>
                {hasConfirmed
                  ? (event.type === 'assistance' ? '✓ Откликнулся' : '✓ Подтверждено')
                  : (event.type === 'assistance' ? 'Откликнуться' : 'Подтверждаю')}
              </span>
            </button>

            <button
              onClick={() => {
                const el = document.getElementById('comment-input');
                el?.focus();
              }}
              className="flex items-center justify-center gap-2 py-3 px-3 rounded-2xl font-medium text-xs text-[#F0F2F5] bg-[#181B1F] hover:bg-[#20242A] border border-white/[0.08] transition active:scale-95"
            >
              <MessageCircle className="w-4 h-4 text-[#9AA0A8]" />
              <span>Ответить</span>
            </button>
          </div>

          {/* Community Stream */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-medium uppercase tracking-wider text-[#9AA0A8]">
                Последние сообщения ({event.comments?.length || 0})
              </h3>
              <button
                onClick={handleShare}
                className="flex items-center gap-1 text-xs text-[#4B8DFF] hover:underline font-normal"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Поделиться</span>
              </button>
            </div>

            <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
              {event.comments && event.comments.length > 0 ? (
                event.comments.map((cm) => (
                  <div
                    key={cm.id}
                    className="p-3 rounded-2xl bg-[#181B1F] border border-white/[0.05] text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between text-[11px] text-[#9AA0A8]">
                      <span className="font-medium text-white">{cm.authorName}</span>
                      <span>{getTimeAgo(cm.createdAt)}</span>
                    </div>
                    <p className="text-[#F0F2F5] leading-relaxed">{cm.content}</p>
                  </div>
                ))
              ) : (
                <p className="text-xs text-[#5F656D] italic py-2 text-center">
                  Пока нет комментариев
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Comment Input Footer */}
        <form
          onSubmit={handleAddComment}
          className="p-3 sm:p-4 bg-[#14171B] border-t border-white/[0.08] flex items-center gap-2 safe-bottom"
        >
          <input
            id="comment-input"
            type="text"
            placeholder="Написать сообщение..."
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            className="flex-1 text-sm bg-[#181B1F] rounded-full px-4 py-2.5 outline-none border border-white/[0.08] focus:border-[#4B8DFF]/60 text-white placeholder:text-[#5F656D]"
          />
          <button
            type="submit"
            disabled={!commentText.trim() || isSubmittingComment}
            className="p-2.5 bg-[#4B8DFF] hover:bg-[#3C7AE6] disabled:opacity-30 text-white rounded-full transition active:scale-95 shadow-xs"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
