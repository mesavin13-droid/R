export interface GeocodingResult {
  displayName: string;
  address: string;
  latitude: number;
  longitude: number;
}

// Instant landmark suggestions for Novosibirsk
const NSK_LANDMARKS: GeocodingResult[] = [
  { displayName: 'Красный проспект, 25', address: 'Красный проспект, 25, Центральный район', latitude: 55.0302, longitude: 82.9205 },
  { displayName: 'Красный проспект, 182 (пл. Калинина)', address: 'Красный проспект, 182, Заельцовский район', latitude: 55.0595, longitude: 82.9125 },
  { displayName: 'пл. Карла Маркса', address: 'площадь Карла Маркса, Ленинский район', latitude: 54.9830, longitude: 82.8940 },
  { displayName: 'ул. Троллейная (ж/д переезд)', address: 'ул. Троллейная, Ленинский район', latitude: 54.9658, longitude: 82.8712 },
  { displayName: 'ул. Большевистская (Речной вокзал)', address: 'ул. Большевистская, 12, Октябрьский район', latitude: 55.0080, longitude: 82.9400 },
  { displayName: 'Димитровский мост', address: 'Димитровский мост, Новосибирск', latitude: 55.0305, longitude: 82.8940 },
  { displayName: 'Бугринский мост', address: 'Бугринский мост, Новосибирск', latitude: 54.9750, longitude: 82.9550 },
  { displayName: 'Коммунальный (Октябрьский) мост', address: 'Октябрьский мост, Новосибирск', latitude: 55.0050, longitude: 82.9200 },
  { displayName: 'ул. Станционная', address: 'ул. Станционная, Ленинский район', latitude: 54.9815, longitude: 82.8680 },
  { displayName: 'ул. Немировича-Данченко', address: 'ул. Немировича-Данченко, Кировский район', latitude: 54.9750, longitude: 82.9340 },
  { displayName: 'ул. Ватутина (МЕГА)', address: 'ул. Ватутина, 107, Кировский район', latitude: 54.9650, longitude: 82.9280 },
  { displayName: 'Академгородок (Морской проспект)', address: 'Морской проспект, Советский район', latitude: 54.8510, longitude: 83.1120 },
  { displayName: 'ул. Ипподромская', address: 'ул. Ипподромская, Центральный район', latitude: 55.0400, longitude: 82.9400 },
  { displayName: 'ул. Дуси Ковальчук', address: 'ул. Дуси Ковальчук, Заельцовский район', latitude: 55.0610, longitude: 82.9050 },
  { displayName: 'проспект Дзержинского', address: 'проспект Дзержинского, Дзержинский район', latitude: 55.0470, longitude: 83.0030 },
  { displayName: 'ул. Богдана Хмельницкого', address: 'ул. Богдана Хмельницкого, Калининский район', latitude: 55.0870, longitude: 82.9550 },
  { displayName: 'Бердское шоссе', address: 'Бердское шоссе, Первомайский район', latitude: 54.9200, longitude: 83.0800 },
];

export class GeocodingService {
  /**
   * Search for locations using Yandex Maps Geocoder when available, with fallback
   */
  static async search(query: string, city = 'Новосибирск'): Promise<GeocodingResult[]> {
    const q = query.trim();
    if (!q || q.length < 2) return [];

    // 1. Check fast local dictionary
    const localMatches = NSK_LANDMARKS.filter(item => 
      item.displayName.toLowerCase().includes(q.toLowerCase()) || 
      item.address.toLowerCase().includes(q.toLowerCase())
    );

    // 2. Try Yandex Maps Geocoder if loaded
    if (typeof window !== 'undefined' && window.ymaps && window.ymaps.geocode) {
      try {
        const fullQuery = q.toLowerCase().includes(city.toLowerCase()) ? q : `${city}, ${q}`;
        const res = await window.ymaps.geocode(fullQuery, { results: 5 });
        const geoObjects = res.geoObjects.toArray();
        if (geoObjects.length > 0) {
          const yandexResults: GeocodingResult[] = geoObjects.map((obj: any) => {
            const coords = obj.geometry.getCoordinates();
            const name = obj.properties.get('name') || obj.getAddressLine() || q;
            const desc = obj.properties.get('description') || obj.getAddressLine() || '';
            return {
              displayName: name,
              address: desc ? `${name}, ${desc}` : name,
              latitude: coords[0],
              longitude: coords[1],
            };
          });
          return yandexResults;
        }
      } catch (err) {
        console.warn('Yandex Geocode error:', err);
      }
    }

    if (localMatches.length > 0) {
      return localMatches.slice(0, 5);
    }

    // 3. Fallback to OSM Nominatim
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        `${query}, ${city}`
      )}&limit=5&addressdetails=1`;

      const response = await fetch(url, {
        headers: {
          'Accept-Language': 'ru',
        },
      });

      if (!response.ok) return localMatches;

      const data = await response.json();
      const results: GeocodingResult[] = data.map((item: any) => ({
        displayName: item.display_name.split(',')[0],
        address: item.display_name,
        latitude: parseFloat(item.lat),
        longitude: parseFloat(item.lon),
      }));

      return results;
    } catch (e) {
      console.warn('Nominatim fetch error, using local fallback', e);
      return localMatches;
    }
  }

  /**
   * Reverse geocode coordinates to street address
   */
  static async reverse(lat: number, lng: number): Promise<string> {
    // 1. Try Yandex Maps Reverse Geocoder if loaded. The API can hang on a slow
    //    or blocked network, which would freeze the SOS form forever, so we race
    //    it against a short timeout and fall through to the offline strategies.
    if (typeof window !== 'undefined' && window.ymaps && window.ymaps.geocode) {
      try {
        const text = await Promise.race([
          (async () => {
            const res = await window.ymaps.geocode([lat, lng], { results: 1 });
            const first = res.geoObjects.get(0);
            return first ? first.getAddressLine() : null;
          })(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
        ]);
        if (text) return text;
      } catch (e) {
        // fallback
      }
    }

    // 2. Find closest local landmark
    let closestDist = Infinity;
    let closestName = '';

    for (const item of NSK_LANDMARKS) {
      const d = Math.hypot(item.latitude - lat, item.longitude - lng);
      if (d < closestDist) {
        closestDist = d;
        closestName = item.displayName;
      }
    }

    if (closestDist < 0.005) {
      return closestName;
    }

    // 3. Fallback to Nominatim
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=17&addressdetails=1`;
      const response = await fetch(url, {
        headers: { 'Accept-Language': 'ru' },
      });
      if (response.ok) {
        const data = await response.json();
        const road = data.address?.road || data.address?.suburb || 'Новосибирск';
        const house = data.address?.house_number ? `, ${data.address.house_number}` : '';
        return `${road}${house}`;
      }
    } catch (e) {
      // fallback
    }

    return closestName || `Координаты: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}
