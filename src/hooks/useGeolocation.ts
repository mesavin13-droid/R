import { useCallback, useEffect, useState } from 'react';

export interface GeoLocationState {
  coords: { lat: number; lng: number } | null;
  error: string | null;
  isLoading: boolean;
  permissionGranted: boolean;
}

const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 15000,
};

export function useGeolocation() {
  const [state, setState] = useState<GeoLocationState>({
    // Never pretend the driver is at a hard-coded city center. Radius alerts
    // must use a real GPS fix or the server will target the wrong people.
    coords: null,
    error: null,
    isLoading: true,
    permissionGranted: false,
  });

  const onPosition = useCallback((position: GeolocationPosition) => {
    setState({
      coords: {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      },
      error: null,
      isLoading: false,
      permissionGranted: true,
    });
  }, []);

  const onError = useCallback((err: GeolocationPositionError) => {
    console.warn('Geolocation warning:', err.message);
    setState((prev) => {
      const denied = err.code === err.PERMISSION_DENIED;
      return {
        ...prev,
        coords: null,
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
        error: 'Геолокация не поддерживается вашим браузером',
        permissionGranted: false,
      }));
      return;
    }
    setState((prev) => ({ ...prev, coords: null, isLoading: true }));
    navigator.geolocation.getCurrentPosition(onPosition, onError, GEO_OPTIONS);
  }, [onPosition, onError]);

  useEffect(() => {
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

  return {
    ...state,
    refreshLocation,
  };
}
