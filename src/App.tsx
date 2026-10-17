import React, { useState, useEffect, useCallback, useRef } from 'react';
import { EventType, RoadEvent, FuelStation, DriverQuestion, RoutePlan, UserProfile } from './types';
import { EventService } from './services/eventService';
import { StationService } from './services/stationService';
import { QuestionService } from './services/questionService';
import { UserService } from './services/userService';
import { TelegramService } from './services/telegramService';
import { ChannelSubscriptionStatus } from './services/telegramService';
import { useGeolocation } from './hooks/useGeolocation';
import { localRealtime } from './lib/supabase';

// Components
import { SplashScreen } from './components/common/SplashScreen';
import { TopHeader } from './components/layout/TopHeader';
import { BottomNav, NavTab } from './components/layout/BottomNav';
import { RoadMap } from './components/map/RoadMap';
import { EventDetailSheet } from './components/events/EventDetailSheet';
import { CreateEventModal } from './components/events/CreateEventModal';
import { QuickSosModal } from './components/events/QuickSosModal';
import { AskQuestionModal } from './components/questions/AskQuestionModal';
import { QuestionFeed } from './components/questions/QuestionFeed';
import { DriverChat } from './components/chat/DriverChat';
import { RoutePlanner } from './components/route/RoutePlanner';
import { StationSheet } from './components/stations/StationSheet';
import { UserProfileModal } from './components/profile/UserProfile';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { AboutServiceModal } from './components/common/AboutServiceModal';
import { SubscriptionGate } from './components/gate/SubscriptionGate';
import { OnboardingTutorial } from './components/common/OnboardingTutorial';
import { SponsoredDetailModal } from './components/ads/SponsoredDetailModal';
import { ReportTypePicker } from './components/events/ReportTypePicker';
import { AdService } from './services/adService';
import { SponsoredBanner } from './types';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [splashFinished, setSplashFinished] = useState(false);
  const [isTelegramWebApp, setIsTelegramWebApp] = useState(() => TelegramService.isTelegramClient());
  const [isTelegramAuthenticated, setIsTelegramAuthenticated] = useState(false);
  const [webLoginStatus, setWebLoginStatus] = useState<'checking'|'available'|'unavailable'|'authenticated'>('checking');
  const [guestLoginPrompt, setGuestLoginPrompt] = useState(false);
  const [selectedPublicQuestion, setSelectedPublicQuestion] = useState<DriverQuestion | null>(null);
  const [isAdminAuthorized, setIsAdminAuthorized] = useState(false);
  const [staffRole, setStaffRole] = useState<'driver' | 'moderator' | 'admin' | 'owner'>('driver');
  const [telegramAuthError, setTelegramAuthError] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<ChannelSubscriptionStatus | null>(null);
  const [subscriptionChecking, setSubscriptionChecking] = useState(false);
  const [activeTab, setActiveTab] = useState<NavTab>('map');
  const [selectedCategory, setSelectedCategory] = useState<EventType | 'all' | 'question' | 'station'>('all');
  const [events, setEvents] = useState<RoadEvent[]>([]);
  const [stations, setStations] = useState<FuelStation[]>([]);
  const [questions, setQuestions] = useState<DriverQuestion[]>([]);
  const [activeRoute, setActiveRoute] = useState<RoutePlan | null>(null);
  const [sponsoredBanners, setSponsoredBanners] = useState<SponsoredBanner[]>([]);
  const [selectedSponsoredPlace, setSelectedSponsoredPlace] = useState<SponsoredBanner | null>(null);

  // Pin Picker & Modals
  const [isPinPickerMode, setIsPinPickerMode] = useState(false);
  const [isReportTypePickerOpen, setIsReportTypePickerOpen] = useState(false);
  const [selectedReportType, setSelectedReportType] = useState<EventType | null>(null);
  const [pinPickerTarget, setPinPickerTarget] = useState<'event' | 'question'>('event');
  const [pickedLocation, setPickedLocation] = useState<{
    coords: { lat: number; lng: number };
    address: string;
  } | null>(null);

  const [selectedEvent, setSelectedEvent] = useState<RoadEvent | null>(null);
  const [selectedStation, setSelectedStation] = useState<FuelStation | null>(null);
  const [isCreateEventOpen, setIsCreateEventOpen] = useState(false);
  const [isQuickSosOpen, setIsQuickSosOpen] = useState(false);
  const [isAskQuestionOpen, setIsAskQuestionOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [targetLocation, setTargetLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [criticalBanner, setCriticalBanner] = useState<{ title: string; message: string; eventId?: string } | null>(null);

  // User & Geolocation
  const [currentUser, setCurrentUser] = useState<UserProfile>(UserService.getCurrentUser());
  const { coords: userCoords, refreshLocation, permissionGranted, positionAt: gpsPositionAt, accuracyM: gpsAccuracyM } = useGeolocation(isTelegramAuthenticated);

  // Prevent an older in-flight poll from replacing a newer event list.
  const dataLoadSequenceRef = useRef(0);

  // Load Data
  const reloadData = useCallback(async () => {
    const loadSequence = ++dataLoadSequenceRef.current;
    const loadedEvents = await EventService.getEventsAsync().catch((error) => {
      console.warn('Could not load events:', error);
      return isTelegramAuthenticated ? EventService.getEvents() : [];
    });
    if (loadSequence === dataLoadSequenceRef.current) {
      setEvents(loadedEvents);
    }
    // Stations now live in Supabase, so the list is only available after the
    // network read resolves. Read them after the await, not before.
    await StationService.initialize().catch((error) => {
      console.warn('Could not load stations:', error);
    });
    setStations(StationService.getStations());
    const loadedQuestions = await QuestionService.getQuestionsAsync().catch((error) => { console.warn('Could not load questions:', error); return isTelegramAuthenticated ? QuestionService.getQuestions() : []; });
    setQuestions(loadedQuestions);
  }, [isTelegramAuthenticated]);

  // Telegram Auto-authorization. Never trust initDataUnsafe for identity.
  useEffect(() => {
    let cancelled = false;
    const isTg = TelegramService.isTelegramClient();
    TelegramService.ready();

    if (!isTg) {
      // Safari/PWA has no Telegram.WebApp.initData. Restore an existing
      // server-verified cookie or offer Telegram OIDC authorization.
      Promise.all([
        TelegramService.standaloneLoginEnabled().catch(() => false),
        TelegramService.getStandaloneSession().catch(() => null),
      ]).then(([enabled, auth]) => {
        if (cancelled) return;
        if (!auth) {
          setWebLoginStatus(enabled ? 'available' : 'unavailable');
          return;
        }
        const synced = UserService.syncTelegramUser(auth.user, auth.role ?? 'driver');
        setCurrentUser(synced);
        setStaffRole(auth.role ?? 'driver');
        setIsAdminAuthorized(Boolean(auth.isAdmin));
        setIsTelegramAuthenticated(true);
        setWebLoginStatus('authenticated');
      }).catch(() => {
        if (!cancelled) setWebLoginStatus('unavailable');
      });
      return () => { cancelled = true; };
    }

    setIsTelegramWebApp(true);
    setTelegramAuthError(null);

    TelegramService.authenticate()
      .then((auth) => {
        if (cancelled) return;
        const synced = UserService.syncTelegramUser(auth.user, auth.isAdmin ? 'admin' : 'driver');
        setCurrentUser(synced);
        setIsAdminAuthorized(Boolean(auth.isAdmin));
        setStaffRole(auth.role ?? (auth.isAdmin ? 'admin' : 'driver'));
        setIsTelegramAuthenticated(true);
      })
      .catch((error: any) => {
        if (cancelled) return;
        TelegramService.clearSession();
        setIsTelegramAuthenticated(false);
        setTelegramAuthError(error?.message || 'Не удалось подтвердить Telegram-сеанс');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // After a successful login, ask the server whether the mandatory channel
  // subscription is satisfied. The server verifies it through the Bot API.
  const checkSubscriptionGate = useCallback(async () => {
    setSubscriptionChecking(true);
    try {
      const status = await TelegramService.checkChannelSubscription();
      setSubscriptionStatus(status);
    } catch {
      setSubscriptionStatus(null);
    } finally {
      setSubscriptionChecking(false);
    }
  }, []);

  useEffect(() => {
    if (!isTelegramAuthenticated) return;
    checkSubscriptionGate();
  }, [isTelegramAuthenticated, checkSubscriptionGate]);

  const handleSplashComplete = useCallback(() => {
    setSplashFinished(true);
    setShowSplash(false);
  }, []);

  const loadSponsoredBanners = useCallback(async () => {
    // Ads are non-critical, so a failed load retries once instead of surfacing
    // an error banner the user cannot act on.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await AdService.loadPublic();
        setSponsoredBanners(AdService.getBanners());
        return;
      } catch (error) {
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
    setSponsoredBanners([]);
  }, []);

  useEffect(() => {
    loadSponsoredBanners();
  }, [loadSponsoredBanners]);

  // One impression per banner per session, so the owner sees reach rather than
  // a number inflated by carousel re-renders.
  const countedImpressions = useRef<Set<string>>(new Set());
  useEffect(() => {
    sponsoredBanners.forEach((ad) => {
      if (countedImpressions.current.has(ad.id)) return;
      countedImpressions.current.add(ad.id);
      void AdService.registerImpression(ad.id).catch(() => {});
    });
  }, [sponsoredBanners]);

  const handleSponsoredClick = useCallback((ad: SponsoredBanner) => {
    void AdService.registerClick(ad.id).catch(() => {});
  }, []);

  // A private per-call dialog (`event-<id>`): the SOS author and the accepted
  // helper negotiate details there (place / time / price) after one side accepts.
  const [directChatChannel, setDirectChatChannel] = useState<{
    id: string;
    name: string;
    description: string;
  } | null>(null);

  const handleOpenEventChat = useCallback((ev: RoadEvent) => {
    setDirectChatChannel({
      id: `event-${ev.id}`,
      name: 'Диалог по вызову',
      description: `${ev.title} · ${ev.address}`,
    });
    setSelectedEvent(null);
    setActiveTab('chat');
  }, []);

  // Nearby-alert heartbeat. Only send real GPS positions (never map-center
  // fallbacks). Position updates arrive continuously from watchPosition; the
  // heartbeat also refreshes every 4 minutes while the Mini App is foregrounded.
  const lastHeartbeatRef = useRef<{ lat: number; lng: number; at: number } | null>(null);
  const currentCoordsRef = useRef(userCoords);
  const currentFixAtRef = useRef(gpsPositionAt);
  const heartbeatInFlightRef = useRef(false);
  const sendHeartbeatRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    currentCoordsRef.current = userCoords;
    currentFixAtRef.current = gpsPositionAt;
    sendHeartbeatRef.current?.();
  }, [userCoords, gpsPositionAt]);

  useEffect(() => {
    if (!permissionGranted || !isTelegramAuthenticated) {
      sendHeartbeatRef.current = null;
      return;
    }

    let active = true;
    const sendHeartbeat = async () => {
      const coords = currentCoordsRef.current;
      if (!active || !coords || heartbeatInFlightRef.current) return;

      const now = Date.now();
      const fixAt = currentFixAtRef.current;
      // Never turn a cached position into a fresh server heartbeat.
      if (!fixAt || fixAt > now + 60_000 || now - fixAt > 120_000) return;
      const last = lastHeartbeatRef.current;
      const movedM = last
        ? EventService.calculateDistanceMeters(last.lat, last.lng, coords.lat, coords.lng)
        : Number.POSITIVE_INFINITY;
      // Refresh on movement of 150 m, or at least every 4 minutes even if the
      // vehicle is stopped. This keeps recipients' proximity data fresh.
      if (last && now - last.at < 4 * 60_000 && movedM < 150) return;

      heartbeatInFlightRef.current = true;
      try {
        const response = await fetch('/api/drivers/location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ coords: { lat: coords.lat, lng: coords.lng } }),
        });
        if (response.ok && active) {
          lastHeartbeatRef.current = { lat: coords.lat, lng: coords.lng, at: Date.now() };
        }
      } catch {
        // The next movement or scheduled heartbeat retries without blocking the map.
      } finally {
        heartbeatInFlightRef.current = false;
      }
    };

    sendHeartbeatRef.current = () => { void sendHeartbeat(); };
    void sendHeartbeat();
    const heartbeatTimer = window.setInterval(() => { void sendHeartbeat(); }, 4 * 60_000);
    return () => {
      active = false;
      window.clearInterval(heartbeatTimer);
      sendHeartbeatRef.current = null;
    };
  }, [isTelegramAuthenticated, permissionGranted]);

  useEffect(() => {
    reloadData();
    TelegramService.ready();

    // Show onboarding on the first run outside of Telegram
    const onboardingDone = localStorage.getItem('roadlive_tutorial_completed');
    if (!onboardingDone && !TelegramService.isTelegramClient()) {
      setShowOnboarding(true);
    }

    // Setup periodic refresh & automatic 24h archiving (every 15 seconds —
    // an assistance call must show "help is on the way" / "closed" quickly,
    // WebSocket realtime is unavailable on Vercel so polling is the channel)
    const interval = setInterval(() => {
      EventService.refreshEventStatuses();
      EventService.archiveOldEvents();
      void EventService.getEventsAsync()
        .then(setEvents)
        .catch(() => setEvents(isTelegramAuthenticated ? EventService.getEvents() : []));
    }, 15000);

    // Realtime listeners
    const unsubEvents = localRealtime.subscribe('events_channel', (payload: any) => {
      if (payload.type === 'INSERT' && payload.event) {
        setEvents((prev) => [payload.event, ...prev.filter((e) => e.id !== payload.event.id)]);

        // Do not show the critical notification banner to the user who reported it!
        if (payload.event.userId === currentUser.id) {
          return;
        }

        // Check if critical (severe accident or blocked crossing)
        const isUrgent =
          payload.event.type === 'accident' ||
          (payload.event.type === 'crossing' && payload.event.subType === 'closed');

        if (isUrgent) {
          setCriticalBanner({
            title: payload.event.title,
            message: payload.event.address,
            eventId: payload.event.id,
          });
        }
      } else if (payload.type === 'UPDATE' && payload.event) {
        // Another driver responded to / closed a call — sync immediately instead
        // of waiting for the next poll (WebSocket realtime is dead on Vercel).
        setEvents((prev) => prev.map((e) => (e.id === payload.event.id ? payload.event : e)));
      }
    });

    return () => {
      clearInterval(interval);
      unsubEvents();
    };
  }, [reloadData, currentUser.id, isTelegramAuthenticated]);

  const askForLogin = () => setGuestLoginPrompt(true);

  const handleSelectLocation = (lat: number, lng: number) => {
    setTargetLocation({ lat, lng });
    setActiveTab('map');
  };

  const handleRecenter = () => {
    refreshLocation();
    if (userCoords) {
      setTargetLocation({ lat: userCoords.lat, lng: userCoords.lng });
    }
  };

  // Filter events based on selected category
  const filteredEvents = events.filter((e) => {
    if (e.status === 'hidden') return false;
    if (selectedCategory === 'all') return true;
    if (selectedCategory === 'question' || selectedCategory === 'station') return false;
    return e.type === selectedCategory;
  });

  const displayStations = selectedCategory === 'all' || selectedCategory === 'station' ? stations : [];
  const displayQuestions = selectedCategory === 'all' || selectedCategory === 'question' ? questions : [];

  if (isTelegramWebApp && !isTelegramAuthenticated && !telegramAuthError) {
    // The account is created on the server from Telegram data during this same
    // call, so the welcome animation covers the whole handshake instead of a
    // spinner card. It also keeps running until authentication resolves.
    return <SplashScreen onComplete={handleSplashComplete} />;
  }

  if (isTelegramWebApp && !isTelegramAuthenticated) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 bg-graphite text-center">
        <div className="w-full max-w-sm p-7 bg-surface-800 border border-white/[0.08] rounded-3xl space-y-4">
          <div className="text-3xl">🔐</div>
          <h1 className="text-lg font-bold text-white">Не удалось войти</h1>
          <p className="text-xs text-muted leading-relaxed">
            {telegramAuthError}
          </p>
          <button
            onClick={async () => {
              setTelegramAuthError(null);
              try {
                const auth = await TelegramService.authenticate();
                const synced = UserService.syncTelegramUser(auth.user, auth.role ?? (auth.isAdmin ? 'admin' : 'driver'));
                setCurrentUser(synced);
                setIsAdminAuthorized(Boolean(auth.isAdmin));
                setStaffRole(auth.role ?? (auth.isAdmin ? 'admin' : 'driver'));
                setIsTelegramAuthenticated(true);
              } catch (error: any) {
                setTelegramAuthError(error?.message || 'Не удалось подтвердить Telegram-сеанс');
              }
            }}
            className="w-full py-3 rounded-2xl bg-telegram text-white text-xs font-bold"
          >
            Повторить
          </button>
        </div>
      </div>
    );
  }

  // Mandatory channel gate: the whole app is replaced by the subscription
  // screen until the server confirms the user is a channel member.
  if (isTelegramAuthenticated && subscriptionStatus?.enabled && !subscriptionStatus.subscribed) {
    return (
      <SubscriptionGate
        status={subscriptionStatus}
        checking={subscriptionChecking}
        onCheck={checkSubscriptionGate}
      />
    );
  }

  return (
    <div className="fixed inset-0 w-full h-full overflow-hidden bg-graphite flex flex-col font-sans select-none text-ink">
      {/* 1.2s Automotive Splash Screen */}
      {showSplash && <SplashScreen onComplete={handleSplashComplete} />}
      {!isTelegramAuthenticated && !isTelegramWebApp && (
        <div className="absolute left-3 right-3 bottom-20 z-40 pointer-events-none flex justify-center">
          <button type="button" onClick={askForLogin}
            className="pointer-events-auto rounded-full bg-surface-800/95 backdrop-blur-xl border border-accent/50 px-4 py-2.5 text-white text-xs shadow-xl flex items-center gap-2">
            <span className="text-success text-base">●</span>
            Гостевой просмотр · Войти через Telegram →
          </button>
        </div>
      )}

      {/* Critical Road Incident Toast Banner (Dark Glass Capsule) */}
      {criticalBanner && (
        <aside
          role="status"
          aria-live="polite"
          onClick={() => {
            if (criticalBanner.eventId) {
              const ev = events.find((e) => e.id === criticalBanner.eventId);
              if (ev) {
                setSelectedEvent(ev);
                setTargetLocation({ lat: ev.latitude, lng: ev.longitude });
                setActiveTab('map');
              }
            }
            setCriticalBanner(null);
          }}
          className="fixed top-3 left-1/2 -translate-x-1/2 z-50 bg-surface-800/95 backdrop-blur-2xl text-white px-4 py-2.5 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.6)] border border-white/10 flex items-center justify-between gap-3 max-w-md w-[92%] sm:w-auto cursor-pointer hover:border-white/20 transition-all animate-in slide-in-from-top duration-300"
        >
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-danger animate-ping shrink-0" />
            <div>
              <p className="text-xs font-semibold leading-tight tracking-tight">
                {criticalBanner.title}
              </p>
              <p className="text-[11px] text-muted line-clamp-1 mt-0.5">
                {criticalBanner.message}
              </p>
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setCriticalBanner(null);
            }}
            className="p-1 rounded-full text-muted hover:text-white"
          >
            ✕
          </button>
        </aside>
      )}

      {/* Top Header - Visible on map tab unless in Pin Placement Mode */}
      {activeTab === 'map' && !isPinPickerMode && (
        <TopHeader
          selectedCategory={selectedCategory}
          onSelectCategory={(cat) => setSelectedCategory(cat)}
          currentUser={currentUser}
          onOpenProfile={() => isTelegramAuthenticated ? setActiveTab('profile') : askForLogin()}
          onOpenAdmin={() => isTelegramAuthenticated ? setIsAdminOpen(true) : askForLogin()}
          onOpenAbout={() => setIsAboutOpen(true)}
          sponsoredBanners={sponsoredBanners}
          onSelectSponsoredPlace={(ad) => setSelectedSponsoredPlace(ad)}
          events={events}
          userCoords={userCoords}
          onSelectEvent={(ev) => {
            setSelectedStation(null);
            setSelectedEvent(ev);
            setTargetLocation({ lat: ev.latitude, lng: ev.longitude });
          }}
        />
      )}

      {/* Main Viewport Router based on activeTab */}
      <main className="relative flex-1 w-full h-full overflow-hidden">
        {activeTab === 'map' && (
          <RoadMap
            events={filteredEvents}
            stations={displayStations}
            questions={displayQuestions}
            activeRoute={activeRoute}
            userCoords={userCoords}
            onSelectEvent={(ev) => {
              setSelectedStation(null);
              setSelectedEvent(ev);
            }}
            onSelectStation={(st) => {
              setSelectedEvent(null);
              setSelectedStation(st);
            }}
            onSelectQuestion={(question) => {
              setSelectedEvent(null);
              setSelectedStation(null);
              if (!isTelegramAuthenticated) setSelectedPublicQuestion(question);
              else setActiveTab('questions');
            }}
            onOpenCreateEvent={() => {
              if (!isTelegramAuthenticated) return askForLogin();
              setPinPickerTarget('event');
              setActiveTab('map');
              setIsReportTypePickerOpen(true);
            }}
            onOpenAskQuestion={() => isTelegramAuthenticated ? setIsAskQuestionOpen(true) : askForLogin()}
            onOpenRoute={() => isTelegramAuthenticated ? setActiveTab('route') : askForLogin()}
            onRecenter={handleRecenter}
            targetLocation={targetLocation}
            isPinPickerMode={isPinPickerMode}
            pinPickerType={pinPickerTarget === 'event' ? selectedReportType : null}
            onSosClosed={(updated) => {
              setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
              setSelectedEvent((prev) => (prev && prev.id === updated.id ? updated : prev));
              reloadData();
            }}
            onConfirmPinLocation={(coords, address) => {
              setPickedLocation({ coords, address });
              setIsPinPickerMode(false);
              if (pinPickerTarget === 'question') {
                setIsAskQuestionOpen(true);
              } else {
                setIsCreateEventOpen(true);
              }
            }}
            onCancelPinPicker={() => {
              setIsPinPickerMode(false);
              setSelectedReportType(null);
            }}
            sponsoredBanners={sponsoredBanners}
            onCloseAdBanner={(id) => {
              AdService.closeBanner(id);
              setSponsoredBanners(AdService.getBanners());
            }}
            onSelectSponsoredPlace={(ad) => setSelectedSponsoredPlace(ad)}
          />
        )}

        {activeTab === 'chat' && (
          <DriverChat
            currentUser={currentUser}
            userCoords={userCoords}
            directChannel={directChatChannel}
            onExitDirect={() => setDirectChatChannel(null)}
            onFocusMap={(lat, lng) => {
              setTargetLocation({ lat, lng });
              setActiveTab('map');
            }}
          />
        )}

        {activeTab === 'questions' && (
          <QuestionFeed
            questions={questions}
            currentUser={currentUser}
            userCoords={userCoords}
            onOpenAskModal={() => setIsAskQuestionOpen(true)}
            onFocusMap={(lat, lng) => {
              setTargetLocation({ lat, lng });
              setActiveTab('map');
            }}
            onQuestionUpdated={reloadData}
          />
        )}

        {activeTab === 'route' && (
          <RoutePlanner
            activeEvents={events}
            activeRoute={activeRoute}
            onSetRoute={(route) => {
              setActiveRoute(route);
              if (route) setActiveTab('map');
            }}
            onClose={() => setActiveTab('map')}
            userCoords={userCoords}
          />
        )}

        {activeTab === 'stations' && (
          <div className="h-full flex flex-col bg-graphite overflow-hidden pb-16 select-none">
            <div className="p-4 sm:p-5 bg-surface-800/80 backdrop-blur-2xl border-b border-white/[0.08]">
              <div className="max-w-2xl mx-auto">
                <h1 className="text-base sm:text-lg font-semibold text-white tracking-tight leading-tight">
                  АЗС и очереди на заправках
                </h1>
                <p className="text-xs text-muted">
                  Цены на топливо и статус очередей в реальном времени
                </p>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 max-w-2xl mx-auto w-full">
              {stations.map((st) => (
                <div
                  key={st.id}
                  onClick={() => setSelectedStation(st)}
                  className="p-4 sm:p-5 bg-surface-800 rounded-2xl border border-white/[0.08] hover:border-white/20 transition-all cursor-pointer flex items-center justify-between active:scale-[0.98]"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm sm:text-base font-semibold text-white">{st.name}</span>
                      <span className="text-[10px] bg-surface-700 text-muted px-2 py-0.5 rounded-md font-medium">
                        {st.brand}
                      </span>
                    </div>
                    <p className="text-xs text-muted mt-1">{st.address}</p>
                    <div className="flex gap-2.5 mt-2.5 text-xs">
                      {st.fuelTypes.ai95 && (
                        <span className="text-muted">95: <strong className="text-white">{st.fuelTypes.ai95.toFixed(2)} ₽</strong></span>
                      )}
                      {st.fuelTypes.ai92 && (
                        <span className="text-muted">92: <strong className="text-white">{st.fuelTypes.ai92.toFixed(2)} ₽</strong></span>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <span
                      className={`inline-block px-3 py-1 rounded-xl text-xs font-medium border ${
                        st.queueStatus === 'none'
                          ? 'bg-success/10 text-success border-success/20'
                          : st.queueStatus === 'small'
                          ? 'bg-warning/10 text-warning border-warning/20'
                          : 'bg-danger/10 text-danger border-danger/20'
                      }`}
                    >
                      {st.queueStatus === 'none'
                        ? 'Свободно'
                        : st.queueStatus === 'small'
                        ? '2–4 авто'
                        : 'Большая'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'profile' && (
          <UserProfileModal
            currentUser={currentUser}
            events={events}
            questions={questions}
            onClose={() => setActiveTab('map')}
            onOpenAdmin={() => setIsAdminOpen(true)}
            onSettingsChange={reloadData}
          />
        )}
      </main>

      {/* Selected Event Details Sheet */}
      {selectedEvent && isTelegramAuthenticated && (
        <EventDetailSheet
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          currentUser={currentUser}
          userCoords={userCoords}
          onEventUpdated={(updated) => {
            setSelectedEvent(updated);
            reloadData();
          }}
          onOpenChat={handleOpenEventChat}
        />
      )}

      {/* Selected Station Details Sheet */}
      {selectedStation && isTelegramAuthenticated && (
        <StationSheet
          station={selectedStation}
          onClose={() => setSelectedStation(null)}
          currentUser={currentUser}
          onStationUpdated={(updated) => {
            setSelectedStation(updated);
            reloadData();
          }}
        />
      )}

      {!isTelegramAuthenticated && selectedEvent && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-end justify-center" onClick={() => setSelectedEvent(null)}>
          <div role="dialog" aria-modal="true" aria-label="Просмотр события"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-xl bg-surface-800 border border-white/10 rounded-t-3xl p-5 pb-8 text-white space-y-3 shadow-2xl">
            <div className="flex justify-between gap-3 items-center"><b className="text-lg">{selectedEvent.title}</b>
              <button onClick={() => setSelectedEvent(null)} className="text-xl px-2" aria-label="Закрыть">×</button></div>
            <p className="text-sm text-muted">{selectedEvent.address}</p>
            <p className="text-sm leading-relaxed">{selectedEvent.description}</p>
            <p className="text-xs text-muted">Просмотр доступен всем. Подтверждение и комментарии — после входа.</p>
            <button onClick={() => { setSelectedEvent(null); askForLogin(); }} className="w-full py-3 rounded-xl bg-telegram font-bold">Войти через Telegram</button>
          </div>
        </div>
      )}
      {!isTelegramAuthenticated && selectedStation && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-end justify-center" onClick={() => setSelectedStation(null)}>
          <div role="dialog" aria-modal="true" aria-label="Просмотр АЗС"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-xl bg-surface-800 rounded-t-3xl p-5 pb-8 text-white space-y-3">
            <div className="flex justify-between"><b className="text-lg">{selectedStation.name}</b>
              <button onClick={() => setSelectedStation(null)} aria-label="Закрыть" className="text-xl px-2">×</button></div>
            <p className="text-sm text-muted">{selectedStation.address}</p>
            <p className="text-xs text-muted">Сообщить об очереди можно после входа через Telegram.</p>
            <button onClick={() => { setSelectedStation(null); askForLogin(); }} className="w-full py-3 rounded-xl bg-telegram font-bold">Войти через Telegram</button>
          </div>
        </div>
      )}
      {!isTelegramAuthenticated && selectedPublicQuestion && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-end justify-center" onClick={() => setSelectedPublicQuestion(null)}>
          <div role="dialog" aria-modal="true" aria-label="Вопрос водителя"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-xl bg-surface-800 rounded-t-3xl p-5 pb-8 text-white space-y-3">
            <div className="flex justify-between"><b className="text-base">Вопрос на карте</b>
              <button onClick={() => setSelectedPublicQuestion(null)} aria-label="Закрыть" className="text-xl px-2">×</button></div>
            <p>{selectedPublicQuestion.question}</p>
            <p className="text-sm text-muted">{selectedPublicQuestion.address}</p>
            <p className="text-xs text-muted">Ответы доступны после авторизации через Telegram.</p>
            <button onClick={() => { setSelectedPublicQuestion(null); askForLogin(); }} className="w-full py-3 rounded-xl bg-telegram font-bold">Войти через Telegram</button>
          </div>
        </div>
      )}
      {!isTelegramAuthenticated && guestLoginPrompt && (
        <div className="fixed inset-0 z-[70] bg-black/75 flex items-center justify-center p-5" onClick={() => setGuestLoginPrompt(false)}>
          <div role="dialog" aria-modal="true" aria-label="Войти для участия"
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-sm bg-surface-800 rounded-3xl border border-white/10 p-6 text-white space-y-4 shadow-2xl">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold">Участвуйте в ROAD LIVE</h2>
              <button onClick={() => setGuestLoginPrompt(false)} aria-label="Закрыть" className="px-2 text-xl">×</button>
            </div>
            <p className="text-sm text-muted">Карту можно смотреть без регистрации. Для публикации меток, SOS, подтверждений, ответов и чата нужен вход через Telegram.</p>
            {webLoginStatus === 'available' ? (
              <a href="/api/auth/telegram/login" className="block text-center bg-telegram rounded-xl p-3 font-bold">Войти через Telegram</a>
            ) : (
              <p className="text-sm text-warning">Вход через браузер ещё не активирован. Откройте ROAD LIVE из Telegram Mini App; для входа через сайт потребуется настройка Telegram Login в BotFather.</p>
            )}
          </div>
        </div>
      )}

      {/* Choose the report category before moving its matching marker on the map. */}
      <ReportTypePicker
        isOpen={isReportTypePickerOpen}
        onClose={() => setIsReportTypePickerOpen(false)}
        onSelect={(type) => {
          if (!isTelegramAuthenticated) return askForLogin();
          setSelectedReportType(type);
          setPinPickerTarget('event');
          setIsReportTypePickerOpen(false);
          setActiveTab('map');
          setIsPinPickerMode(true);
        }}
      />

      {/* Category and location are confirmed before filling in event details. */}
      <CreateEventModal
        isOpen={isCreateEventOpen}
        onClose={() => {
          setIsCreateEventOpen(false);
          setSelectedReportType(null);
        }}
        currentUser={currentUser}
        userCoords={userCoords}
        initialCoords={pickedLocation?.coords}
        initialAddress={pickedLocation?.address}
        initialType={selectedReportType}
        onReopenPinPicker={() => {
          setIsCreateEventOpen(false);
          setPinPickerTarget('event');
          setIsPinPickerMode(true);
        }}
        onEventCreated={(ev) => {
          // Render the marker immediately after the API confirms persistence.
          // The sequence guard prevents a request started before this event from
          // wiping it from the map when that older response arrives late.
          dataLoadSequenceRef.current += 1;
          setEvents((prev) => [ev, ...prev.filter((event) => event.id !== ev.id)]);
          setSelectedEvent(ev);
          setSelectedReportType(null);
          void reloadData();
        }}
      />

      {/* Ask Question Modal */}
      <AskQuestionModal
        isOpen={isAskQuestionOpen}
        onClose={() => setIsAskQuestionOpen(false)}
        currentUser={currentUser}
        userCoords={userCoords}
        initialCoords={pickedLocation?.coords}
        initialAddress={pickedLocation?.address}
        onReopenPinPicker={() => {
          setIsAskQuestionOpen(false);
          setPinPickerTarget('question');
          setActiveTab('map');
          setIsPinPickerMode(true);
        }}
        onQuestionCreated={(newQ) => {
          reloadData();
          setTargetLocation({ lat: newQ.latitude, lng: newQ.longitude });
          setActiveTab('map');
        }}
      />

      {/* Admin Dashboard */}
      {isAdminOpen && isAdminAuthorized && (
        <AdminDashboard
          onClose={() => setIsAdminOpen(false)}
          onRefreshData={reloadData}
          role={staffRole}
        />
      )}

      {/* About Service Modal */}
      {/* Quick SOS Modal */}
      <QuickSosModal
        isOpen={isQuickSosOpen}
        onClose={() => setIsQuickSosOpen(false)}
        currentUser={currentUser}
        userCoords={userCoords}
        gpsPositionAt={gpsPositionAt}
        gpsAccuracyM={gpsAccuracyM}
        onSosCreated={(newSos) => {
          setSelectedEvent(newSos);
          setEvents(EventService.getEvents());
        }}
      />

      <AboutServiceModal
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
      />

      {/* Onboarding Interactive Guide */}
      {showOnboarding && (
        <OnboardingTutorial onClose={() => setShowOnboarding(false)} />
      )}

      {/* 2GIS Style Sponsored Place / Ad Detail Modal */}
      <SponsoredDetailModal
        banner={selectedSponsoredPlace}
        onClose={() => setSelectedSponsoredPlace(null)}
        onNavigateToLocation={(lat, lng) => {
          if (selectedSponsoredPlace) handleSponsoredClick(selectedSponsoredPlace);
          setTargetLocation({ lat, lng });
          setActiveTab('map');
        }}
      />

      {/* Premium Glass Bottom Navigation Bar (Hidden during Pin Placement) */}
      {!isPinPickerMode && (
        isTelegramAuthenticated ? (
          <BottomNav
            activeTab={activeTab}
            onTabChange={(tab) => {
              setActiveTab(tab);
              setSelectedEvent(null);
              setSelectedStation(null);
            }}
            onSosClick={() => setIsQuickSosOpen(true)}
            questionsBadgeCount={questions.filter((q) => q.answersCount === 0).length}
          />
        ) : (
          <nav aria-label="Гостевая навигация" className="relative z-40 w-full flex justify-between items-center gap-2 p-3 pb-[max(12px,env(safe-area-inset-bottom))] bg-surface-800 border-t border-white/10">
            <button type="button" onClick={() => setActiveTab('map')} className="px-5 py-2 rounded-xl bg-white/10 text-sm font-bold text-white">Карта</button>
            <button type="button" onClick={askForLogin} className="px-5 py-2 rounded-xl bg-telegram text-sm font-bold text-white">Войти через Telegram</button>
          </nav>
        )
      )}
    </div>
  );
}
