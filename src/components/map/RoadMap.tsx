import React, { useEffect, useRef, useState } from 'react';
import { EventType, RoadEvent, FuelStation, DriverQuestion, RoutePlan, SponsoredBanner } from '../../types';
import { 
  Navigation, Plus, HelpCircle, Route as RouteIcon,
  MapPin, Check, X, ShieldCheck, ShieldAlert
} from 'lucide-react';
import { YandexMapsService } from '../../services/yandexMapsService';
import { GeocodingService } from '../../services/geocodingService';
import { EventService } from '../../services/eventService';
import { UserService } from '../../services/userService';
import { get3DAdSvg } from '../ads/adVisuals';
import { colors } from '../../theme/tokens';
import { FloatingMapAdSticker } from '../ads/FloatingMapAdSticker';
import { getRoadLivePinSvg } from './markerVisuals';

interface RoadMapProps {
  events: RoadEvent[];
  stations: FuelStation[];
  questions: DriverQuestion[];
  activeRoute: RoutePlan | null;
  userCoords: { lat: number; lng: number } | null;
  onSelectEvent: (event: RoadEvent) => void;
  onSelectStation: (station: FuelStation) => void;
  onSelectQuestion: (question: DriverQuestion) => void;
  onOpenCreateEvent: () => void;
  onOpenAskQuestion: () => void;
  /** Opens the route planner (moved here from the bottom navigation). */
  onOpenRoute?: () => void;
  onRecenter: () => void;
  targetLocation?: { lat: number; lng: number } | null;
  // Interactive Pin Placement Mode
  isPinPickerMode?: boolean;
  /** Category selected before entering map placement. */
  pinPickerType?: EventType | null;
  onConfirmPinLocation?: (coords: { lat: number; lng: number }, address: string) => void;
  onCancelPinPicker?: () => void;
  // 2GIS Style Ads
  sponsoredBanners?: SponsoredBanner[];
  onCloseAdBanner?: (id: string) => void;
  onSelectSponsoredPlace?: (banner: SponsoredBanner) => void;
  /** Called after the author closes their own SOS from the map mini-card. */
  onSosClosed?: (event: RoadEvent) => void;
}

export const RoadMap: React.FC<RoadMapProps> = ({
  events,
  stations,
  questions,
  activeRoute,
  userCoords,
  onSelectEvent,
  onSelectStation,
  onSelectQuestion,
  onOpenCreateEvent,
  onOpenAskQuestion,
  onOpenRoute,
  onRecenter,
  targetLocation,
  isPinPickerMode = false,
  pinPickerType = null,
  onConfirmPinLocation,
  onCancelPinPicker,
  sponsoredBanners = [],
  onCloseAdBanner,
  onSelectSponsoredPlace,
  onSosClosed,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  // Yandex Maps references
  const yandexMapRef = useRef<any>(null);
  const yandexGeoObjectsRef = useRef<any>(null);
  const yandexUserPlacemarkRef = useRef<any>(null);

  // Performance Hash Tracker to prevent layout thrashing
  const prevDataHashRef = useRef<string>('');

  // Live copy of the picker flag so map event handlers never close over a
  // stale prop, plus a debounce timer for center tracking.
  const isPinPickerModeRef = useRef(isPinPickerMode);
  const pickerSyncTimerRef = useRef<number | null>(null);

  useEffect(() => {
    isPinPickerModeRef.current = isPinPickerMode;
  }, [isPinPickerMode]);

  // Center Coordinates for Interactive Pin Placement
  const [pickerCoords, setPickerCoords] = useState<{ lat: number; lng: number }>({
    lat: userCoords?.lat || 55.0084,
    lng: userCoords?.lng || 82.9357,
  });
  const [pickerAddress, setPickerAddress] = useState<string>('Определение адреса...');
  const [isGeocoding, setIsGeocoding] = useState<boolean>(false);
  // Author-side SOS closing (two-tap confirm, runs inside the map mini-card)
  const [showSosCloseConfirm, setShowSosCloseConfirm] = useState(false);
  const [isClosingSos, setIsClosingSos] = useState(false);
  const [sosCloseError, setSosCloseError] = useState<string | null>(null);

  const handleCloseMySos = async () => {
    if (!myActiveSos || isClosingSos) return;
    setIsClosingSos(true);
    setSosCloseError(null);
    try {
      const updated = await EventService.confirmResolved(myActiveSos.id, currentUser.id);
      setShowSosCloseConfirm(false);
      if (onSosClosed) onSosClosed(updated);
    } catch (err: any) {
      setSosCloseError(err?.message || 'Не удалось закрыть обращение');
    } finally {
      setIsClosingSos(false);
    }
  };

  const currentUser = UserService.getCurrentUser();

  // Check if current user has an active SOS event
  const myActiveSos = events.find(
    (e) => e.type === 'assistance' && e.userId === currentUser.id && (e.status === 'active' || e.status === 'expiring')
  );

  // Reset the two-tap close confirm when the call changes / disappears.
  useEffect(() => {
    setShowSosCloseConfirm(false);
    setSosCloseError(null);
    setIsClosingSos(false);
  }, [myActiveSos?.id, myActiveSos?.status]);

  // Reverse geocode debounced when pickerCoords change
  useEffect(() => {
    if (!isPinPickerMode) return;

    setIsGeocoding(true);
    const timer = setTimeout(async () => {
      try {
        const addr = await GeocodingService.reverse(pickerCoords.lat, pickerCoords.lng);
        setPickerAddress(addr);
      } catch {
        setPickerAddress(`${pickerCoords.lat.toFixed(5)}, ${pickerCoords.lng.toFixed(5)}`);
      } finally {
        setIsGeocoding(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [pickerCoords, isPinPickerMode]);

  // Distance from user in picker mode
  const distanceFromUserMeters = userCoords
    ? EventService.calculateDistanceMeters(pickerCoords.lat, pickerCoords.lng, userCoords.lat, userCoords.lng)
    : 0;

  const isWithin1000m = userCoords ? distanceFromUserMeters <= 1000 : true;

  // DOM Click Delegation for 2GIS-style Ad Pins
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    const handleAdClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      // 1. Click on Close Button '×'
      const closeBtn = target.closest('.twogis-close-ad-btn') as HTMLElement;
      if (closeBtn) {
        e.preventDefault();
        e.stopPropagation();
        const adId = closeBtn.getAttribute('data-adid');
        if (adId && onCloseAdBanner) {
          onCloseAdBanner(adId);
        }
        return;
      }

      // 2. Click on Ad Pin Body
      const pinContainer = target.closest('.twogis-map-ad-pin') as HTMLElement;
      if (pinContainer) {
        e.preventDefault();
        e.stopPropagation();
        const adId = pinContainer.getAttribute('data-adid');
        if (adId && onSelectSponsoredPlace) {
          const banner = sponsoredBanners.find((b) => b.id === adId);
          if (banner) onSelectSponsoredPlace(banner);
        }
      }
    };

    container.addEventListener('click', handleAdClick, true);
    return () => {
      container.removeEventListener('click', handleAdClick, true);
    };
  }, [sponsoredBanners, onCloseAdBanner, onSelectSponsoredPlace]);

  // Initialize Map Engine
  useEffect(() => {
    if (!mapContainerRef.current) return;

    let isMounted = true;
    const initialLat = userCoords?.lat || 55.0084;
    const initialLng = userCoords?.lng || 82.9357;

    // Load Yandex Maps as the single map engine
    YandexMapsService.loadYandexMaps()
      .then((ymaps) => {
        if (!isMounted || !mapContainerRef.current) return;

        if (yandexMapRef.current) {
          yandexMapRef.current.destroy();
          yandexMapRef.current = null;
        }

        const map = new ymaps.Map(
          mapContainerRef.current,
          {
            center: [initialLat, initialLng],
            zoom: 14,
            controls: [],
          },
          {
            suppressMapOpenBlock: true,
            yandexMapDisablePoiInteractivity: true,
            autoFitToViewport: 'always',
          }
        );

        const geoObjectsGroup = new ymaps.GeoObjectCollection();
        map.geoObjects.add(geoObjectsGroup);

        // Center tracking for pin placement. Outside picker mode the map must
        // stay untouched: firing a React state update on every drag frame
        // re-renders the whole map component and starves tile rendering.
        map.events.add('boundschange', () => {
          if (!isPinPickerModeRef.current) return;
          if (pickerSyncTimerRef.current !== null) {
            window.clearTimeout(pickerSyncTimerRef.current);
          }
          pickerSyncTimerRef.current = window.setTimeout(() => {
            pickerSyncTimerRef.current = null;
            const center = map.getCenter();
            setPickerCoords({ lat: center[0], lng: center[1] });
          }, 250);
        });

        // Click on map to move center — pin placement only.
        map.events.add('click', (e: any) => {
          if (!isPinPickerModeRef.current) return;
          const coords = e.get('coords');
          map.panTo(coords, { flying: true, duration: 400 });
          setPickerCoords({ lat: coords[0], lng: coords[1] });
        });

        yandexGeoObjectsRef.current = geoObjectsGroup;
        yandexMapRef.current = map;
      })
      .catch((err) => {
        console.error('Yandex Maps failed to load:', err);
      });

    return () => {
      isMounted = false;
      if (pickerSyncTimerRef.current !== null) {
        window.clearTimeout(pickerSyncTimerRef.current);
        pickerSyncTimerRef.current = null;
      }
      if (yandexMapRef.current) {
        yandexMapRef.current.destroy();
        yandexMapRef.current = null;
      }
    };
  }, []);

  // Pick up the current map center the moment pin mode is enabled.
  useEffect(() => {
    if (!isPinPickerMode || !yandexMapRef.current) return;
    const center = yandexMapRef.current.getCenter();
    setPickerCoords({ lat: center[0], lng: center[1] });
  }, [isPinPickerMode]);

  // Handle Target Location
  useEffect(() => {
    if (!targetLocation) return;

    if (yandexMapRef.current) {
      yandexMapRef.current.panTo([targetLocation.lat, targetLocation.lng], {
        flying: true,
        duration: 700,
      }).then(() => {
        yandexMapRef.current?.setZoom(15, { duration: 300 });
      });
    }
  }, [targetLocation]);

  // Update User Location Marker
  useEffect(() => {
    if (!userCoords) return;

    const userHtml = `
      <div class="relative flex items-center justify-center">
        <div class="absolute w-8 h-8 rounded-full bg-accent/25 animate-ping"></div>
        <div class="relative w-4 h-4 rounded-full bg-accent border-2 border-surface-800 shadow-[0_0_12px_rgba(75,141,255,0.7)] flex items-center justify-center">
          <div class="w-1.5 h-1.5 rounded-full bg-white"></div>
        </div>
      </div>
    `;

    // 1. Yandex Maps User Location
    if (yandexMapRef.current && window.ymaps) {
      const ymaps = window.ymaps;
      if (yandexUserPlacemarkRef.current) {
        yandexUserPlacemarkRef.current.geometry.setCoordinates([userCoords.lat, userCoords.lng]);
      } else {
        const userLayout = ymaps.templateLayoutFactory.createClass(
          `<div class="yandex-custom-marker-wrapper">${userHtml}</div>`
        );
        const placemark = new ymaps.Placemark(
          [userCoords.lat, userCoords.lng],
          {},
          {
            iconLayout: userLayout,
            iconShape: {
              type: 'Circle',
              coordinates: [0, 0],
              radius: 12,
            },
            zIndex: 1000,
          }
        );
        yandexMapRef.current.geoObjects.add(placemark);
        yandexUserPlacemarkRef.current = placemark;
      }
    }
  }, [userCoords]);

  // Sync Markers on Map Engine
  useEffect(() => {
    const currentDataHash = JSON.stringify([
      events.map((e) => `${e.id}-${e.status}-${e.confirmationCount}-${e.comments?.length || 0}`),
      stations.map((s) => `${s.id}-${s.queueStatus}`),
      questions.map((q) => `${q.id}-${q.answersCount}`),
    ]);

    if (prevDataHashRef.current === currentDataHash) {
      return;
    }
    prevDataHashRef.current = currentDataHash;

    // 1. Yandex Maps Renderer
    if (yandexMapRef.current && yandexGeoObjectsRef.current && window.ymaps) {
      const ymaps = window.ymaps;
      const group = yandexGeoObjectsRef.current;
      group.removeAll();

      // Use inline styles inside Yandex's templateLayoutFactory. Tailwind utilities
      // are not reliably generated/applied for this separately-created DOM.
      // Cluster badges now use the same gunmetal housing and steel rim as event markers.
      const clusterIconLayout = ymaps.templateLayoutFactory.createClass(
        `<div style="position:relative;width:48px;height:48px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 5px 8px rgba(0,0,0,.58));">
          <div style="position:absolute;inset:1px;border-radius:50%;background:linear-gradient(145deg,#546985 0%,#1b2739 28%,#080d17 72%,#3d5069 100%);border:1px solid #8192ac;box-shadow:inset 0 1px 2px rgba(255,255,255,.3),0 2px 6px rgba(0,0,0,.4);"></div>
          <div style="position:relative;width:37px;height:37px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 32% 22%,#243550 0%,#111a2a 58%,#080d17 100%);border:2px solid #4fa8ff;color:#f4f8ff;font:700 13px/1 Inter,-apple-system,BlinkMacSystemFont,sans-serif;letter-spacing:-.02em;box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 0 8px rgba(79,168,255,.24);">
            $[properties.geoObjects.length]
          </div>
          <div style="position:absolute;left:10px;top:7px;width:16px;height:2px;border-radius:2px;background:rgba(255,255,255,.28);transform:rotate(-38deg);"></div>
        </div>`
      );

      const clusterer = new ymaps.Clusterer({
        clusterIconLayout,
        clusterIconImageSize: [48, 48],
        clusterIconImageOffset: [-24, -24],
        gridSize: 64,
        margin: 10,
        clusterDisableClickZoom: false,
        clusterHideIconOnHover: false,
      });

      const clusterPlacemarks: any[] = [];

      // Render Events
      events.forEach((ev) => {
        let badgeColor: string = colors.accent;
        let badgeIcon = '🚗';

        if (ev.type === 'crossing') {
          badgeColor = ev.subType === 'closed' ? colors.danger : colors.success;
          badgeIcon = '🚧';
        } else if (ev.type === 'accident') {
          badgeColor = ev.subType === 'road_blocked' ? colors.danger : colors.warningStrong;
          badgeIcon = '🚗';
        } else if (ev.type === 'patrol') {
          badgeColor = colors.info2;
          badgeIcon = '👮';
        } else if (ev.type === 'fuel') {
          badgeColor = colors.purple;
          badgeIcon = '⛽';
        } else if (ev.type === 'road') {
          badgeColor = colors.warningStrong;
          badgeIcon = '🛣️';
        } else if (ev.type === 'traffic_light') {
          badgeColor = colors.amber;
          badgeIcon = '🚦';
        } else if (ev.type === 'hazard') {
          badgeColor = colors.danger;
          badgeIcon = '⚠️';
        } else if (ev.type === 'assistance') {
          badgeColor = colors.danger;
          badgeIcon = '🆘';
        }

        const isHighActivity =
          ev.confirmationCount >= 3 ||
          Boolean(ev.comments && ev.comments.length > 0) ||
          ev.type === 'assistance';

        // Critical events get the solid-colour pin (style A) so danger reads at a
        // glance; everything else keeps the calm graphite pin (style B).
        const isCritical =
          ev.type === 'assistance' ||
          ev.type === 'hazard' ||
          (ev.type === 'accident' && ev.subType === 'road_blocked') ||
          (ev.type === 'crossing' && ev.subType === 'closed') ||
          (ev.type === 'road' && ev.subType === 'closure');

        const markerHtml = getRoadLivePinSvg(
          ev.type,
          ev.subType || '',
          badgeColor,
          ev.confirmationCount,
          isHighActivity,
          isCritical
        );

        const layout = ymaps.templateLayoutFactory.createClass(
          `<div class="yandex-custom-marker-wrapper">${markerHtml}</div>`
        );

        const placemark = new ymaps.Placemark(
          [ev.latitude, ev.longitude],
          { hintContent: ev.title },
          {
            iconLayout: layout,
            iconShape: { type: 'Circle', coordinates: [0, 0], radius: 21 },
            zIndex: ev.status === 'active' ? 500 : 300,
          }
        );

        placemark.events.add('click', () => {
          onSelectEvent(ev);
        });

        clusterPlacemarks.push(placemark);
      });

      // Render Stations
      stations.forEach((st) => {
        const queueColor =
          st.queueStatus === 'none'
            ? colors.success
            : st.queueStatus === 'small'
            ? colors.warningStrong
            : colors.danger;

        const stationHtml = getRoadLivePinSvg('station', 'station', queueColor, 0, false);

        const layout = ymaps.templateLayoutFactory.createClass(
          `<div class="yandex-custom-marker-wrapper">${stationHtml}</div>`
        );

        const placemark = new ymaps.Placemark(
          [st.latitude, st.longitude],
          { hintContent: st.name },
          {
            iconLayout: layout,
            iconShape: { type: 'Circle', coordinates: [0, 0], radius: 21 },
            zIndex: 400,
          }
        );

        placemark.events.add('click', () => {
          onSelectStation(st);
        });

        group.add(placemark);
      });

      // Render Questions
      questions.forEach((q) => {
        const questionHtml = getRoadLivePinSvg('question', 'question', colors.purple, 0, false);

        const layout = ymaps.templateLayoutFactory.createClass(
          `<div class="yandex-custom-marker-wrapper">${questionHtml}</div>`
        );

        const placemark = new ymaps.Placemark(
          [q.latitude, q.longitude],
          { hintContent: q.question },
          {
            iconLayout: layout,
            iconShape: { type: 'Circle', coordinates: [0, 0], radius: 16 },
            zIndex: 450,
          }
        );

        placemark.events.add('click', () => {
          onSelectQuestion(q);
        });

        clusterPlacemarks.push(placemark);
      });

      // Add clustered items to group
      clusterer.add(clusterPlacemarks);
      group.add(clusterer);

      // Render EXACT 2GIS-STYLE SPONSORED LOGO PINS on Yandex Maps
      sponsoredBanners.forEach((ad) => {
        const adColor = ad.bannerColor || colors.accent;
        const adSvg = get3DAdSvg(ad.id, ad.icon, adColor, ad.customLogoUrl);

        const adMarkerHtml = `
          <div class="twogis-map-ad-pin relative flex flex-col items-center select-none cursor-pointer group" data-adid="${ad.id}">
            <button class="twogis-close-ad-btn absolute -top-1 -right-1 z-30 w-4.5 h-4.5 rounded-full bg-black/40 hover:bg-black/80 text-white/50 hover:text-white border border-white/20 backdrop-blur-xs flex items-center justify-center text-[9px] font-medium shadow-xs cursor-pointer transition active:scale-90" data-adid="${ad.id}" title="Скрыть рекламу">
              ✕
            </button>
            <div class="relative w-12 h-12 flex items-center justify-center group-hover:scale-105 transition-transform">
              ${adSvg}
            </div>
            <div class="text-[8px] font-medium uppercase tracking-wide text-white/50 bg-black/40 backdrop-blur-xs px-1.5 py-0.2 rounded mt-0.5 border border-white/10 pointer-events-none">
              Реклама
            </div>
          </div>
        `;

        const layout = ymaps.templateLayoutFactory.createClass(
          `<div class="yandex-custom-marker-wrapper">${adMarkerHtml}</div>`
        );

        const placemark = new ymaps.Placemark(
          [ad.latitude, ad.longitude],
          { hintContent: `⭐ ${ad.title}` },
          {
            iconLayout: layout,
            iconShape: { type: 'Circle', coordinates: [0, 0], radius: 24 },
            zIndex: 650,
          }
        );

        group.add(placemark);
      });
    }
  }, [events, stations, questions, sponsoredBanners]);

  // Handle Zoom In / Out
  const handleZoomIn = () => {
    if (yandexMapRef.current) {
      const cur = yandexMapRef.current.getZoom();
      yandexMapRef.current.setZoom(cur + 1, { duration: 200 });
    }
  };

  const handleZoomOut = () => {
    if (yandexMapRef.current) {
      const cur = yandexMapRef.current.getZoom();
      yandexMapRef.current.setZoom(cur - 1, { duration: 200 });
    }
  };

  const handleRecenterMap = () => {
    onRecenter();
    if (userCoords) {
      if (yandexMapRef.current) {
        yandexMapRef.current.panTo([userCoords.lat, userCoords.lng], {
          flying: true,
          duration: 600,
        });
      }
    }
  };

  const handleSnapToUserInPicker = () => {
    if (userCoords) {
      if (yandexMapRef.current) {
        yandexMapRef.current.panTo([userCoords.lat, userCoords.lng], {
          flying: true,
          duration: 500,
        });
      }
      setPickerCoords(userCoords);
    }
  };

  return (
    <div 
      className="relative w-full h-full overflow-hidden bg-graphite"
      role="region"
      aria-label="Интерактивная карта дорожных событий ROADLIVE"
    >
      {/* Map DOM Canvas */}
      <div
        ref={mapContainerRef}
        className="w-full h-full z-0 yandex-map-container graphite-dark-map-tiles"
        tabIndex={0}
        aria-label="Область интерактивной карты"
      />

      {/* --- 2GIS FLOATING 3D AD STICKER (Follows viewport wherever user navigates) --- */}
      {!isPinPickerMode && sponsoredBanners.length > 0 && (
        <FloatingMapAdSticker
          banners={sponsoredBanners}
          onCloseBanner={(id) => onCloseAdBanner && onCloseAdBanner(id)}
          onSelectBanner={(b) => onSelectSponsoredPlace && onSelectSponsoredPlace(b)}
        />
      )}

      {/* --- PIN PLACEMENT MODE OVERLAYS --- */}
      {isPinPickerMode && (
        <>
          {/* The chosen marker stays at the map centre; move the map underneath it. */}
          <div className="absolute inset-0 pointer-events-none z-30">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              {pinPickerType ? (
                <div
                  className="rl-placement-marker"
                  aria-label="Метка выбранной категории"
                  dangerouslySetInnerHTML={{
                    __html: getRoadLivePinSvg(
                      pinPickerType,
                      '',
                      ({
                        crossing: colors.warningStrong,
                        accident: colors.danger,
                        patrol: colors.info2,
                        fuel: colors.success,
                        road: colors.roadBlue,
                        traffic_light: colors.amber,
                        hazard: colors.danger,
                        assistance: colors.danger,
                        other: colors.muted,
                      } as Record<EventType, string>)[pinPickerType],
                      0,
                      false,
                      pinPickerType === 'assistance' || pinPickerType === 'hazard' || pinPickerType === 'accident'
                    ),
                  }}
                />
              ) : (
                <svg width="48" height="58" viewBox="0 0 48 58" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-[0_12px_24px_rgba(0,0,0,0.8)]">
                  <path d="M24 0C10.75 0 0 10.75 0 24C0 42 24 58 24 58C24 58 48 42 48 24C48 10.75 37.25 0 24 0Z" fill={colors.surface800}/>
                  <path d="M24 2C12 2 2 12 2 24C2 40.5 24 55.5 24 55.5C24 55.5 46 40.5 46 24C46 12 36 2 24 2Z" fill={colors.surface700} stroke={colors.accent} strokeWidth="2.5"/>
                  <circle cx="24" cy="24" r="10" fill={colors.accent}/>
                  <circle cx="24" cy="24" r="4.5" fill="white"/>
                </svg>
              )}
            </div>
            <div className="absolute left-1/2 top-[calc(50%+27px)] -translate-x-1/2 w-8 h-2 rounded-full bg-black/50 blur-[2px]" />
            <div className="absolute left-1/2 top-[calc(50%-57px)] -translate-x-1/2">
              <div className="px-3.5 py-1.5 rounded-full bg-surface-800/95 backdrop-blur-xl border border-accent/60 shadow-[0_8px_28px_rgba(0,0,0,0.75)] text-white text-xs font-semibold flex items-center gap-2 whitespace-nowrap">
                <span className="w-2 h-2 rounded-full bg-accent animate-ping" />
                <span className="truncate max-w-[220px]">{isGeocoding ? 'Поиск адреса...' : pickerAddress}</span>
              </div>
            </div>
          </div>

          {/* 2. Top Pin Placement Info HUD */}
          <div className="absolute top-3 left-3 right-3 sm:left-1/2 sm:-translate-x-1/2 sm:max-w-md z-40 pointer-events-auto">
            <div className="graphite-sheet-depth rounded-2xl p-3 sm:p-3.5 border border-white/10 shadow-[0_16px_40px_rgba(0,0,0,0.7)] space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-accent/20 text-accent flex items-center justify-center shrink-0 mt-0.5 border border-accent/30">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div className="truncate">
                    <p className="text-xs font-semibold text-white truncate leading-snug">
                      {pickerAddress}
                    </p>
                    <p className="text-[11px] text-muted truncate mt-0.5">
                      {pinPickerType ? 'Двигайте карту под меткой выбранной категории' : 'Перемещайте карту для точного выбора точки'}
                    </p>
                  </div>
                </div>

                {userCoords && (
                  <button
                    onClick={handleSnapToUserInPicker}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-accent shrink-0 active:scale-95 transition flex items-center gap-1 text-xs font-medium"
                    title="Вернуть к моему положению"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Ко мне</span>
                  </button>
                )}
              </div>

              {/* 1000m Verification Status Banner */}
              <div className="flex items-center justify-between text-xs pt-1 border-t border-white/5">
                {isWithin1000m ? (
                  <span className="inline-flex items-center gap-1.5 text-success font-medium text-[11px]">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>В радиусе {distanceFromUserMeters < 1000 ? `${distanceFromUserMeters} м` : '1 км'} (достоверно)</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-warning font-medium text-[11px]">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>Вне зоны 1000 м ({(distanceFromUserMeters / 1000).toFixed(1)} км — дистанционное)</span>
                  </span>
                )}

                <span className="text-[10px] text-muted font-mono">
                  {pickerCoords.lat.toFixed(4)}, {pickerCoords.lng.toFixed(4)}
                </span>
              </div>
            </div>
          </div>

          {/* 3. Bottom Action Deck: Cancel / Confirm Location */}
          <div className="absolute left-3 right-3 bottom-8 sm:left-1/2 sm:-translate-x-1/2 sm:max-w-md z-40 pointer-events-auto flex items-center gap-2.5">
            <button
              onClick={onCancelPinPicker}
              className="flex-1 py-3.5 px-4 rounded-2xl bg-surface-800/95 backdrop-blur-xl border border-white/10 text-white font-medium text-xs sm:text-sm hover:bg-white/10 active:scale-95 transition shadow-lg text-center flex items-center justify-center gap-1.5"
            >
              <X className="w-4 h-4 text-muted" />
              <span>Отмена</span>
            </button>

            <button
              onClick={() => onConfirmPinLocation && onConfirmPinLocation(pickerCoords, pickerAddress)}
              className="flex-[2] py-3.5 px-4 rounded-2xl bg-accent hover:bg-accent-strong text-white font-semibold text-xs sm:text-sm shadow-[0_8px_30px_rgba(75,141,255,0.4)] active:scale-95 transition text-center flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>Выбрать эту точку</span>
            </button>
          </div>
        </>
      )}

      {/* --- ACTIVE SOS STATUS CARD --- */}
      {!isPinPickerMode && myActiveSos && (
        <div className="absolute right-3 sm:right-5 bottom-40 sm:bottom-44 z-20 w-[200px] sm:w-[216px] bg-graphite-900/95 backdrop-blur-xl border border-red-500/45 p-3 rounded-2xl shadow-[0_12px_36px_rgba(255,59,48,0.35)] animate-in slide-in-from-right-3 duration-300 pointer-events-auto">
          <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-white/10">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
            </span>
            <span className="text-[9px] font-extrabold text-danger uppercase tracking-wider">
              SOS активен
            </span>
          </div>

          <p className="text-[11px] font-bold text-white leading-tight">{myActiveSos.title}</p>
          {myActiveSos.address && (
            <p className="text-[9px] text-muted mt-1 leading-tight">📍 {myActiveSos.address}</p>
          )}
          <p className="text-[9px] text-muted mt-1.5 leading-tight">
            Водители рядом оповещены через Telegram.
          </p>

          {myActiveSos.helperUserId && (
            <div className="bg-green-500/15 p-1.5 rounded-xl border border-green-500/20 text-center mt-2 animate-in zoom-in-95">
              <p className="text-[8px] text-green-400 uppercase tracking-wider font-extrabold leading-none mb-0.5">🤝 Помощь едет!</p>
              <p className="text-[10px] font-bold text-white mt-0.5">{myActiveSos.helperName}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-1.5 mt-2">
            <button
              onClick={() => {
                if (onSelectEvent) onSelectEvent(myActiveSos);
              }}
              className="py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-ink text-[9px] font-extrabold border border-white/15 transition active:scale-95 text-center cursor-pointer uppercase tracking-wider"
            >
              Открыть вызов
            </button>
            {!showSosCloseConfirm ? (
              <button
                onClick={() => setShowSosCloseConfirm(true)}
                className="py-1.5 rounded-xl bg-danger hover:bg-danger-strong text-white text-[9px] font-extrabold border border-danger/60 transition active:scale-95 text-center cursor-pointer uppercase tracking-wider shadow-[0_4px_14px_rgba(255,59,48,0.4)]"
                title="Закрыть моё SOS-обращение"
                aria-label="Закрыть моё SOS-обращение"
              >
                Закрыть SOS
              </button>
            ) : (
              <button
                onClick={handleCloseMySos}
                disabled={isClosingSos}
                className="py-1.5 rounded-xl bg-danger hover:bg-danger-strong text-white text-[9px] font-extrabold border border-danger/60 transition active:scale-95 text-center cursor-pointer uppercase tracking-wider disabled:opacity-60"
                title="Подтвердить закрытие SOS-обращения"
                aria-label="Подтвердить закрытие SOS-обращения"
              >
                {isClosingSos ? 'Закрытие…' : 'Да, закрыть'}
              </button>
            )}
          </div>

          {showSosCloseConfirm && (
            <button
              onClick={() => setShowSosCloseConfirm(false)}
              disabled={isClosingSos}
              className="w-full mt-1.5 py-1 rounded-xl text-[9px] font-bold text-muted hover:text-ink transition cursor-pointer uppercase tracking-wider disabled:opacity-50"
            >
              Отмена
            </button>
          )}

          {sosCloseError && (
            <p className="mt-1.5 text-[10px] leading-tight text-danger-soft text-center" role="alert">
              {sosCloseError}
            </p>
          )}
        </div>
      )}

      {/* Floating Map Controls on Right (Centered Vertically) */}
      {!isPinPickerMode && (
        <div 
          className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-2.5 pointer-events-auto"
          role="group"
          aria-label="Элементы управления масштабом и навигацией карты"
        >
          <div className="flex flex-col rounded-2xl bg-graphite-900/95 backdrop-blur-xl border border-white/15 overflow-hidden divide-y divide-white/10 shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
            <button
              type="button"
              onClick={handleZoomIn}
              className="flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 text-ink hover:bg-white/10 active:scale-95 transition text-lg sm:text-xl font-light leading-none cursor-pointer"
              title="Приблизить карту"
              aria-label="Увеличить масштаб карты"
            >
              ＋
            </button>
            <button
              type="button"
              onClick={handleZoomOut}
              className="flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 text-ink hover:bg-white/10 active:scale-95 transition text-lg sm:text-xl font-light leading-none cursor-pointer"
              title="Отдалить карту"
              aria-label="Уменьшить масштаб карты"
            >
              −
            </button>
          </div>

          {/* Location Button with Accent Ring */}
          <button
            type="button"
            onClick={handleRecenterMap}
            className="rl-icon-btn rl-icon-btn-accent"
            title="Моё местоположение"
            aria-label="Переместить карту к моему текущему местоположению"
          >
            <Navigation className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
          </button>
        </div>
      )}

      {/* Floating Action Buttons at Bottom (Normal Mode - Unified Graphite Glass Capsules) */}
      {!isPinPickerMode && (
        <div 
          className="rl-map-action-deck absolute left-0 right-0 z-20 pointer-events-none px-3 flex justify-center items-center gap-2 sm:gap-3 max-w-lg mx-auto"
          role="toolbar"
          aria-label="Быстрые действия на дороге"
        >
          {/* Route Planner Capsule («Маршрут» — moved here from the bottom nav) */}
          {onOpenRoute && (
            <button
              type="button"
              onClick={onOpenRoute}
              className="rl-btn rl-btn-soft pointer-events-auto flex-1 px-3.5 py-3 sm:px-5 sm:py-3.5 text-xs sm:text-sm"
              aria-label="Построить маршрут и посмотреть события на пути"
            >
              <RouteIcon className="w-4 h-4 shrink-0 stroke-[2.2]" />
              <span>Маршрут</span>
            </button>
          )}

          {/* Ask Question Capsule */}
          <button
            type="button"
            onClick={onOpenAskQuestion}
            className="rl-btn rl-btn-soft pointer-events-auto flex-1 px-3.5 py-3 sm:px-5 sm:py-3.5 text-xs sm:text-sm"
            aria-label="Задать вопрос другим водителям в этой локации"
          >
            <HelpCircle className="w-4 h-4 text-info shrink-0 stroke-[2.2]" />
            <span>Спросить</span>
          </button>

          {/* Primary Report Action Button */}
          <button
            type="button"
            onClick={onOpenCreateEvent}
            className="rl-btn rl-btn-primary pointer-events-auto flex-[1.3] px-3.5 py-3 sm:px-5 sm:py-3.5 text-xs sm:text-sm"
            aria-label="Сообщить о событии, ДТП, переезде или контроле на дороге"
          >
            <Plus className="w-4 h-4 text-info shrink-0 stroke-[2.5]" />
            <span>Сообщить</span>
          </button>
        </div>
      )}
    </div>
  );
};
