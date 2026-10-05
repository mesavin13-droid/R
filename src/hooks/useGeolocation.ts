import { useEffect, useState } from 'react';

export interface GeoLocationState {
  coords: { lat: number; lng: number } | null;
  error: string | null;
  isLoading: boolean;
  permissionGranted: boolean;
}

export function useGeolocation(defaultCoords = { lat: 54.9830, lng: 82.8940 }) {
  const [state, setState] = useState<GeoLocationState>({
    coords: defaultCoords, // start around pl. Marksa / Novosibirsk center
    error: null,
    isLoading: true,
    permissionGranted: false,
  });

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: 'Геолокация не поддерживается вашим браузером',
      }));
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setState({
          coords: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
          error: null,
          isLoading: false,
          permissionGranted: true,
        });
      },
      (err) => {
        console.warn('Geolocation warning:', err.message);
        // Fallback to central Novosibirsk
        setState({
          coords: defaultCoords,
          error: 'Геолокация недоступна. Используется центр города.',
          isLoading: false,
          permissionGranted: false,
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 30000,
      }
    );
  };

  useEffect(() => {
    requestLocation();
  }, []);

  return {
    ...state,
    refreshLocation: requestLocation,
  };
}
