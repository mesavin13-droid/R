import React, { useEffect, useState } from 'react';
import { AssistanceOffer, RoadEvent, UserProfile } from '../../types';
import { 
  X, Check, Share2, 
  MapPin, Send, MessageCircle, AlertCircle, ShieldCheck, ShieldAlert
} from 'lucide-react';
import { EventService } from '../../services/eventService';
import { TelegramService } from '../../services/telegramService';

interface EventDetailSheetProps {
  event: RoadEvent | null;
  onClose: () => void;
  currentUser: UserProfile;
  userCoords: { lat: number; lng: number } | null;
  onEventUpdated: (updatedEvent: RoadEvent) => void;
  /** Open the private driver-to-driver dialog for this call. */
  onOpenChat?: (ev: RoadEvent) => void;
}

export const EventDetailSheet: React.FC<EventDetailSheetProps> = ({
  event,
  onClose,
  currentUser,
  userCoords,
  onEventUpdated,
  onOpenChat,
}) => {
  const [commentText, setCommentText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [hasConfirmed, setHasConfirmed] = useState(false);
  const [isConfirmingAnim, setIsConfirmingAnim] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [warningNotice, setWarningNotice] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [showRemoteConfirmModal, setShowRemoteConfirmModal] = useState(false);

  // Assistance offers: the live list of drivers offering help on this SOS call.
  const [offers, setOffers] = useState<AssistanceOffer[]>([]);
  const [isOfferFormOpen, setIsOfferFormOpen] = useState(false);
  const [offerKind, setOfferKind] = useState<'free' | 'paid' | 'negotiable'>('free');
  const [priceNote, setPriceNote] = useState('');
  const [offerMessage, setOfferMessage] = useState('');
  const [isSubmittingOffer, setIsSubmittingOffer] = useState(false);
  const [isOfferBusy, setIsOfferBusy] = useState(false);

  // Poll the offers while the card is open — this is what makes the author see
  // new responses "in real time" (WebSocket realtime is dead on Vercel).
  useEffect(() => {
    if (!event || event.type !== 'assistance') return;
    let cancelled = false;
    const load = () => {
      EventService.fetchOffers(event.id)
        .then((list) => {
          if (!cancelled) setOffers(list);
        })
        .catch(() => {
          // Keep the last known list on transient failures.
        });
    };
    load();
    const timer = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [event?.id, event?.type]);

  if (!event) return null;

  const isAuthor = event.userId === currentUser.id;
  const pendingOffers = offers.filter((o) => o.status === 'pending');
  const myLiveOffer = offers.find(
    (o) => o.helperUserId === currentUser.id && (o.status === 'pending' || o.status === 'accepted')
  );

  const offerKindText = (offer: AssistanceOffer) => {
    if (offer.offerKind === 'paid') return offer.priceNote ? `💰 ${offer.priceNote}` : '💰 За оплату';
    if (offer.offerKind === 'negotiable') return '💬 По договорённости';
    return '💚 Бесплатно';
  };
  const offerKindBadgeClass = (offer: AssistanceOffer) => {
    if (offer.offerKind === 'paid') return 'bg-warning/15 text-warning border-warning/25';
    if (offer.offerKind === 'negotiable') return 'bg-accent/15 text-accent border-accent/25';
    return 'bg-success/15 text-success border-success/25';
  };

  const flashNotice = (text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(null), 4000);
  };

  const handleSendOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingOffer) return;
    setIsSubmittingOffer(true);
    try {
      const offer = await EventService.createOffer(event.id, currentUser, {
        offerKind,
        priceNote: offerKind === 'paid' ? priceNote.trim() : undefined,
        message: offerMessage.trim() || undefined,
      });
      setOffers((prev) => [...prev.filter((o) => o.helperUserId !== offer.helperUserId), offer]);
      setOfferMessage('');
      setPriceNote('');
      setIsOfferFormOpen(false);
      flashNotice('✓ Отклик отправлен — автор вызова получил уведомление!');
    } catch (err) {
      flashNotice(err instanceof Error ? err.message : 'Не удалось отправить отклик');
    } finally {
      setIsSubmittingOffer(false);
    }
  };

  const handleAcceptOffer = async (offer: AssistanceOffer) => {
    if (isOfferBusy) return;
    setIsOfferBusy(true);
    try {
      const updated = await EventService.acceptOffer(event.id, offer.id, currentUser.id);
      onEventUpdated(updated);
      flashNotice(`✓ ${offer.helperName} выезжает к вам! Откройте чат, чтобы договориться.`);
    } catch (err) {
      flashNotice(err instanceof Error ? err.message : 'Не удалось принять отклик');
    } finally {
      setIsOfferBusy(false);
    }
  };

  const handleDeclineOffer = async (offer: AssistanceOffer) => {
    if (isOfferBusy) return;
    setIsOfferBusy(true);
    try {
      const list = await EventService.declineOffer(event.id, offer.id, currentUser.id);
      setOffers(list);
      flashNotice(`Отклик «${offer.helperName}» отклонён`);
    } catch (err) {
      flashNotice(err instanceof Error ? err.message : 'Не удалось отклонить отклик');
    } finally {
      setIsOfferBusy(false);
    }
  };

  const handleWithdrawOffer = async () => {
    if (!myLiveOffer || isOfferBusy) return;
    setIsOfferBusy(true);
    try {
      const list = await EventService.withdrawOffer(event.id, myLiveOffer.id, currentUser.id);
      setOffers(list);
      flashNotice('Отклик отозван');
    } catch (err) {
      flashNotice(err instanceof Error ? err.message : 'Не удалось отозвать отклик');
    } finally {
      setIsOfferBusy(false);
    }
  };

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
        <span className="inline-flex items-center gap-1.5 text-xs text-warning font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-warning"></span>
          Устаревает
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-success font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-success"></span>
        Сейчас
      </span>
    );
  };

  const executeConfirmation = async (isRemote: boolean) => {
    setIsConfirmingAnim(true);
    try {
      const res = await EventService.confirmEvent(
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

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;

    setIsSubmittingComment(true);
    try {
      await EventService.addComment(event.id, commentText, currentUser);
      setCommentText('');
      if (TelegramService.isTelegramWebApp()) {
        const refreshed = await EventService.getEventsAsync();
        onEventUpdated(refreshed.find((e) => e.id === event.id) || event);
      } else {
        const updated = EventService.getEvents().find((e) => e.id === event.id) || event;
        onEventUpdated(updated);
      }
    } catch (err: any) {
      alert(err?.message || 'Не удалось сохранить комментарий');
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
              <span className="text-xs text-muted">· {getTimeAgo(event.createdAt)}</span>
              {distanceText && (
                <span className={`text-xs ${isWithin1000m ? 'text-success' : 'text-muted'}`}>
                  · {distanceText} {isWithin1000m ? '(рядом)' : ''}
                </span>
              )}
            </div>

            <h2 className="text-lg sm:text-xl font-semibold text-ink leading-snug">
              {event.title}
            </h2>

            <div className="flex items-center gap-1.5 text-xs text-muted mt-1">
              <MapPin className="w-3.5 h-3.5 text-accent shrink-0" />
              <span className="truncate text-white font-medium">{event.address}</span>
            </div>
          </div>

          <button
            onClick={handleAnimatedClose}
            className="p-1.5 rounded-full bg-white/5 text-muted hover:text-white hover:bg-white/10 transition shrink-0 active:scale-90"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {notice && (
            <div className="p-3 rounded-2xl bg-success/15 border border-success/30 text-xs text-success font-medium flex items-center gap-2 animate-in fade-in">
              <Check className="w-4 h-4 text-success shrink-0" />
              <span>{notice}</span>
            </div>
          )}

          {warningNotice && (
            <div className="p-3 rounded-2xl bg-warning/15 border border-warning/30 text-xs text-warning font-medium flex items-center gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-warning shrink-0" />
              <span>{warningNotice}</span>
            </div>
          )}

          {event.isRemoteReport && (
            <div className="p-3 rounded-2xl bg-warning/10 border border-warning/25 text-xs text-warning flex items-start gap-2.5">
              <span className="text-base leading-none">⚠️</span>
              <div>
                <p className="font-semibold text-white">Дистанционное сообщение</p>
                <p className="text-[11px] text-muted mt-0.5">
                  Автор указал точку вне радиуса присутствия ({event.distanceFromAuthorMeters ? `${(event.distanceFromAuthorMeters / 1000).toFixed(1)} км` : '>1 км'}).
                </p>
              </div>
            </div>
          )}

          {event.type === 'assistance' && (
            <div className="p-3.5 rounded-2xl bg-danger/15 border border-danger/35 space-y-2.5 animate-in fade-in">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-danger">
                  <span className="text-base">🆘</span>
                  <span>{event.helperUserId ? 'Помощь в пути!' : 'Ищем помощь!'}</span>
                </div>
                {!event.helperUserId && (event.offersCount ?? pendingOffers.length) > 0 && (
                  <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-md bg-danger text-white shrink-0">
                    📡 {event.offersCount ?? pendingOffers.length} откликов
                  </span>
                )}
              </div>
              <p className="text-[11px] text-ink leading-relaxed">
                Водителю необходима помощь с аккумулятором, тросом, колесом или топливом.
              </p>

              {/* The SOS author watches the offers come in and picks one */}
              {isAuthor && !event.helperUserId && (
                <div className="space-y-2">
                  <p className="text-[11px] text-white font-semibold">
                    📡 Отклики водителей (в реальном времени):
                  </p>
                  {pendingOffers.length === 0 ? (
                    <p className="text-[11px] text-white/70 text-center py-2 rounded-lg bg-white/5 border border-white/10">
                      Пока откликов нет — водители в радиусе 15 км видят ваш SOS-баннер.
                    </p>
                  ) : (
                    pendingOffers.map((offer) => (
                      <div key={offer.id} className="p-2.5 rounded-xl bg-white/5 border border-white/10 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-white font-bold truncate">🤝 {offer.helperName}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border shrink-0 ${offerKindBadgeClass(offer)}`}>
                            {offerKindText(offer)}
                          </span>
                        </div>
                        {offer.message && (
                          <p className="text-[11px] text-white/80 leading-snug">💬 {offer.message}</p>
                        )}
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleAcceptOffer(offer)}
                            disabled={isOfferBusy}
                            className="py-1.5 rounded-lg bg-success hover:bg-success-bright text-white text-[11px] font-bold transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Check className="w-3 h-3 stroke-[3]" />
                            <span>Согласиться</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeclineOffer(offer)}
                            disabled={isOfferBusy}
                            className="py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-[11px] font-semibold transition active:scale-95 disabled:opacity-50 cursor-pointer"
                          >
                            <span>✗ Отказать</span>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Another driver: send an offer (free / paid / negotiable) */}
              {!isAuthor && !event.helperUserId && (
                <div className="space-y-2">
                  {myLiveOffer && myLiveOffer.status === 'pending' ? (
                    <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 space-y-1 text-center">
                      <p className="text-[11px] text-white font-semibold">
                        ⏳ Отклик отправлен — ждём решения автора
                      </p>
                      <p className="text-[10px] text-white/70">
                        {offerKindText(myLiveOffer)}
                        {myLiveOffer.message ? ` · «${myLiveOffer.message}»` : ''}
                      </p>
                      <button
                        type="button"
                        onClick={handleWithdrawOffer}
                        disabled={isOfferBusy}
                        className="text-[11px] text-danger font-semibold underline underline-offset-2 cursor-pointer disabled:opacity-50"
                      >
                        Отозвать отклик
                      </button>
                    </div>
                  ) : (
                    <>
                      {myLiveOffer && myLiveOffer.status === 'declined' && (
                        <p className="text-[11px] text-white/70 text-center">
                          Автор не выбрал вас — можно предложить помощь снова.
                        </p>
                      )}
                      {!isOfferFormOpen ? (
                        <button
                          type="button"
                          onClick={() => setIsOfferFormOpen(true)}
                          className="w-full py-2.5 px-3 rounded-xl bg-danger hover:bg-danger-strong text-white text-xs font-bold transition active:scale-95 shadow-md flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <span>🤝 Предложить помощь</span>
                        </button>
                      ) : (
                        <form onSubmit={handleSendOffer} className="p-2.5 rounded-xl bg-white/5 border border-white/10 space-y-2">
                          <p className="text-[11px] text-white font-semibold">Как вы предлагаете помочь?</p>
                          <div className="grid grid-cols-3 gap-1.5">
                            {([
                              { id: 'free' as const, label: '💚 Бесплатно' },
                              { id: 'paid' as const, label: '💰 За оплату' },
                              { id: 'negotiable' as const, label: '💬 Договорная' },
                            ]).map((opt) => (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => setOfferKind(opt.id)}
                                className={`py-1.5 px-1 rounded-lg text-[10px] font-bold border transition cursor-pointer ${
                                  offerKind === opt.id
                                    ? 'bg-danger text-white border-danger'
                                    : 'bg-white/5 text-white/80 border-white/15 hover:bg-white/10'
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                          {offerKind === 'paid' && (
                            <input
                              type="text"
                              value={priceNote}
                              onChange={(e) => setPriceNote(e.target.value)}
                              maxLength={60}
                              placeholder="Сумма, например: 1500 ₽"
                              className="w-full px-2.5 py-2 rounded-lg bg-white/5 border border-white/15 text-xs text-white placeholder-white/40 focus:outline-none focus:border-danger/60"
                            />
                          )}
                          <textarea
                            rows={2}
                            value={offerMessage}
                            onChange={(e) => setOfferMessage(e.target.value)}
                            maxLength={300}
                            placeholder="Комментарий: «Буду через 10 минут, у меня трос»"
                            className="w-full px-2.5 py-2 rounded-lg bg-white/5 border border-white/15 text-xs text-white placeholder-white/40 focus:outline-none focus:border-danger/60 resize-none"
                          />
                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              onClick={() => setIsOfferFormOpen(false)}
                              className="py-2 rounded-lg bg-white/10 text-white text-[11px] font-semibold hover:bg-white/15 transition cursor-pointer"
                            >
                              Отмена
                            </button>
                            <button
                              type="submit"
                              disabled={isSubmittingOffer}
                              className="py-2 rounded-lg bg-danger hover:bg-danger-strong text-white text-[11px] font-bold transition active:scale-95 disabled:opacity-50 cursor-pointer"
                            >
                              {isSubmittingOffer ? 'Отправляем…' : 'Отправить отклик'}
                            </button>
                          </div>
                        </form>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Case 2: Current user is the registered helper */}
              {event.helperUserId === currentUser.id && (
                <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 space-y-2">
                  <button
                    type="button"
                    onClick={() => onOpenChat?.(event)}
                    className="w-full py-2 px-3 rounded-lg bg-telegram hover:opacity-90 text-white text-xs font-bold transition active:scale-95 shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>Договориться в чате с автором</span>
                  </button>
                  <p className="text-[11px] text-white font-medium">
                    Вы выехали на помощь! Подтвердите завершение:
                  </p>
                  {event.helperConfirmedResolved ? (
                    <div className="text-center text-success text-xs font-semibold py-1">
                      ✓ Вы подтвердили, что помогли. Ждем подтверждения автора.
                    </div>
                  ) : (
                    <button
                      onClick={async () => {
                        try {
                          const updated = await EventService.confirmResolved(event.id, currentUser.id);
                          onEventUpdated(updated);
                          setNotice('✓ Вы подтвердили оказание помощи!');
                          if (updated.status === 'resolved') {
                            handleAnimatedClose();
                          }
                        } catch (err) {
                          setNotice(err instanceof Error ? err.message : 'Не удалось подтвердить');
                        }
                        setTimeout(() => setNotice(null), 4000);
                      }}
                      className="w-full py-2 px-3 rounded-lg bg-success hover:bg-success-bright text-white text-xs font-semibold transition active:scale-95 flex items-center justify-center gap-1.5"
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
                  <p className="text-[11px] text-accent font-semibold">
                    🤝 {event.helperName} едет к вам на помощь!
                  </p>
                  <button
                    type="button"
                    onClick={() => onOpenChat?.(event)}
                    className="w-full py-2 px-3 rounded-lg bg-telegram hover:opacity-90 text-white text-xs font-bold transition active:scale-95 shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>Открыть чат с {event.helperName}</span>
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        const updated = await EventService.confirmResolved(event.id, currentUser.id);
                        onEventUpdated(updated);
                        setNotice('✓ Ситуация успешно закрыта!');
                        handleAnimatedClose();
                      } catch (err) {
                        setNotice(err instanceof Error ? err.message : 'Не удалось закрыть вызов');
                        setTimeout(() => setNotice(null), 4000);
                      }
                    }}
                    className="w-full py-2 px-3 rounded-lg bg-success hover:bg-success-bright text-white text-xs font-semibold transition active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Помощь получена (закрыть вызов)</span>
                  </button>
                </div>
              )}

              {/* Case 4: Any other driver viewing the card when someone is already on their way */}
              {event.helperUserId && event.helperUserId !== currentUser.id && event.userId !== currentUser.id && (
                <div className="p-2.5 rounded-xl bg-success/10 border border-success/20 text-center">
                  <p className="text-[11px] text-success font-semibold flex items-center justify-center gap-1.5">
                    <span>🤝</span>
                    <span>{event.helperName} уже едет на помощь!</span>
                  </p>
                </div>
              )}
            </div>
          )}

          {event.description && (
            <div className="p-3.5 rounded-2xl bg-surface-800 border border-white/[0.06] text-xs sm:text-sm text-ink leading-relaxed">
              {event.description}
            </div>
          )}

          {/* Verification Metrics Card */}
          <div className="grid grid-cols-2 gap-2 p-3 rounded-2xl bg-surface-800 border border-white/[0.06] text-center">
            <div>
              <p className="text-lg font-bold text-white">
                {event.confirmationCount}
              </p>
              <p className="text-[10px] text-muted font-normal uppercase tracking-wider">
                {event.type === 'assistance' ? 'откликов' : 'подтверждений'}
              </p>
            </div>
            <div>
              <p className="text-lg font-bold text-accent">
                {Math.round(event.confidenceScore * 100)}%
              </p>
              <p className="text-[10px] text-muted font-normal uppercase tracking-wider">достоверность</p>
            </div>
          </div>

          {/* Remote Confirmation Warning Dialog Prompt */}
          {showRemoteConfirmModal && (
            <div className="p-3.5 rounded-2xl bg-surface-800 border border-warning/40 space-y-2.5 animate-in fade-in">
              <div className="flex items-start gap-2 text-xs">
                <ShieldAlert className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-white">
                    Вы находитесь в {distanceText} от события
                  </p>
                  <p className="text-[11px] text-muted leading-relaxed">
                    Радиус достоверного подтверждения — <strong>1000 метров</strong>. Информация не может считаться гарантированно точной без присутствия на месте.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => setShowRemoteConfirmModal(false)}
                  className="py-2 px-2 text-xs font-medium text-muted hover:text-white bg-white/5 rounded-xl transition"
                >
                  Отмена
                </button>
                <button
                  onClick={() => executeConfirmation(true)}
                  className="py-2 px-2 text-xs font-medium text-white bg-warning/20 border border-warning/40 hover:bg-warning/30 rounded-xl transition"
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
                  ? 'bg-success/20 text-success border border-success/40'
                  : 'bg-accent hover:bg-accent-strong text-white shadow-xs'
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
              className="flex items-center justify-center gap-2 py-3 px-3 rounded-2xl font-medium text-xs text-ink bg-surface-800 hover:bg-surface-700 border border-white/[0.08] transition active:scale-95"
            >
              <MessageCircle className="w-4 h-4 text-muted" />
              <span>Ответить</span>
            </button>
          </div>

          {/* Community Stream */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted">
                Последние сообщения ({event.comments?.length || 0})
              </h3>
              <button
                onClick={handleShare}
                className="flex items-center gap-1 text-xs text-accent hover:underline font-normal"
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
                    className="p-3 rounded-2xl bg-surface-800 border border-white/[0.05] text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between text-[11px] text-muted">
                      <span className="font-medium text-white">{cm.authorName}</span>
                      <span>{getTimeAgo(cm.createdAt)}</span>
                    </div>
                    <p className="text-ink leading-relaxed">{cm.content}</p>
                  </div>
                ))
              ) : (
                <p className="text-xs text-faint italic py-2 text-center">
                  Пока нет комментариев
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Comment Input Footer */}
        <form
          onSubmit={handleAddComment}
          className="p-3 sm:p-4 bg-graphite-900 border-t border-white/[0.08] flex items-center gap-2 safe-bottom"
        >
          <input
            id="comment-input"
            type="text"
            placeholder="Написать сообщение..."
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            className="flex-1 text-sm bg-surface-800 rounded-full px-4 py-2.5 outline-none border border-white/[0.08] focus:border-accent/60 text-white placeholder:text-faint"
          />
          <button
            type="submit"
            disabled={!commentText.trim() || isSubmittingComment}
            className="p-2.5 bg-accent hover:bg-accent-strong disabled:opacity-30 text-white rounded-full transition active:scale-95 shadow-xs"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
