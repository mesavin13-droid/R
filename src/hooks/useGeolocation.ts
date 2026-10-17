import { useCallback, useEffect, useState } from 'react';

export interface GeoLocationState {
  coords: { lat: number; lng: number } | null;
  error: string | null;
  isLoading: boolean;
  permissionGranted: boolean;
  /** Browser-measured GPS accuracy in metres; not a radius preference. */
  accuracyM: number | null;
  /** Timestamp of the last accepted physical GPS fix. */
  positionAt: number | null;
}

const MAX_GPS_AGE_MS = 120_000;
const MAX_GPS_ACCURACY_M = 1_000;

const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 15000,
};

export function useGeolocation(autoStart = true) {
  const [state, setState] = useState<GeoLocationState>({
    // Never pretend the driver is at a hard-coded city center. Radius alerts
    // must use a real GPS fix or the server will target the wrong people.
    coords: null,
    error: null,
    isLoading: true,
    permissionGranted: false,
    accuracyM: null,
    positionAt: null,
  });

  const onPosition = useCallback((position: GeolocationPosition) => {
    const { latitude, longitude, accuracy } = position.coords;
    const now = Date.now();
    const fixAt = position.timestamp;
    const valid = Number.isFinite(latitude) && Math.abs(latitude) <= 85 &&
      Number.isFinite(longitude) && Math.abs(longitude) <= 180 &&
      Number.isFinite(accuracy) && accuracy > 0 && accuracy <= MAX_GPS_ACCURACY_M &&
      Number.isFinite(fixAt) && fixAt <= now + 60_000 &&
      now - fixAt <= MAX_GPS_AGE_MS;
    if (!valid) {
      setState(prev => ({
        ...prev, coords: null, accuracyM: null, positionAt: null,
        permissionGranted: false, isLoading: false,
        error: 'Точные GPS-координаты недоступны. Оповещения и SOS приостановлены до новой точки.',
      }));
      return;
    }
    setState({
      coords: { lat: latitude, lng: longitude },
      accuracyM: accuracy,
      positionAt: fixAt,
      error: null, isLoading: false, permissionGranted: true,
    });
  }, []);

  const onError = useCallback((err: GeolocationPositionError) => {
    console.warn('Geolocation warning:', err.message);
    setState((prev) => {
      const denied = err.code === err.PERMISSION_DENIED;
      return {
        ...prev,
        coords: null,
        accuracyM: null,
        positionAt: null,
        error: denied
          ? 'Разрешите доступ к геолокации, чтобы получать уведомления рядом'
          : 'GPS временно недоступен. Оповещения по радиусу приостановлены до получения новой точки.',
        isLoading: false,
        permissionGranted: false,
      };
    });
  }, []);

  const refreshLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        coords: null,
        accuracyM: null,
        positionAt: null,
        error: 'Геолокация не поддерживается вашим браузером',
        permissionGranted: false,
      }));
      return;
    }
    setState((prev) => ({ ...prev, coords: null, positionAt: null, accuracyM: null, isLoading: true }));
    navigator.geolocation.getCurrentPosition(onPosition, onError, GEO_OPTIONS);
  }, [onPosition, onError, autoStart]);

  useEffect(() => {
    // Public map visitors can browse without a surprise browser GPS prompt.
    // A guest can still request a one-off fix with the "Моё место" button.
    if (!autoStart) {
      setState(prev => ({ ...prev, isLoading: false }));
      return;
    }
    if (!navigator.geolocation) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        coords: null,
        error: 'Геолокация не поддерживается вашим браузером',
        permissionGranted: false,
      }));
      return;
    }

    // Keep the last position fresh while ROAD LIVE is open, rather than
    // recording a single startup fix that becomes stale after 30 minutes.
    const watchId = navigator.geolocation.watchPosition(onPosition, onError, GEO_OPTIONS);
    return () => navigator.geolocation.clearWatch(watchId);
  }, [onPosition, onError]);

  // A stationary device can stop receiving watchPosition callbacks.
  // Expire the in-memory fix as well, not only the server-side heartbeat.
  useEffect(() => {
    if (state.positionAt === null) return;
    const currentFix = state.positionAt;
    const remainingMs = Math.max(0, MAX_GPS_AGE_MS - (Date.now() - currentFix));
    const timer = window.setTimeout(() => {
      setState(prev => prev.positionAt === currentFix ? {
        ...prev, coords: null, accuracyM: null, positionAt: null,
        permissionGranted: false,
        error: 'GPS-точка устарела. Ожидаем обновления координат.',
      } : prev);
    }, remainingMs + 100);
    return () => window.clearTimeout(timer);
  }, [state.positionAt]);

  return {
    ...state,
    refreshLocation,
  };
}
