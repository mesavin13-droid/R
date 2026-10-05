declare global {
  interface Window {
    ymaps?: any;
    __yandexMapsLoadingPromise?: Promise<any>;
  }
}

const YANDEX_MAPS_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_YANDEX_MAPS_API_KEY) ||
  '9441ce96-0e2d-4413-8562-c851c6faacbc';

export class YandexMapsService {
  /**
   * Load Yandex Maps JS API 2.1 script dynamically
   */
  static loadYandexMaps(apiKey = YANDEX_MAPS_KEY): Promise<any> {
    if (typeof window === 'undefined') {
      return Promise.reject(new Error('Window is not defined'));
    }

    if (window.ymaps && window.ymaps.Map) {
      return Promise.resolve(window.ymaps);
    }

    if (window.__yandexMapsLoadingPromise) {
      return window.__yandexMapsLoadingPromise;
    }

    window.__yandexMapsLoadingPromise = new Promise((resolve, reject) => {
      const existingScript = document.getElementById('yandex-maps-script');
      if (existingScript) {
        if (window.ymaps) {
          window.ymaps.ready(() => resolve(window.ymaps));
        } else {
          existingScript.addEventListener('load', () => {
            window.ymaps.ready(() => resolve(window.ymaps));
          });
          existingScript.addEventListener('error', (err) => reject(err));
        }
        return;
      }

      const script = document.createElement('script');
      script.id = 'yandex-maps-script';
      script.type = 'text/javascript';
      script.async = true;
      script.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(
        apiKey
      )}&lang=ru_RU&coordorder=latlong`;

      script.onload = () => {
        if (window.ymaps) {
          window.ymaps.ready(() => resolve(window.ymaps));
        } else {
          reject(new Error('ymaps object is not available after script load'));
        }
      };

      script.onerror = (e) => {
        console.warn('Failed to load Yandex Maps script:', e);
        reject(e);
      };

      document.head.appendChild(script);
    });

    return window.__yandexMapsLoadingPromise;
  }
}
