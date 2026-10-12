import React, { useEffect, useRef, useState } from 'react';
import { EventType, RoadEvent, FuelStation, DriverQuestion, RoutePlan, SponsoredBanner } from '../../types';
import { 
  Navigation, Plus, HelpCircle, Route as RouteIcon,
  MapPin, Check, X, ShieldCheck, ShieldAlert, Moon, Sun
} from 'lucide-react';
import { YandexMapsService } from '../../services/yandexMapsService';
import { GeocodingService } from '../../services/geocodingService';
import { EventService } from '../../services/eventService';
import { UserService } from '../../services/userService';
import { get3DAdSvg } from '../ads/adVisuals';
import { colors } from '../../theme/tokens';
import { FloatingMapAdSticker } from '../ads/FloatingMapAdSticker';
import { getRoadLivePinSvg } from './markerVisuals';
import { getUnconfirmedEventTtlMinutes, ANSWERED_QUESTION_MAP_TTL_MINUTES, UNANSWERED_QUESTION_TTL_MINUTES, FUEL_QUEUE_TTL_MINUTES } from '../../utils/eventTtl';

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

  // A persisted map theme: start with Yandex's natural, readable light tiles,
  // then let drivers switch to a dark rendering without changing map data.
  const [mapTheme, setMapTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    try {
      return window.localStorage.getItem('roadlive-map-theme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem('roadlive-map-theme', mapTheme);
    } catch {
      // Private browsing may block local storage; the in-memory toggle still works.
    }
  }, [mapTheme]);

  // Yandex Maps references
  const yandexMapRef = useRef<any>(null);
  const yandexGeoObjectsRef = useRef<any>(null);
  const yandexUserPlacemarkRef = useRef<any>(null);
  const [mapNow, setMapNow] = useState<number>(Date.now());
  // Do not stamp marker data as rendered until the async Yandex map is ready.
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setMapNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  // Always call the most recent callbacks from Yandex's long-lived marker DOM.
  // Without refs, markers can retain stale React closures after UI changes.
  const latestMapCallbacksRef = useRef({
    onSelectEvent,
    onSelectStation,
    onSelectQuestion,
    onCloseAdBanner,
    onSelectSponsoredPlace,
  });
  latestMapCallbacksRef.current = {
    onSelectEvent,
    onSelectStation,
    onSelectQuestion,
    onCloseAdBanner,
    onSelectSponsoredPlace,
  };

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

  // Map-only lifecycle filtering: old events disappear at expiresAt even if
  // the user leaves the map open and no new API poll happens.
  const visibleEvents = events.filter((ev) => {
    if (ev.status === 'hidden' || ev.status === 'expired' || ev.status === 'resolved') {
      return false;
    }
    const expiresAt = Date.parse(ev.expiresAt || '');
    if (Number.isFinite(expiresAt)) return expiresAt > mapNow;

    // Older local records may not have expiresAt. Do not keep them indefinitely.
    const createdAt = Date.parse(ev.createdAt || '');
    return Number.isFinite(createdAt) &&
      mapNow < createdAt + getUnconfirmedEventTtlMinutes(ev.type, ev.subType) * 60_000;
  });

  const visibleQuestions = questions.filter((q) => {
    if (q.status !== 'open') return false;
    const createdAt = Date.parse(q.createdAt || '');
    if (!Number.isFinite(createdAt)) return false;
    const ttlMinutes = q.answersCount > 0
      ? ANSWERED_QUESTION_MAP_TTL_MINUTES
      : UNANSWERED_QUESTION_TTL_MINUTES;
    return mapNow < createdAt + ttlMinutes * 60_000;
  });

  // DOM Click Delegation for the close control on sponsored pins.
  // The sponsored pin's own Yandex click event opens its detail card.
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    const handleAdClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // This element belongs to the sponsored marker; prevent its own click
      // from opening the detail card before the close action is handled.
      const closeBtn = target.closest('.twogis-close-ad-btn') as HTMLElement;
      if (!closeBtn) return;

      e.preventDefault();
      e.stopPropagation();
      const adId = closeBtn.getAttribute('data-adid');
      if (adId) latestMapCallbacksRef.current.onCloseAdBanner?.(adId);
    };

    container.addEventListener('click', handleAdClick, true);
    return () => {
      container.removeEventListener('click', handleAdClick, true);
    };
  }, [sponsoredBanners]);

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
        setMapReady(false);

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
        // This triggers a render pass for data that arrived before Yandex Maps.
        setMapReady(true);
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
        placemark.events.add('click', () => {
          const currentCoords = yandexUserPlacemarkRef.current?.geometry?.getCoordinates?.();
          if (currentCoords && yandexMapRef.current) {
            yandexMapRef.current.panTo(currentCoords, {
              flying: true,
              duration: 450,
            });
          }
        });
        yandexMapRef.current.geoObjects.add(placemark);
        yandexUserPlacemarkRef.current = placemark;
      }
    }
  }, [userCoords]);

  // Sync Markers on Map Engine
  useEffect(() => {
    // Include every field that changes a rendered pin, its position, or its
    // hint. Otherwise a status/subtype/coordinate edit can leave stale marker SVG.
    const currentDataHash = JSON.stringify([
      visibleEvents.map((e) => [
        e.id, e.userId, e.type, e.subType, e.latitude, e.longitude, e.status,
        e.confirmationCount, e.disputeCount, e.confidenceScore, e.comments?.length || 0,
        e.title, e.description, e.address, e.direction, e.imageUrl,
        e.createdAt, e.updatedAt, e.lastConfirmedAt, e.expiresAt,
        e.helperUserId, e.helperName, e.offersCount,
      ]),
      stations.map((s) => {
        const lastReportedAt = Date.parse(s.lastReportedAt || '');
        const queueIsFresh = Number.isFinite(lastReportedAt) &&
          mapNow - lastReportedAt <= FUEL_QUEUE_TTL_MINUTES * 60_000;
        return [s.id, s.latitude, s.longitude, s.queueStatus, s.name, s.address, queueIsFresh];
      }),
      visibleQuestions.map((q) => [q.id, q.latitude, q.longitude, q.answersCount, q.question, q.status, q.createdAt]),
      sponsoredBanners.map((ad) => [ad.id, ad.latitude, ad.longitude, ad.title, ad.subtitle, ad.bannerColor, ad.icon, ad.customLogoUrl, ad.isActive]),
    ]);

    // If events loaded before the async map script, keep the old hash untouched.
    // Otherwise the equal-hash optimization would skip the first real render and
    // markers would appear only after some unrelated data changed.
    if (!mapReady || !yandexMapRef.current || !yandexGeoObjectsRef.current || !window.ymaps) {
      return;
    }

    if (prevDataHashRef.current === currentDataHash) {
      return;
    }
    prevDataHashRef.current = currentDataHash;

    // 1. Yandex Maps Renderer
    if (yandexMapRef.current && yandexGeoObjectsRef.current && window.ymaps) {
      const ymaps = window.ymaps;
      const group = yandexGeoObjectsRef.current;
      group.removeAll();

      // Reuse the category banner's teardrop silhouette for grouped markers too.
      const clusterIconLayout = ymaps.templateLayoutFactory.createClass(
        `<div style="position:relative;width:64px;height:72px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 4px 8px rgba(0,0,0,.55));">
          <svg width="64" height="72" viewBox="0 0 64 72" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="rl-cluster-housing" x1="8" y1="2" x2="54" y2="68" gradientUnits="userSpaceOnUse">
                <stop stop-color="#526681"/><stop offset=".22" stop-color="#1A2639"/><stop offset=".72" stop-color="#080D17"/><stop offset="1" stop-color="#344A68"/>
              </linearGradient>
              <linearGradient id="rl-cluster-rim" x1="11" y1="4" x2="51" y2="54" gradientUnits="userSpaceOnUse">
                <stop stop-color="#B8D9FF"/><stop offset=".45" stop-color="#4F8DFF"/><stop offset="1" stop-color="#283A52"/>
              </linearGradient>
            </defs>
            <path d="M32 68S7 43 7 25a25 25 0 1 1 50 0C57 43 32 68 32 68Z" fill="url(#rl-cluster-housing)" stroke="#70829C" stroke-width="1.2"/>
            <circle cx="32" cy="25" r="20" fill="url(#rl-cluster-housing)" stroke="url(#rl-cluster-rim)" stroke-width="2.6"/>
            <circle cx="32" cy="25" r="16.5" fill="#101827" stroke="#415470" stroke-width=".8"/>
            <path d="M19 12.5a18 18 0 0 1 23-1.2" fill="none" stroke="#F5F8FF" stroke-opacity=".52" stroke-width="1.1" stroke-linecap="round"/>
            <text x="32" y="30" text-anchor="middle" fill="#F4F7FF" font-size="13" font-weight="700" font-family="Inter,-apple-system,BlinkMacSystemFont,sans-serif">$[properties.geoObjects.length]</text>
          </svg>
        </div>`
      );

      const clusterer = new ymaps.Clusterer({
        clusterIconLayout,
        clusterIconImageSize: [64, 72],
        // The geographic point is the lower tip of the pin, not its centre.
        clusterIconImageOffset: [-32, -68],
        gridSize: 64,
        margin: 10,
        clusterDisableClickZoom: false,
        clusterHideIconOnHover: false,
      });

      const clusterPlacemarks: any[] = [];

      // Render Events
      visibleEvents.forEach((ev) => {
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
            iconOffset: [-32, -68],
            iconShape: { type: 'Circle', coordinates: [0, -43], radius: 25 },
            zIndex: ev.status === 'active' ? 500 : 300,
          }
        );

        placemark.events.add('click', () => {
          latestMapCallbacksRef.current.onSelectEvent(ev);
        });

        clusterPlacemarks.push(placemark);
      });

      // Render Stations
      stations.forEach((st) => {
        const lastQueueReport = Date.parse(st.lastReportedAt || '');
        const queueIsFresh = Number.isFinite(lastQueueReport) &&
          mapNow - lastQueueReport <= FUEL_QUEUE_TTL_MINUTES * 60_000;
        const queueColor = !queueIsFresh
          ? colors.muted
          : st.queueStatus === 'none'
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
            // The same category-shaped pin as road events: latitude/longitude
            // attaches to the pointed tip, while the active area covers the head.
            iconOffset: [-32, -68],
            iconShape: { type: 'Circle', coordinates: [0, -43], radius: 25 },
            zIndex: 400,
          }
        );

        placemark.events.add('click', () => {
          latestMapCallbacksRef.current.onSelectStation(st);
        });

        group.add(placemark);
      });

      // Render Questions
      visibleQuestions.forEach((q) => {
        const questionHtml = getRoadLivePinSvg('question', 'question', colors.purple, 0, false);

        const layout = ymaps.templateLayoutFactory.createClass(
          `<div class="yandex-custom-marker-wrapper">${questionHtml}</div>`
        );

        const placemark = new ymaps.Placemark(
          [q.latitude, q.longitude],
          { hintContent: q.question },
          {
            iconLayout: layout,
            iconOffset: [-32, -68],
            iconShape: { type: 'Circle', coordinates: [0, -43], radius: 25 },
            zIndex: 450,
          }
        );

        placemark.events.add('click', () => {
          latestMapCallbacksRef.current.onSelectQuestion(q);
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
            iconShape: { type: 'Circle', coordinates: [0, 0], radius: 36 },
            zIndex: 650,
          }
        );

        placemark.events.add('click', () => {
          latestMapCallbacksRef.current.onSelectSponsoredPlace?.(ad);
        });

        group.add(placemark);
      });
    }
  }, [events, stations, questions, sponsoredBanners, mapNow, mapReady]);

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
        className={`w-full h-full z-0 yandex-map-container map-theme-${mapTheme}`}
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
          {/* Marker uses the category-banner asset; its lower tip is fixed to map centre. */}
          <div className="absolute inset-0 pointer-events-none z-30">
            <div className="rl-placement-marker-anchor">
              <div
                className="rl-placement-marker"
                aria-label="Метка выбранной категории"
                dangerouslySetInnerHTML={{
                  __html: getRoadLivePinSvg(
                    pinPickerType || 'question',
                    '',
                    pinPickerType
                      ? ({
                          crossing: colors.warningStrong,
                          accident: colors.danger,
                          patrol: colors.info2,
                          fuel: colors.success,
                          road: colors.roadBlue,
                          traffic_light: colors.amber,
                          hazard: colors.danger,
                          assistance: colors.danger,
                          other: colors.muted,
                        } as Record<EventType, string>)[pinPickerType]
                      : colors.purple,
                    0,
                    false,
                    pinPickerType === 'assistance' || pinPickerType === 'hazard' || pinPickerType === 'accident'
                  ),
                }}
              />
            </div>
            <div className="rl-placement-shadow" />
            <div className="rl-placement-address">
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

      {/* Map appearance, zoom and location controls */}
      <div
        className={`absolute right-3 sm:right-5 ${isPinPickerMode ? 'top-[48%]' : 'top-1/2'} -translate-y-1/2 z-20 flex flex-col gap-2.5 pointer-events-auto`}
        role="group"
        aria-label="Управление картой"
      >
        <button
          type="button"
          onClick={() => setMapTheme((current) => current === 'dark' ? 'light' : 'dark')}
          className="flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-graphite-900/95 backdrop-blur-xl border border-white/15 text-white shadow-[0_8px_24px_rgba(0,0,0,0.42)] hover:bg-graphite-800 active:scale-95 transition"
          title={mapTheme === 'dark' ? 'Включить светлую карту' : 'Включить тёмную карту'}
          aria-label={mapTheme === 'dark' ? 'Включить светлую тему карты' : 'Включить тёмную тему карты'}
          aria-pressed={mapTheme === 'dark'}
        >
          {mapTheme === 'dark'
            ? <Sun className="w-5 h-5 text-amber-300" />
            : <Moon className="w-5 h-5 text-sky-200" />}
        </button>

        {!isPinPickerMode && (
          <>
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

            <button
              type="button"
              onClick={handleRecenterMap}
              className="rl-icon-btn rl-icon-btn-accent"
              title="Моё местоположение"
              aria-label="Переместить карту к моему текущему местоположению"
            >
              <Navigation className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
            </button>
          </>
        )}
      </div>

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
