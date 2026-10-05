import { SponsoredBanner, CustomAdIcon } from '../types';

const STORAGE_KEY = 'roadlive_closed_ad_banners';
const ADS_STORAGE_KEY = 'roadlive_sponsored_ads_list';
const CUSTOM_ICONS_STORAGE_KEY = 'roadlive_custom_svg_icons';
const AD_CONFIG_STORAGE_KEY = 'roadlive_ad_display_config';

export interface AdDisplayConfig {
  intervalSeconds: number;
  autoDismissSeconds: number;
  enabled: boolean;
}

export const DEFAULT_AD_CONFIG: AdDisplayConfig = {
  intervalSeconds: 900, // 15 minutes default
  autoDismissSeconds: 30, // 30 seconds auto-dismiss
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

const INITIAL_CUSTOM_ICONS: CustomAdIcon[] = [
  {
    id: 'svg_2gis_navigator',
    name: '2ГИС Стиль',
    category: 'Навигатор',
    svgContent: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="22" fill="#24C35E"/><path d="M14 28C14 20.268 20.268 14 28 14V22C24.686 22 22 24.686 22 28H14Z" fill="white"/><circle cx="29" cy="29" r="6" fill="white"/></svg>`,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'svg_gazprom_flame',
    name: 'Пламя АЗС / Топливо',
    category: 'АЗС',
    svgContent: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="22" fill="#0078D7"/><path d="M24 10C24 10 16 20 16 27C16 31.418 19.582 35 24 35C28.418 35 32 31.418 32 27C32 20 24 10 24 10Z" fill="#FFA500"/><path d="M24 18C24 18 19 24 19 28C19 30.761 21.239 33 24 33C26.761 33 29 30.761 29 28C29 24 24 18 24 18Z" fill="#FFD700"/></svg>`,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'svg_speed_wheel',
    name: 'Спортивный Диск / Шиномонтаж',
    category: 'Шиномонтаж',
    svgContent: `<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="22" fill="#1C2026"/><circle cx="24" cy="24" r="17" stroke="#FF9F0A" stroke-width="4"/><circle cx="24" cy="24" r="7" fill="#FF9F0A"/><path d="M24 7V17M24 31V41M7 24H17M31 24H41" stroke="#FF9F0A" stroke-width="3" stroke-linecap="round"/></svg>`,
    createdAt: new Date().toISOString(),
  },
];

const INITIAL_SPONSORED_BANNERS: SponsoredBanner[] = [
  {
    id: 'ad_shina_24',
    title: 'Шиномонтаж 24/7 «PitStop PRO»',
    subtitle: 'Правка дисков, балансировка и ремонт проколов за 15 мин',
    categoryBadge: 'Автосервис',
    icon: '🛞',
    customIconId: 'svg_speed_wheel',
    bannerColor: '#FF9F0A',
    address: 'ул. Станционная, 32/1 (возле переезда)',
    latitude: 55.0089,
    longitude: 82.9372,
    phone: '+7 (383) 299-44-22',
    promoCode: 'ROADLIVE20',
    discountText: 'Скидка 20%',
    actionText: 'Маршрут',
    details: 'Круглосуточный экспресс-шиномонтаж для легковых и внедорожников. Чай, кофе и тёплая зона ожидания для водителей. Работаем без очередей по живой очереди и записи.',
    isActive: true,
  },
  {
    id: 'ad_coffee_prime',
    title: 'Кофе на АЗС «Прайм» в подарок',
    subtitle: 'Зерновой капучино при заправке от 30 л по промокоду',
    categoryBadge: 'Акция на АЗС',
    icon: '☕',
    customIconId: 'svg_gazprom_flame',
    bannerColor: '#0078D7',
    address: 'ул. Большевистская, 125',
    latitude: 55.0124,
    longitude: 82.9485,
    phone: '+7 (800) 555-35-35',
    promoCode: 'ROADCOFFEE',
    discountText: 'Бесплатный кофе',
    actionText: 'Заехать',
    details: 'Премиальный свежеобжаренный кофе 100% арабика и свежая выпечка. Бесконтактная заправка через приложение или на кассе.',
    isActive: true,
  },
  {
    id: 'ad_tow_truck',
    title: 'Служба эвакуации и техпомощи',
    subtitle: 'Приезд от 12 минут · Прикурка 12V/24V, буксировка, вскрытие',
    categoryBadge: 'Помощь на дороге',
    icon: '🚨',
    bannerColor: '#4B8DFF',
    address: 'Дежурство по всем районам города',
    latitude: 55.0255,
    longitude: 82.9150,
    phone: '+7 (383) 380-00-11',
    promoCode: 'AUTOHELP',
    discountText: 'Скидка 500 ₽',
    actionText: 'Вызвать',
    details: 'Быстрая техпомощь на дороге: запуск двигателя бустером, подвоз бензина/дизеля, вытягивание из кювета и эвакуатор любой сложности 24/7.',
    isActive: true,
  },
  {
    id: 'ad_car_wash',
    title: 'Робот-мойка без очередей «AquaSpeed»',
    subtitle: 'Бесконтактная экспресс-мойка с сушкой за 4 минуты — от 250 ₽',
    categoryBadge: 'Автомойка',
    icon: '🚿',
    bannerColor: '#30B0C7',
    address: 'ул. Немировича-Данченко, 142/2',
    latitude: 54.9892,
    longitude: 82.9110,
    phone: '+7 (913) 777-12-34',
    promoCode: 'SPEEDWASH',
    discountText: 'Пена + Воск в подарок',
    actionText: 'Показать',
    details: 'Ультразвуковая и роботизированная мойка днища и кузова без щеток и царапин. Оплата картой, QR и СБП прямо из окна авто.',
    isActive: true,
  },
];

export const AdService = {
  // --- CONFIGURATION & TIMING ---
  getConfig(): AdDisplayConfig {
    try {
      const data = localStorage.getItem(AD_CONFIG_STORAGE_KEY);
      if (data) {
        return { ...DEFAULT_AD_CONFIG, ...JSON.parse(data) };
      }
    } catch (e) {
      console.error('Error reading ad config:', e);
    }
    return DEFAULT_AD_CONFIG;
  },

  saveConfig(config: Partial<AdDisplayConfig>): void {
    const current = this.getConfig();
    const updated = { ...current, ...config };
    try {
      localStorage.setItem(AD_CONFIG_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Error saving ad config:', e);
    }
  },

  // --- CUSTOM SVG ICONS MANAGEMENT ---
  getCustomIcons(): CustomAdIcon[] {
    try {
      const data = localStorage.getItem(CUSTOM_ICONS_STORAGE_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {
      console.error('Error reading custom icons:', e);
    }
    return INITIAL_CUSTOM_ICONS;
  },

  saveCustomIcons(icons: CustomAdIcon[]): void {
    try {
      localStorage.setItem(CUSTOM_ICONS_STORAGE_KEY, JSON.stringify(icons));
    } catch (e) {
      console.error('Error saving custom icons:', e);
    }
  },

  addCustomIcon(name: string, svgContent: string, category: string = 'Пользовательские'): CustomAdIcon {
    const cleanSvg = this.sanitizeSvg(svgContent);
    const newIcon: CustomAdIcon = {
      id: `svg_icon_${Date.now()}`,
      name: name.trim() || `Иконка #${Date.now().toString().slice(-4)}`,
      category,
      svgContent: cleanSvg,
      createdAt: new Date().toISOString(),
    };
    const current = this.getCustomIcons();
    const updated = [newIcon, ...current];
    this.saveCustomIcons(updated);
    return newIcon;
  },

  deleteCustomIcon(id: string): void {
    const current = this.getCustomIcons();
    const updated = current.filter((item) => item.id !== id);
    this.saveCustomIcons(updated);
  },

  getCustomIconById(id: string): CustomAdIcon | undefined {
    return this.getCustomIcons().find((item) => item.id === id);
  },

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
    try {
      const data = localStorage.getItem(ADS_STORAGE_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {
      console.error(e);
    }
    return INITIAL_SPONSORED_BANNERS;
  },

  getBanners(): SponsoredBanner[] {
    const all = this.getAllAds();
    const closedIds = this.getClosedBannerIds();
    return all
      .filter((b) => b.isActive !== false && !closedIds.includes(b.id))
      .map((ad) => {
        const visual = this.resolveAdVisualSource(ad);
        return {
          ...ad,
          customLogoUrl: visual.customLogoUrl || ad.customLogoUrl,
        };
      });
  },

  saveAds(ads: SponsoredBanner[]): void {
    try {
      localStorage.setItem(ADS_STORAGE_KEY, JSON.stringify(ads));
    } catch (e) {
      console.error(e);
    }
  },

  addAd(ad: Omit<SponsoredBanner, 'id'> & { id?: string }): SponsoredBanner {
    const all = this.getAllAds();
    const newAd: SponsoredBanner = {
      ...ad,
      id: ad.id || `ad_${Date.now()}`,
      isActive: ad.isActive !== undefined ? ad.isActive : true,
    };
    const updated = [newAd, ...all];
    this.saveAds(updated);
    return newAd;
  },

  updateAd(id: string, updates: Partial<SponsoredBanner>): void {
    const all = this.getAllAds();
    const updated = all.map((ad) => (ad.id === id ? { ...ad, ...updates } : ad));
    this.saveAds(updated);
  },

  deleteAd(id: string): void {
    const all = this.getAllAds();
    const updated = all.filter((ad) => ad.id !== id);
    this.saveAds(updated);
  },

  toggleAdActive(id: string): void {
    const all = this.getAllAds();
    const updated = all.map((ad) => (ad.id === id ? { ...ad, isActive: !ad.isActive } : ad));
    this.saveAds(updated);
  },

  getClosedBannerIds(): string[] {
    try {
      const data = sessionStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  closeBanner(id: string): void {
    const current = this.getClosedBannerIds();
    if (!current.includes(id)) {
      const updated = [...current, id];
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (e) {
        console.error(e);
      }
    }
  },

  resetClosedBanners(): void {
    sessionStorage.removeItem(STORAGE_KEY);
  },
};
