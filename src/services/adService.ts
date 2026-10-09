import { SponsoredBanner, CustomAdIcon } from '../types';

const CLOSED_BANNERS_KEY = 'roadlive_closed_ad_banners';

export interface AdDisplayConfig {
  intervalSeconds: number;
  autoDismissSeconds: number;
  enabled: boolean;
}

export const DEFAULT_AD_CONFIG: AdDisplayConfig = {
  intervalSeconds: 900,
  autoDismissSeconds: 30,
  enabled: true,
};

export const PRESET_AD_ICONS = [
  { id: 'icon_tire', icon: '🛞', label: 'Шиномонтаж' },
  { id: 'icon_service', icon: '🔧', label: 'Автосервис / СТО' },
  { id: 'icon_gas', icon: '⛽', label: 'АЗС / Заправка' },
  { id: 'icon_wash', icon: '🚿', label: 'Автомойка / Робот' },
  { id: 'icon_tow', icon: '🚨', label: 'Эвакуатор / Техпомощь' },
  { id: 'icon_office', icon: '🏢', label: 'Бизнес-центр / Небоскрёб' },
  { id: 'icon_hotel', icon: '🏨', label: 'Отель / Апартаменты' },
  { id: 'icon_coffee', icon: '☕', label: 'Автокафе / Кофе' },
  { id: 'icon_food', icon: '🍔', label: 'Драйв-кафе / Еда' },
  { id: 'icon_racing', icon: '🏎️', label: 'Тюнинг / Детейлинг' },
  { id: 'icon_shield', icon: '🛡️', label: 'Страхование / ОСАГО' },
  { id: 'icon_ev', icon: '⚡', label: 'Электрозарядка (EV)' },
  { id: 'icon_car_key', icon: '🔑', label: 'Прокат / Каршеринг' },
  { id: 'icon_shop', icon: '🏪', label: 'Автозапчасти' },
  { id: 'icon_star', icon: '⭐', label: 'Премиум / Эксклюзив' },
];

/**
 * Campaigns and icons are server data now. The caches below only keep the last
 * server response in memory so that synchronous selectors used by the map do not
 * have to become async; nothing is ever persisted to localStorage.
 */
let adsCache: SponsoredBanner[] = [];
let iconsCache: CustomAdIcon[] = [];
let configCache: AdDisplayConfig = { ...DEFAULT_AD_CONFIG };

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { credentials: 'include', ...init });
  } catch {
    throw new Error('Сервер недоступен. Проверьте соединение.');
  }
  const raw = await response.text();
  let payload: any = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    /* the server answered with something that is not JSON */
  }
  if (!response.ok) throw new Error(payload?.error || `Ошибка сервера (${response.status})`);
  return payload as T;
}

function applyPayload(payload: any): void {
  if (Array.isArray(payload?.ads)) adsCache = payload.ads;
  if (Array.isArray(payload?.icons)) iconsCache = payload.icons;
  if (payload?.config) configCache = { ...DEFAULT_AD_CONFIG, ...payload.config };
}

export const AdService = {
  // --- LOADING ---
  /** Public payload: active campaigns that are inside their schedule window. */
  async loadPublic(): Promise<void> {
    applyPayload(await apiRequest<any>('/api/ads'));
  },

  /** Owner payload: every campaign including paused ones, with delivery counters. */
  async loadForOwner(): Promise<void> {
    applyPayload(await apiRequest<any>('/api/admin/ads'));
  },

  // --- CONFIGURATION ---
  getConfig(): AdDisplayConfig {
    return configCache;
  },

  async saveConfig(config: Partial<AdDisplayConfig>): Promise<AdDisplayConfig> {
    const merged = { ...configCache, ...config };
    const payload = await apiRequest<any>('/api/admin/ad-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(merged),
    });
    configCache = { ...configCache, ...(payload?.config || merged) };
    return configCache;
  },

  // --- CUSTOM SVG ICONS MANAGEMENT ---
  getCustomIcons(): CustomAdIcon[] {
    return iconsCache;
  },

  async addCustomIcon(name: string, svgContent: string, category: string = 'Пользовательские'): Promise<CustomAdIcon[]> {
    const payload = await apiRequest<any>('/api/admin/ad-icons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, svgContent, category }),
    });
    if (payload?.icon) iconsCache = [payload.icon, ...iconsCache];
    return iconsCache;
  },

  async deleteCustomIcon(id: string): Promise<CustomAdIcon[]> {
    await apiRequest<any>(`/api/admin/ad-icons/${id}`, { method: 'DELETE' });
    iconsCache = iconsCache.filter((item) => item.id !== id);
    return iconsCache;
  },

  getCustomIconById(id: string): CustomAdIcon | undefined {
    return iconsCache.find((item) => item.id === id);
  },

  /** Client-side preview helper only. The server sanitises the markup again on write. */
  sanitizeSvg(raw: string): string {
    let clean = raw.trim();
    if (!clean.includes('<svg') || !clean.includes('</svg>')) {
      clean = `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">${clean}</svg>`;
    }
    return clean;
  },

  // Helper to resolve icon source for display on map
  resolveAdVisualSource(ad: SponsoredBanner): {
    customLogoUrl?: string;
    svgContent?: string;
    icon: string;
  } {
    if (ad.customLogoUrl) {
      return { customLogoUrl: ad.customLogoUrl, icon: ad.icon };
    }
    if (ad.customIconId) {
      const customIcon = this.getCustomIconById(ad.customIconId);
      if (customIcon) {
        const encoded = `data:image/svg+xml;utf8,${encodeURIComponent(customIcon.svgContent)}`;
        return { customLogoUrl: encoded, svgContent: customIcon.svgContent, icon: ad.icon };
      }
    }
    return { icon: ad.icon };
  },

  // --- ADS CAMPAIGNS MANAGEMENT ---
  getAllAds(): SponsoredBanner[] {
    return adsCache;
  },

  getBanners(): SponsoredBanner[] {
    const closedIds = this.getClosedBannerIds();
    return adsCache
      .filter((b) => b.isActive !== false && !closedIds.includes(b.id))
      .map((ad) => {
        const visual = this.resolveAdVisualSource(ad);
        return {
          ...ad,
          customLogoUrl: visual.customLogoUrl || ad.customLogoUrl,
        };
      });
  },

  async addAd(ad: Partial<SponsoredBanner>): Promise<SponsoredBanner[]> {
    const payload = await apiRequest<any>('/api/admin/ads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ad),
    });
    if (payload?.ad) adsCache = [payload.ad, ...adsCache];
    return adsCache;
  },

  async updateAd(id: string, updates: Partial<SponsoredBanner>): Promise<SponsoredBanner[]> {
    const payload = await apiRequest<any>(`/api/admin/ads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (payload?.ad) adsCache = adsCache.map((ad) => (ad.id === id ? payload.ad : ad));
    return adsCache;
  },

  async deleteAd(id: string): Promise<SponsoredBanner[]> {
    await apiRequest<any>(`/api/admin/ads/${id}`, { method: 'DELETE' });
    adsCache = adsCache.filter((ad) => ad.id !== id);
    return adsCache;
  },

  async toggleAdActive(id: string): Promise<SponsoredBanner[]> {
    const target = adsCache.find((ad) => ad.id === id);
    if (!target) return adsCache;
    return this.updateAd(id, { isActive: !target.isActive });
  },

  // --- DELIVERY STATISTICS ---
  async registerImpression(id: string): Promise<void> {
    await apiRequest<any>(`/api/ads/${id}/stat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'impression' }),
    });
  },

  async registerClick(id: string): Promise<void> {
    await apiRequest<any>(`/api/ads/${id}/stat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'click' }),
    });
  },

  // --- PER-SESSION DISMISSAL ---
  // Dismissal is intentionally device-local: it answers "I already closed this
  // banner in this session", not "this user has seen the campaign".
  getClosedBannerIds(): string[] {
    try {
      const data = sessionStorage.getItem(CLOSED_BANNERS_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  closeBanner(id: string): void {
    const current = this.getClosedBannerIds();
    if (!current.includes(id)) {
      try {
        sessionStorage.setItem(CLOSED_BANNERS_KEY, JSON.stringify([...current, id]));
      } catch {
        /* private browsing can block sessionStorage */
      }
    }
  },

  resetClosedBanners(): void {
    sessionStorage.removeItem(CLOSED_BANNERS_KEY);
  },
};
