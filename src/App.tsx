import React, { useState, useEffect, useCallback } from 'react';
import { EventType, RoadEvent, FuelStation, DriverQuestion, RoutePlan, UserProfile } from './types';
import { EventService } from './services/eventService';
import { StationService } from './services/stationService';
import { QuestionService } from './services/questionService';
import { UserService } from './services/userService';
import { TelegramService } from './services/telegramService';
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
import { OnboardingTutorial } from './components/common/OnboardingTutorial';
import { SponsoredDetailModal } from './components/ads/SponsoredDetailModal';
import { AdService } from './services/adService';
import { SponsoredBanner } from './types';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [isTelegramWebApp, setIsTelegramWebApp] = useState(false);
  const [isTelegramAuthenticated, setIsTelegramAuthenticated] = useState(false);
  const [telegramAuthError, setTelegramAuthError] = useState<string | null>(null);
  const [isSimulated, setIsSimulated] = useState(false);
  const [activeTab, setActiveTab] = useState<NavTab>('map');
  const [selectedCategory, setSelectedCategory] = useState<EventType | 'all' | 'question' | 'station'>('all');
  const [events, setEvents] = useState<RoadEvent[]>([]);
  const [stations, setStations] = useState<FuelStation[]>([]);
  const [questions, setQuestions] = useState<DriverQuestion[]>([]);
  const [activeRoute, setActiveRoute] = useState<RoutePlan | null>(null);
  const [sponsoredBanners, setSponsoredBanners] = useState<SponsoredBanner[]>(AdService.getBanners());
  const [selectedSponsoredPlace, setSelectedSponsoredPlace] = useState<SponsoredBanner | null>(null);

  // Pin Picker & Modals
  const [isPinPickerMode, setIsPinPickerMode] = useState(false);
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
  const { coords: userCoords, refreshLocation } = useGeolocation();

  // Load Data
  const reloadData = useCallback(() => {
    setEvents(EventService.getEvents());
    setStations(StationService.getStations());
    setQuestions(QuestionService.getQuestions());
  }, []);

  // Telegram Auto-authorization. Never trust initDataUnsafe for identity.
  useEffect(() => {
    let cancelled = false;
    const isTg = TelegramService.isTelegramWebApp();
    TelegramService.ready();

    if (!isTg) return () => {
      cancelled = true;
    };

    setIsTelegramWebApp(true);
    setTelegramAuthError(null);

    TelegramService.authenticate()
      .then((auth) => {
        if (cancelled) return;
        const synced = UserService.syncTelegramUser(auth.user);
        setCurrentUser(synced);
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

  const handleSimulateTelegram = () => {
    setIsTelegramWebApp(true);
    setIsSimulated(true);
    setTelegramAuthError(null);
    setIsTelegramAuthenticated(true);
    // Simulate real Telegram User profile
    const mockTgUser = {
      id: 7771399,
      first_name: "me.savin13",
      last_name: "Telegram User",
      username: "me_savin13"
    };
    const synced = UserService.syncTelegramUser(mockTgUser);
    setCurrentUser(synced);
    localStorage.setItem('roadlive_tutorial_completed', 'true');
  };

  useEffect(() => {
    reloadData();
    TelegramService.ready();

    // Show onboarding if not completed yet and not simulated/Telegram mode
    const onboardingDone = localStorage.getItem('roadlive_tutorial_completed');
    if (!onboardingDone && !TelegramService.isTelegramWebApp()) {
      setShowOnboarding(true);
    }

    // Setup periodic refresh & automatic 24h archiving (every 30 seconds)
    const interval = setInterval(() => {
      EventService.refreshEventStatuses();
      EventService.archiveOldEvents();
      setEvents(EventService.getEvents());
    }, 30000);

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
      }
    });

    return () => {
      clearInterval(interval);
      unsubEvents();
    };
  }, [reloadData, currentUser.id]);

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

  if (!isTelegramWebApp) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 bg-[#111315] text-center select-none">
        <div className="w-full max-w-sm p-8 bg-[#181B1F]/60 backdrop-blur-3xl border border-white/[0.06] rounded-[32px] shadow-[0_24px_64px_rgba(0,0,0,0.8)] space-y-6 flex flex-col items-center animate-in zoom-in-95 duration-300">
          {/* Icon with pulsing rings */}
          <div className="relative w-20 h-20 rounded-full bg-[#24A1DE]/10 flex items-center justify-center border border-[#24A1DE]/20">
            <div className="absolute inset-0 rounded-full border border-[#24A1DE]/30 animate-ping opacity-75" />
            <span className="text-4xl text-[#24A1DE]">✈️</span>
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-black text-white tracking-tight uppercase">ROADLIVE</h1>
            <p className="text-xs text-[#9AA0A8] leading-relaxed">
              Приложение спроектировано исключительно для работы внутри мессенджера Telegram в качестве Mini App.
            </p>
          </div>

          <div className="w-full space-y-2.5 pt-4">
            <button
              onClick={handleSimulateTelegram}
              className="w-full py-3.5 bg-[#24A1DE] hover:bg-[#208fcf] active:scale-95 text-white font-extrabold text-xs rounded-2xl transition shadow-[0_4px_20px_rgba(36,161,222,0.3)] tracking-wider uppercase cursor-pointer"
            >
              Войти через Telegram 🚀
            </button>
            <a
              href="https://t.me"
              target="_blank"
              rel="noreferrer"
              className="block w-full py-3.5 bg-white/5 hover:bg-white/10 active:scale-95 text-white font-extrabold text-xs rounded-2xl transition border border-white/10 tracking-wider uppercase"
            >
              Открыть бота в Telegram 💬
            </a>
          </div>

          <div className="pt-2">
            <span className="text-[10px] text-[#555A60] uppercase tracking-widest font-bold">
              Only Telegram WebApp Mode
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (isTelegramWebApp && !isTelegramAuthenticated) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 bg-[#111315] text-center">
        <div className="w-full max-w-sm p-7 bg-[#181B1F] border border-white/[0.08] rounded-3xl space-y-4">
          <div className="text-3xl">🔐</div>
          <h1 className="text-lg font-bold text-white">Проверяем Telegram</h1>
          <p className="text-xs text-[#9AA0A8] leading-relaxed">
            {telegramAuthError || 'Подтверждаем ваш Telegram-сеанс…'}
          </p>
          {telegramAuthError && (
            <button
              onClick={async () => {
                setTelegramAuthError(null);
                try {
                  const auth = await TelegramService.authenticate();
                  const synced = UserService.syncTelegramUser(auth.user);
                  setCurrentUser(synced);
                  setIsTelegramAuthenticated(true);
                } catch (error: any) {
                  setTelegramAuthError(error?.message || 'Не удалось подтвердить Telegram-сеанс');
                }
              }}
              className="w-full py-3 rounded-2xl bg-[#24A1DE] text-white text-xs font-bold"
            >
              Повторить
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 w-full h-full overflow-hidden bg-[#111315] flex flex-col font-sans select-none text-[#F0F2F5]">
      {/* 1.2s Automotive Splash Screen */}
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}

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
          className="fixed top-3 left-1/2 -translate-x-1/2 z-50 bg-[#181B1F]/95 backdrop-blur-2xl text-white px-4 py-2.5 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.6)] border border-white/10 flex items-center justify-between gap-3 max-w-md w-[92%] sm:w-auto cursor-pointer hover:border-white/20 transition-all animate-in slide-in-from-top duration-300"
        >
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-[#FF453A] animate-ping shrink-0" />
            <div>
              <p className="text-xs font-semibold leading-tight tracking-tight">
                {criticalBanner.title}
              </p>
              <p className="text-[11px] text-[#9AA0A8] line-clamp-1 mt-0.5">
                {criticalBanner.message}
              </p>
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setCriticalBanner(null);
            }}
            className="p-1 rounded-full text-[#9AA0A8] hover:text-white"
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
          onOpenProfile={() => setActiveTab('profile')}
          onOpenAdmin={() => setIsAdminOpen(true)}
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
            onSelectQuestion={() => {
              setSelectedEvent(null);
              setSelectedStation(null);
              setActiveTab('questions');
            }}
            onOpenCreateEvent={() => {
              setPinPickerTarget('event');
              setActiveTab('map');
              setIsPinPickerMode(true);
            }}
            onOpenQuickSos={() => setIsQuickSosOpen(true)}
            onOpenAskQuestion={() => setIsAskQuestionOpen(true)}
            onOpenChat={() => setActiveTab('chat')}
            onRecenter={handleRecenter}
            targetLocation={targetLocation}
            isPinPickerMode={isPinPickerMode}
            onConfirmPinLocation={(coords, address) => {
              setPickedLocation({ coords, address });
              setIsPinPickerMode(false);
              if (pinPickerTarget === 'question') {
                setIsAskQuestionOpen(true);
              } else {
                setIsCreateEventOpen(true);
              }
            }}
            onCancelPinPicker={() => setIsPinPickerMode(false)}
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
          <div className="h-full flex flex-col bg-[#111315] overflow-hidden pb-16 select-none">
            <div className="p-4 sm:p-5 bg-[#181B1F]/80 backdrop-blur-2xl border-b border-white/[0.08]">
              <div className="max-w-2xl mx-auto">
                <h1 className="text-base sm:text-lg font-semibold text-white tracking-tight leading-tight">
                  АЗС и очереди на заправках
                </h1>
                <p className="text-xs text-[#9AA0A8]">
                  Цены на топливо и статус очередей в реальном времени
                </p>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 max-w-2xl mx-auto w-full">
              {stations.map((st) => (
                <div
                  key={st.id}
                  onClick={() => setSelectedStation(st)}
                  className="p-4 sm:p-5 bg-[#181B1F] rounded-2xl border border-white/[0.08] hover:border-white/20 transition-all cursor-pointer flex items-center justify-between active:scale-[0.98]"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm sm:text-base font-semibold text-white">{st.name}</span>
                      <span className="text-[10px] bg-[#20242A] text-[#9AA0A8] px-2 py-0.5 rounded-md font-medium">
                        {st.brand}
                      </span>
                    </div>
                    <p className="text-xs text-[#9AA0A8] mt-1">{st.address}</p>
                    <div className="flex gap-2.5 mt-2.5 text-xs">
                      {st.fuelTypes.ai95 && (
                        <span className="text-[#9AA0A8]">95: <strong className="text-white">{st.fuelTypes.ai95.toFixed(2)} ₽</strong></span>
                      )}
                      {st.fuelTypes.ai92 && (
                        <span className="text-[#9AA0A8]">92: <strong className="text-white">{st.fuelTypes.ai92.toFixed(2)} ₽</strong></span>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <span
                      className={`inline-block px-3 py-1 rounded-xl text-xs font-medium border ${
                        st.queueStatus === 'none'
                          ? 'bg-[#34C759]/10 text-[#34C759] border-[#34C759]/20'
                          : st.queueStatus === 'small'
                          ? 'bg-[#E5A93C]/10 text-[#E5A93C] border-[#E5A93C]/20'
                          : 'bg-[#FF453A]/10 text-[#FF453A] border-[#FF453A]/20'
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
            onSelectUser={(u) => setCurrentUser(u)}
            onClose={() => setActiveTab('map')}
            onOpenAdmin={() => setIsAdminOpen(true)}
            onSettingsChange={reloadData}
          />
        )}
      </main>

      {/* Selected Event Details Sheet */}
      {selectedEvent && (
        <EventDetailSheet
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          currentUser={currentUser}
          userCoords={userCoords}
          onEventUpdated={(updated) => {
            setSelectedEvent(updated);
            reloadData();
          }}
        />
      )}

      {/* Selected Station Details Sheet */}
      {selectedStation && (
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

      {/* Create Event Modal (Pre-filled from Map Pin Placement) */}
      <CreateEventModal
        isOpen={isCreateEventOpen}
        onClose={() => setIsCreateEventOpen(false)}
        currentUser={currentUser}
        userCoords={userCoords}
        initialCoords={pickedLocation?.coords}
        initialAddress={pickedLocation?.address}
        onReopenPinPicker={() => {
          setIsCreateEventOpen(false);
          setIsPinPickerMode(true);
        }}
        onEventCreated={(ev) => {
          setSelectedEvent(ev);
          reloadData();
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
      {isAdminOpen && (
        <AdminDashboard
          onClose={() => setIsAdminOpen(false)}
          onRefreshData={reloadData}
        />
      )}

      {/* About Service Modal */}
      {/* Quick SOS Modal */}
      <QuickSosModal
        isOpen={isQuickSosOpen}
        onClose={() => setIsQuickSosOpen(false)}
        currentUser={currentUser}
        userCoords={userCoords}
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
          setTargetLocation({ lat, lng });
          setActiveTab('map');
        }}
      />

      {/* Premium Glass Bottom Navigation Bar (Hidden during Pin Placement) */}
      {!isPinPickerMode && (
        <BottomNav
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab);
            setSelectedEvent(null);
            setSelectedStation(null);
          }}
          questionsBadgeCount={questions.filter((q) => q.answersCount === 0).length}
        />
      )}
    </div>
  );
}
