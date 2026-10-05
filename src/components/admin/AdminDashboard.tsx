import React, { useState, useRef } from 'react';
import { RoadEvent, UserProfile, FuelStation, SponsoredBanner, CustomAdIcon } from '../../types';
import { 
  ShieldAlert, Trash2, X, BellRing, Sparkles, Plus, 
  MapPin, Phone, Tag, Upload, Image as ImageIcon, Check, RotateCcw, 
  Eye, EyeOff, Code, Layers, FileCode
} from 'lucide-react';
import { EventService } from '../../services/eventService';
import { UserService } from '../../services/userService';
import { StationService } from '../../services/stationService';
import { NotificationService } from '../../services/notificationService';
import { AdService, PRESET_AD_ICONS } from '../../services/adService';
import { get3DAdSvg } from '../ads/adVisuals';

interface AdminDashboardProps {
  onClose: () => void;
  onRefreshData: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  onClose,
  onRefreshData,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'events' | 'ads_management' | 'users' | 'stations'>('overview');
  const [adsSubTab, setAdsSubTab] = useState<'campaigns' | 'svg_icons'>('campaigns');

  const [events, setEvents] = useState<RoadEvent[]>(EventService.getAllEventsForAdmin());
  const [users, setUsers] = useState<UserProfile[]>(UserService.getAllUsers());
  const [stations, setStations] = useState<FuelStation[]>(StationService.getStations());
  const [ads, setAds] = useState<SponsoredBanner[]>(AdService.getAllAds());
  const [customIcons, setCustomIcons] = useState<CustomAdIcon[]>(AdService.getCustomIcons());
  const [adIntervalSeconds, setAdIntervalSeconds] = useState<number>(AdService.getConfig().intervalSeconds || 900);
  const [adAutoDismissSeconds, setAdAutoDismissSeconds] = useState<number>(AdService.getConfig().autoDismissSeconds || 30);
  const [adEnabled, setAdEnabled] = useState<boolean>(AdService.getConfig().enabled !== false);
  const [pushFeedback, setPushFeedback] = useState<string | null>(null);

  // Form for new station
  const [newStationName, setNewStationName] = useState('');
  const [newStationBrand, setNewStationBrand] = useState('Газпромнефть');
  const [newStationAddress, setNewStationAddress] = useState('');
  const [newStationLat] = useState('55.0200');
  const [newStationLng] = useState('82.9300');

  // Form for new / edited Ad Campaign
  const [adTitle, setAdTitle] = useState('');
  const [adSubtitle, setAdSubtitle] = useState('');
  const [adCategory, setAdCategory] = useState('Автосервис');
  const [adIcon, setAdIcon] = useState('🛞');
  const [selectedCustomIconId, setSelectedCustomIconId] = useState<string | null>(null);
  const [adCustomLogoUrl, setAdCustomLogoUrl] = useState<string>('');
  const [adBannerColor, setAdBannerColor] = useState('#4B8DFF');
  const [adAddress, setAdAddress] = useState('');
  const [adLat, setAdLat] = useState('55.0089');
  const [adLng, setAdLng] = useState('82.9372');
  const [adPhone, setAdPhone] = useState('+7 (383) 299-44-22');
  const [adPromoCode, setAdPromoCode] = useState('ROADPROMO');
  const [adDiscountText, setAdDiscountText] = useState('Скидка 20%');
  const [adActionText, setAdActionText] = useState('Маршрут');
  const [adDetails, setAdDetails] = useState('Описание услуг партнёра и акции для водителей.');
  const [isCreatingAd, setIsCreatingAd] = useState(false);
  const logoFileInputRef = useRef<HTMLInputElement>(null);

  // Form for New Custom SVG Icon Upload
  const [svgName, setSvgName] = useState('');
  const [svgCategory, setSvgCategory] = useState('Автосервис');
  const [svgRawCode, setSvgRawCode] = useState('');
  const [isUploadingSvg, setIsUploadingSvg] = useState(false);
  const svgFileInputRef = useRef<HTMLInputElement>(null);

  const handleModerate = (eventId: string, action: 'hide' | 'restore' | 'resolve' | 'delete') => {
    EventService.moderateEvent(eventId, action);
    setEvents(EventService.getAllEventsForAdmin());
    onRefreshData();
  };

  const handleToggleUserBan = (userId: string) => {
    UserService.toggleUserBan(userId);
    setUsers(UserService.getAllUsers());
  };

  const handleAddStation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStationName || !newStationAddress) return;

    StationService.addStation({
      cityId: 'nsk-city-01',
      name: newStationName,
      brand: newStationBrand,
      latitude: parseFloat(newStationLat),
      longitude: parseFloat(newStationLng),
      address: newStationAddress,
      fuelTypes: { ai92: 62.40, ai95: 65.90, dt: 71.90 },
      queueStatus: 'none',
    });

    setStations(StationService.getStations());
    setNewStationName('');
    setNewStationAddress('');
    onRefreshData();
  };

  const handleDeleteStation = (id: string) => {
    StationService.deleteStation(id);
    setStations(StationService.getStations());
    onRefreshData();
  };

  // Direct Image/Logo File Upload
  const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const result = uploadEvent.target?.result as string;
      if (result) {
        setAdCustomLogoUrl(result);
        setSelectedCustomIconId(null);
      }
    };
    reader.readAsDataURL(file);
  };

  // Custom SVG File Upload (.svg)
  const handleSvgFileRead = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!svgName) {
      const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
      setSvgName(fileNameWithoutExt);
    }

    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const text = uploadEvent.target?.result as string;
      if (text) {
        setSvgRawCode(text);
      }
    };
    reader.readAsText(file);
  };

  // Save new custom SVG Icon to AdService
  const handleSaveCustomSvgIcon = (e: React.FormEvent) => {
    e.preventDefault();
    if (!svgRawCode.trim()) return;

    const created = AdService.addCustomIcon(svgName || 'Новая SVG Иконка', svgRawCode, svgCategory);
    setCustomIcons(AdService.getCustomIcons());
    setSvgName('');
    setSvgRawCode('');
    setIsUploadingSvg(false);
    setPushFeedback(`SVG иконка «${created.name}» успешно добавлена в каталог!`);
    setTimeout(() => setPushFeedback(null), 3500);
  };

  const handleDeleteCustomSvgIcon = (id: string) => {
    AdService.deleteCustomIcon(id);
    setCustomIcons(AdService.getCustomIcons());
    if (selectedCustomIconId === id) {
      setSelectedCustomIconId(null);
    }
    onRefreshData();
  };

  // Create or Update Ad Campaign
  const handleCreateAd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adTitle || !adAddress) return;

    AdService.addAd({
      title: adTitle,
      subtitle: adSubtitle || 'Спецпредложение для водителей ROADLIVE',
      categoryBadge: adCategory,
      icon: adIcon,
      customIconId: selectedCustomIconId || undefined,
      customLogoUrl: adCustomLogoUrl || undefined,
      bannerColor: adBannerColor,
      address: adAddress,
      latitude: parseFloat(adLat) || 55.0089,
      longitude: parseFloat(adLng) || 82.9372,
      phone: adPhone,
      promoCode: adPromoCode,
      discountText: adDiscountText,
      actionText: adActionText || 'Маршрут',
      details: adDetails,
      isActive: true,
    });

    setAds(AdService.getAllAds());
    setIsCreatingAd(false);
    // Reset Form
    setAdTitle('');
    setAdSubtitle('');
    setAdAddress('');
    setAdCustomLogoUrl('');
    setSelectedCustomIconId(null);
    onRefreshData();
    setPushFeedback(`Рекламная метка «${adTitle}» успешно добавлена на карту!`);
    setTimeout(() => setPushFeedback(null), 3500);
  };

  const handleDeleteAd = (id: string) => {
    AdService.deleteAd(id);
    setAds(AdService.getAllAds());
    onRefreshData();
  };

  const handleToggleAdActive = (id: string) => {
    AdService.toggleAdActive(id);
    setAds(AdService.getAllAds());
    onRefreshData();
  };

  const handleResetClosedAds = () => {
    AdService.resetClosedBanners();
    setAds(AdService.getAllAds());
    onRefreshData();
    setPushFeedback('Все закрытые пользователем рекламные метки снова отображаются на карте');
    setTimeout(() => setPushFeedback(null), 3500);
  };

  const handleSaveAdTiming = (newInterval: number, newAutoDismiss: number, newEnabled: boolean) => {
    AdService.saveConfig({ intervalSeconds: newInterval, autoDismissSeconds: newAutoDismiss, enabled: newEnabled });
    setAdIntervalSeconds(newInterval);
    setAdAutoDismissSeconds(newAutoDismiss);
    setAdEnabled(newEnabled);
    const intervalMin = (newInterval / 60).toFixed(1);
    setPushFeedback(`Настройки сохранены: показ раз в ${newInterval >= 60 ? `${intervalMin} мин` : `${newInterval}с`}, автоскрытие через ${newAutoDismiss}с.`);
    setTimeout(() => setPushFeedback(null), 3500);
    onRefreshData();
  };

  // Preview logo / SVG resolver for the creation form
  const getPreviewLogoSrc = () => {
    if (adCustomLogoUrl) return adCustomLogoUrl;
    if (selectedCustomIconId) {
      const item = customIcons.find((c) => c.id === selectedCustomIconId);
      if (item) {
        return `data:image/svg+xml;utf8,${encodeURIComponent(item.svgContent)}`;
      }
    }
    return undefined;
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#111315] overflow-hidden select-none animate-in fade-in duration-200">
      {/* Dark Graphite Header */}
      <header className="p-4 sm:p-5 bg-[#181B1F] border-b border-white/[0.08] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-[#20242A] border border-white/10 text-[#E5A93C] flex items-center justify-center font-bold">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm sm:text-base font-semibold text-white tracking-tight">
              ROADLIVE · Панель управления & Модерация
            </h1>
            <p className="text-[11px] text-[#9AA0A8]">
              Управление дорожными событиями, кастомными SVG иконками и рекламой 2ГИС
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              setPushFeedback('Отправка...');
              const res = await NotificationService.sendTestPush();
              setPushFeedback(res.message);
              setTimeout(() => setPushFeedback(null), 4000);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#20242A] hover:bg-white/10 border border-white/10 text-white font-medium text-xs rounded-xl transition active:scale-95"
            title="Отправить тестовое критическое оповещение"
          >
            <BellRing className="w-3.5 h-3.5 text-[#4B8DFF]" />
            <span className="hidden sm:inline">Тестовый пуш</span>
          </button>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-white/5 text-[#9AA0A8] hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {pushFeedback && (
        <div className="bg-[#20242A] border-b border-[#4B8DFF]/40 text-white px-4 py-2 text-xs text-center animate-in fade-in flex items-center justify-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-[#E5A93C]" />
          <span>{pushFeedback}</span>
        </div>
      )}

      {/* Main Tabs Navigation */}
      <div className="bg-[#181B1F]/60 border-b border-white/[0.08] px-4 py-2">
        <div className="flex items-center p-1 bg-[#111315] rounded-xl max-w-4xl mx-auto border border-white/[0.06] overflow-x-auto no-scrollbar">
          {[
            { id: 'overview', label: 'Сводка' },
            { id: 'ads_management', label: `Управление рекламой (${ads.length})` },
            { id: 'events', label: `События (${events.length})` },
            { id: 'users', label: `Водители (${users.length})` },
            { id: 'stations', label: `АЗС (${stations.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium whitespace-nowrap transition-all select-none ${
                activeTab === tab.id
                  ? 'bg-[#20242A] text-white border border-white/10 shadow-xs'
                  : 'text-[#9AA0A8] hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-5xl mx-auto w-full">
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {/* Top Metrics Banner */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-[#181B1F] p-4 rounded-2xl border border-white/[0.06]">
                <p className="text-[10px] font-medium text-[#9AA0A8] uppercase tracking-wider">
                  Сегодня
                </p>
                <p className="text-2xl font-bold text-white mt-1">1 248</p>
                <p className="text-[11px] text-[#34C759] mt-0.5">
                  событий
                </p>
              </div>

              <div className="bg-[#181B1F] p-4 rounded-2xl border border-white/[0.06]">
                <p className="text-[10px] font-medium text-[#9AA0A8] uppercase tracking-wider">
                  Подтверждений
                </p>
                <p className="text-2xl font-bold text-white mt-1">743</p>
                <p className="text-[11px] text-[#4B8DFF] mt-0.5">
                  проверено
                </p>
              </div>

              <div className="bg-[#181B1F] p-4 rounded-2xl border border-white/[0.06]">
                <p className="text-[10px] font-medium text-[#9AA0A8] uppercase tracking-wider">
                  Кастомных SVG иконок
                </p>
                <p className="text-2xl font-bold text-white mt-1">{customIcons.length}</p>
                <p className="text-[11px] text-[#E5A93C] mt-0.5">
                  в каталоге
                </p>
              </div>

              <div className="bg-[#181B1F] p-4 rounded-2xl border border-white/[0.06]">
                <p className="text-[10px] font-medium text-[#9AA0A8] uppercase tracking-wider">
                  Активных рекламных меток
                </p>
                <p className="text-2xl font-bold text-white mt-1">{ads.filter(a => a.isActive !== false).length}</p>
                <p className="text-[11px] text-[#34C759] mt-0.5">
                  на карте города
                </p>
              </div>
            </div>

            {/* Праздничное оформление аватаров */}
            <div className="bg-[#181B1F] p-5 rounded-2xl border border-white/[0.06] space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#AF52DE]/10 text-[#AF52DE] flex items-center justify-center text-xl shrink-0">
                  🎉
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Праздничные атрибуты аватаров</h3>
                  <p className="text-xs text-[#9AA0A8] mt-0.5">
                    Выберите активный праздник, чтобы надеть тематический аксессуар на аватар каждого водителя
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'none', label: 'Обычный день', icon: '👤', desc: 'Без украшений' },
                  { id: 'new_year', label: 'Новый Год', icon: '🤶', desc: 'Шапка Деда Мороза' },
                  { id: 'halloween', label: 'Хэллоуин', icon: '🎃', desc: 'Тыква на бок' },
                  { id: 'driver_day', label: 'День Автомобилиста', icon: '🏆', desc: 'Золотой кубок' },
                ].map((holiday) => {
                  const isActive = (localStorage.getItem('roadlive_active_holiday') || 'none') === holiday.id;
                  return (
                    <button
                      key={holiday.id}
                      type="button"
                      onClick={() => {
                        localStorage.setItem('roadlive_active_holiday', holiday.id);
                        window.dispatchEvent(new Event('roadlive_holiday_changed'));
                        setPushFeedback(`Активировано оформление: ${holiday.label}!`);
                        setTimeout(() => setPushFeedback(null), 3000);
                      }}
                      className={`p-3.5 rounded-xl border text-left transition relative overflow-hidden active:scale-95 cursor-pointer ${
                        isActive
                          ? 'bg-[#AF52DE]/15 border-[#AF52DE] text-white shadow-[0_4px_16px_rgba(175,82,222,0.15)]'
                          : 'bg-[#111315] hover:bg-white/5 border-white/[0.06] text-[#9AA0A8] hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{holiday.icon}</span>
                        <p className="text-xs font-bold leading-tight">{holiday.label}</p>
                      </div>
                      <p className="text-[10px] text-[#555A60] mt-1.5 leading-none">{holiday.desc}</p>
                      {isActive && (
                        <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#AF52DE]" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Banner Link to Ads Management */}
            <div className="bg-gradient-to-r from-[#181B1F] to-[#20242A] p-5 rounded-2xl border border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-[#4B8DFF]/20 border border-[#4B8DFF]/30 text-[#4B8DFF] flex items-center justify-center text-2xl shrink-0">
                  <Layers className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Раздел «Управление рекламой»</h3>
                  <p className="text-xs text-[#9AA0A8] mt-0.5">
                    Загрузка векторных SVG иконок, создание динамических брендированных меток 2ГИС и настройка спецпредложений
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveTab('ads_management')}
                className="px-4 py-2.5 bg-[#4B8DFF] hover:bg-[#3C7AE6] text-white text-xs font-semibold rounded-xl transition active:scale-95 shrink-0"
              >
                Перейти к управлению рекламой →
              </button>
            </div>
          </div>
        )}

        {/* --- DEDICATED ADS MANAGEMENT SECTION --- */}
        {activeTab === 'ads_management' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Header + Sub-navigation tabs */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Управление рекламой & SVG Иконками</span>
                </h2>
                <p className="text-xs text-[#9AA0A8] mt-0.5">
                  Загружайте кастомные SVG иконки компаний и настраивайте интерактивные рекламные метки для карты
                </p>
              </div>

              {/* Sub-tabs: Campaigns vs Custom SVG Icons */}
              <div className="flex items-center p-1 bg-[#14171B] rounded-xl border border-white/10">
                <button
                  type="button"
                  onClick={() => setAdsSubTab('campaigns')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    adsSubTab === 'campaigns'
                      ? 'bg-[#4B8DFF] text-white shadow-xs'
                      : 'text-[#9AA0A8] hover:text-white'
                  }`}
                >
                  Рекламные кампании ({ads.length})
                </button>
                <button
                  type="button"
                  onClick={() => setAdsSubTab('svg_icons')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    adsSubTab === 'svg_icons'
                      ? 'bg-[#4B8DFF] text-white shadow-xs'
                      : 'text-[#9AA0A8] hover:text-white'
                  }`}
                >
                  Кастомные SVG ({customIcons.length})
                </button>
              </div>
            </div>

            {/* Interval & Auto-Dismiss Settings Bar */}
            <div className="bg-[#181B1F] p-4 rounded-2xl border border-white/10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#4B8DFF]/15 border border-[#4B8DFF]/30 text-[#4B8DFF] flex items-center justify-center font-bold">
                  ⏱️
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-white">Таймеры и интервал показа баннеров</h4>
                  <p className="text-[11px] text-[#9AA0A8]">
                    Интервал появления раз в 15 минут (900с) и автоскрытие через 30с при отсутствии действий.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-wrap w-full lg:w-auto">
                {/* Interval Input */}
                <div className="flex items-center gap-1.5 bg-[#111315] px-3 py-1.5 rounded-xl border border-white/10">
                  <span className="text-xs text-[#9AA0A8]">Интервал:</span>
                  <input
                    type="number"
                    min="5"
                    max="3600"
                    value={adIntervalSeconds}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 30;
                      setAdIntervalSeconds(val);
                      handleSaveAdTiming(val, adAutoDismissSeconds, adEnabled);
                    }}
                    className="w-16 bg-[#181B1F] border border-white/15 rounded-lg px-2 py-1 text-xs text-white text-center font-bold focus:outline-hidden focus:border-[#4B8DFF]"
                  />
                  <span className="text-xs text-white font-medium">сек</span>
                </div>

                {/* Interval Presets */}
                <div className="flex items-center gap-1">
                  {[
                    { label: '30с (тест)', val: 30 },
                    { label: '1 мин', val: 60 },
                    { label: '5 мин', val: 300 },
                    { label: '15 мин', val: 900 },
                  ].map((p) => (
                    <button
                      key={p.val}
                      type="button"
                      onClick={() => handleSaveAdTiming(p.val, adAutoDismissSeconds, adEnabled)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        adIntervalSeconds === p.val
                          ? 'bg-[#4B8DFF] text-white shadow-xs'
                          : 'bg-[#20242A] text-[#9AA0A8] hover:text-white border border-white/5'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {/* Auto-Dismiss Input */}
                <div className="flex items-center gap-1.5 bg-[#111315] px-3 py-1.5 rounded-xl border border-white/10">
                  <span className="text-xs text-[#9AA0A8]">Скрытие через:</span>
                  <input
                    type="number"
                    min="5"
                    max="180"
                    value={adAutoDismissSeconds}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 30;
                      setAdAutoDismissSeconds(val);
                      handleSaveAdTiming(adIntervalSeconds, val, adEnabled);
                    }}
                    className="w-14 bg-[#181B1F] border border-white/15 rounded-lg px-2 py-1 text-xs text-white text-center font-bold focus:outline-hidden focus:border-[#4B8DFF]"
                  />
                  <span className="text-xs text-white font-medium">сек</span>
                </div>

                <button
                  type="button"
                  onClick={() => handleSaveAdTiming(adIntervalSeconds, adAutoDismissSeconds, !adEnabled)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                    adEnabled
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/25'
                      : 'bg-rose-500/15 border-rose-500/40 text-rose-400 hover:bg-rose-500/25'
                  }`}
                >
                  {adEnabled ? 'Включены' : 'Выключены'}
                </button>
              </div>
            </div>

            {/* --- SUB-TAB 1: CUSTOM SVG ICONS LIBRARY --- */}
            {adsSubTab === 'svg_icons' && (
              <div className="space-y-5 animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <FileCode className="w-4 h-4 text-[#4B8DFF]" />
                      <span>Каталог векторных SVG иконок</span>
                    </h3>
                    <p className="text-xs text-[#9AA0A8]">
                      Загружайте файлы .svg или вставляйте SVG код логотипов компаний для использования в рекламе на карте
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsUploadingSvg(!isUploadingSvg)}
                    className="px-3.5 py-2 bg-[#4B8DFF] hover:bg-[#3C7AE6] text-white text-xs font-semibold rounded-xl shadow-md transition active:scale-95 flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[3]" />
                    <span>{isUploadingSvg ? 'Свернуть форму' : 'Загрузить новый SVG'}</span>
                  </button>
                </div>

                {/* SVG Uploader Form */}
                {isUploadingSvg && (
                  <form onSubmit={handleSaveCustomSvgIcon} className="bg-[#181B1F] p-4 sm:p-5 rounded-2xl border border-white/10 space-y-4 animate-in slide-in-from-top-3 duration-200">
                    <div className="flex items-center justify-between border-b border-white/10 pb-3">
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        <Upload className="w-4 h-4 text-[#4B8DFF]" />
                        <span>Загрузка кастомной SVG иконки</span>
                      </h4>
                      <button
                        type="button"
                        onClick={() => setIsUploadingSvg(false)}
                        className="text-[#9AA0A8] hover:text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-[#9AA0A8] mb-1">
                          Название иконки / Бренд *
                        </label>
                        <input
                          type="text"
                          required
                          value={svgName}
                          onChange={(e) => setSvgName(e.target.value)}
                          placeholder="Например: Логотип Газпром / Мойка Аква"
                          className="w-full bg-[#111315] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-hidden focus:border-[#4B8DFF]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-[#9AA0A8] mb-1">
                          Категория
                        </label>
                        <select
                          value={svgCategory}
                          onChange={(e) => setSvgCategory(e.target.value)}
                          className="w-full bg-[#111315] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-hidden focus:border-[#4B8DFF]"
                        >
                          <option value="Автосервис">Автосервис / СТО</option>
                          <option value="Шиномонтаж">Шиномонтаж</option>
                          <option value="АЗС">АЗС / Топливо</option>
                          <option value="Автомойка">Автомойка</option>
                          <option value="Эвакуатор">Эвакуатор / Помощь</option>
                          <option value="Кафе">Автокафе / Еда</option>
                          <option value="Бизнес">Бизнес / Отель</option>
                          <option value="Пользовательские">Пользовательские</option>
                        </select>
                      </div>
                    </div>

                    {/* SVG File or Raw Code */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-[#9AA0A8]">
                          SVG код или загрузка файла .svg *
                        </label>

                        <div className="flex items-center gap-2">
                          <input
                            type="file"
                            ref={svgFileInputRef}
                            accept=".svg,image/svg+xml"
                            onChange={handleSvgFileRead}
                            className="hidden"
                          />
                          <button
                            type="button"
                            onClick={() => svgFileInputRef.current?.click()}
                            className="px-2.5 py-1 bg-[#20242A] hover:bg-[#282D35] text-white text-[11px] rounded-lg border border-white/10 flex items-center gap-1.5 transition"
                          >
                            <Upload className="w-3 h-3 text-[#4B8DFF]" />
                            <span>Выбрать .svg файл</span>
                          </button>
                        </div>
                      </div>

                      <textarea
                        rows={4}
                        required
                        value={svgRawCode}
                        onChange={(e) => setSvgRawCode(e.target.value)}
                        placeholder='<svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"> ... </svg>'
                        className="w-full bg-[#111315] border border-white/10 rounded-xl p-3 text-xs text-white font-mono focus:outline-hidden focus:border-[#4B8DFF]"
                      />
                    </div>

                    {/* Live SVG Preview */}
                    {svgRawCode.trim() && (
                      <div className="p-3 bg-[#14171B] rounded-xl border border-white/5 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-[#111315] border border-white/10 flex items-center justify-center p-1 overflow-hidden shrink-0 shadow-inner">
                          <div 
                            className="w-10 h-10 flex items-center justify-center"
                            dangerouslySetInnerHTML={{ __html: AdService.sanitizeSvg(svgRawCode) }}
                          />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-white">{svgName || 'Предпросмотр SVG'}</p>
                          <p className="text-[11px] text-[#34C759]">SVG код валиден и готов к сохранению</p>
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setIsUploadingSvg(false)}
                        className="px-4 py-2 bg-white/5 text-[#9AA0A8] text-xs font-medium rounded-xl hover:bg-white/10 transition"
                      >
                        Отмена
                      </button>
                      <button
                        type="submit"
                        className="px-5 py-2 bg-[#4B8DFF] hover:bg-[#3C7AE6] text-white text-xs font-semibold rounded-xl shadow-md transition active:scale-95 flex items-center gap-1.5"
                      >
                        <Check className="w-4 h-4 stroke-[3]" />
                        <span>Добавить SVG иконку в библиотеку</span>
                      </button>
                    </div>
                  </form>
                )}

                {/* Grid of uploaded Custom SVG Icons */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {customIcons.map((item) => (
                    <div
                      key={item.id}
                      className="bg-[#181B1F] p-4 rounded-2xl border border-white/[0.08] flex items-center justify-between gap-3 group hover:border-white/20 transition"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-xl bg-[#111315] border border-white/10 flex items-center justify-center p-1.5 shrink-0 shadow-inner group-hover:border-[#4B8DFF]/40 transition">
                          <div 
                            className="w-9 h-9 flex items-center justify-center"
                            dangerouslySetInnerHTML={{ __html: item.svgContent }}
                          />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-white truncate">{item.name}</h4>
                          <span className="text-[10px] text-[#4B8DFF] bg-[#4B8DFF]/10 px-1.5 py-0.2 rounded font-medium">
                            {item.category || 'Иконка'}
                          </span>
                          <p className="text-[9px] text-[#9AA0A8] truncate mt-0.5">
                            {new Date(item.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteCustomSvgIcon(item.id)}
                        className="p-1.5 rounded-lg bg-white/5 text-[#9AA0A8] hover:text-[#FF453A] hover:bg-[#FF453A]/10 transition"
                        title="Удалить иконку"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* --- SUB-TAB 2: AD CAMPAIGNS & MAP PINS --- */}
            {adsSubTab === 'campaigns' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>Список рекламных меток на карте</span>
                      <span className="text-xs px-2 py-0.5 rounded-md bg-[#4B8DFF]/20 text-[#4B8DFF] border border-[#4B8DFF]/30">
                        {ads.length} меток
                      </span>
                    </h3>
                    <p className="text-xs text-[#9AA0A8]">
                      Отображаются в виде стильных круглых меток с вашим кастомным SVG или логотипом компании
                    </p>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={handleResetClosedAds}
                      className="flex-1 sm:flex-none px-3 py-2 bg-[#20242A] hover:bg-white/10 text-[#9AA0A8] hover:text-white text-xs font-medium rounded-xl border border-white/10 transition active:scale-95 flex items-center justify-center gap-1.5"
                      title="Восстановить скрытые пользователем плашки"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Сбросить скрытия</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsCreatingAd(!isCreatingAd)}
                      className="flex-1 sm:flex-none px-3.5 py-2 bg-[#4B8DFF] hover:bg-[#3C7AE6] text-white text-xs font-semibold rounded-xl shadow-md transition active:scale-95 flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5 stroke-[3]" />
                      <span>{isCreatingAd ? 'Свернуть форму' : 'Создать рекламную метку'}</span>
                    </button>
                  </div>
                </div>

                {/* CREATE / EDIT AD FORM */}
                {isCreatingAd && (
                  <form onSubmit={handleCreateAd} className="bg-[#181B1F] p-4 sm:p-6 rounded-2xl border border-white/10 space-y-4 animate-in slide-in-from-top-3 duration-250">
                    <div className="flex items-center justify-between border-b border-white/10 pb-3">
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-[#E5A93C]" />
                        <span>Новая рекламная кампания на карте</span>
                      </h3>
                      <button
                        type="button"
                        onClick={() => setIsCreatingAd(false)}
                        className="p-1 rounded-lg text-[#9AA0A8] hover:text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      {/* Left Column: Form Fields */}
                      <div className="lg:col-span-2 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-[#9AA0A8] mb-1">
                              Название компании / места *
                            </label>
                            <input
                              type="text"
                              required
                              value={adTitle}
                              onChange={(e) => setAdTitle(e.target.value)}
                              placeholder="Например: Автокомплекс YES PRO"
                              className="w-full bg-[#111315] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-hidden focus:border-[#4B8DFF]"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-[#9AA0A8] mb-1">
                              Категория / Бейдж
                            </label>
                            <select
                              value={adCategory}
                              onChange={(e) => setAdCategory(e.target.value)}
                              className="w-full bg-[#111315] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-hidden focus:border-[#4B8DFF]"
                            >
                              <option value="Автосервис">Автосервис / СТО</option>
                              <option value="Шиномонтаж">Шиномонтаж 24/7</option>
                              <option value="АЗС">АЗС / Топливо</option>
                              <option value="Автомойка">Автомойка</option>
                              <option value="Помощь на дороге">Помощь на дороге / Эвакуатор</option>
                              <option value="Отель & Спа">Отель / Апарт-комплекс</option>
                              <option value="Бизнес-центр">Бизнес-центр</option>
                              <option value="Кафе">Автокафе / Драйв</option>
                              <option value="Запчасти">Магазин запчастей</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-[#9AA0A8] mb-1">
                            Краткий слоган / спецпредложение
                          </label>
                          <input
                            type="text"
                            value={adSubtitle}
                            onChange={(e) => setAdSubtitle(e.target.value)}
                            placeholder="Например: Правка дисков и балансировка за 15 минут со скидкой 20%"
                            className="w-full bg-[#111315] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-hidden focus:border-[#4B8DFF]"
                          />
                        </div>

                        {/* --- COMPREHENSIVE ICON & CUSTOM SVG CHOOSER --- */}
                        <div className="p-4 rounded-xl bg-[#14171B] border border-white/5 space-y-3">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-white flex items-center gap-1.5">
                              <ImageIcon className="w-3.5 h-3.5 text-[#4B8DFF]" />
                              <span>Выбор иконки / Логотипа рекламы</span>
                            </label>
                            <span className="text-[10px] text-[#9AA0A8]">
                              Отображается внутри метки на карте
                            </span>
                          </div>

                          {/* 1. Custom Uploaded SVGs Section */}
                          {customIcons.length > 0 && (
                            <div>
                              <p className="text-[11px] font-semibold text-[#4B8DFF] mb-2 flex items-center gap-1">
                                <FileCode className="w-3 h-3" />
                                <span>Загруженные кастомные SVG иконки:</span>
                              </p>
                              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                                {customIcons.map((item) => (
                                  <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedCustomIconId(item.id);
                                      setAdCustomLogoUrl('');
                                    }}
                                    className={`p-2 rounded-xl flex flex-col items-center justify-center gap-1 border transition-all ${
                                      selectedCustomIconId === item.id && !adCustomLogoUrl
                                        ? 'bg-[#4B8DFF]/25 border-[#4B8DFF] text-white scale-105 shadow-sm'
                                        : 'bg-[#181B1F] border-white/5 hover:border-white/20 text-[#9AA0A8] hover:text-white'
                                    }`}
                                    title={item.name}
                                  >
                                    <div 
                                      className="w-6 h-6 flex items-center justify-center pointer-events-none"
                                      dangerouslySetInnerHTML={{ __html: item.svgContent }}
                                    />
                                    <span className="text-[9px] truncate max-w-[60px]">{item.name}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 2. Direct Image/Logo Upload */}
                          <div className="flex items-center gap-3 pt-2 border-t border-white/5">
                            <input
                              type="file"
                              ref={logoFileInputRef}
                              accept="image/*"
                              onChange={handleLogoFileUpload}
                              className="hidden"
                            />
                            <button
                              type="button"
                              onClick={() => logoFileInputRef.current?.click()}
                              className="px-3.5 py-2 bg-[#20242A] hover:bg-[#282D35] text-white text-xs font-medium rounded-xl border border-white/10 flex items-center gap-2 transition active:scale-95"
                            >
                              <Upload className="w-3.5 h-3.5 text-[#4B8DFF]" />
                              <span>Загрузить прямой логотип (PNG / JPG)</span>
                            </button>

                            {adCustomLogoUrl && (
                              <div className="flex items-center gap-2 bg-[#111315] px-2.5 py-1 rounded-xl border border-[#34C759]/30">
                                <img
                                  src={adCustomLogoUrl}
                                  alt="Logo"
                                  className="w-6 h-6 object-cover rounded-full border border-white/20"
                                />
                                <span className="text-[11px] text-[#34C759] font-medium">Логотип прикреплён</span>
                                <button
                                  type="button"
                                  onClick={() => setAdCustomLogoUrl('')}
                                  className="text-[#9AA0A8] hover:text-white p-0.5"
                                  title="Удалить логотип"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </div>

                          {/* 3. Preset Icons Grid */}
                          <div className="pt-2 border-t border-white/5">
                            <p className="text-[11px] text-[#9AA0A8] mb-2">
                              Или выберите стандартную иконку:
                            </p>
                            <div className="grid grid-cols-5 sm:grid-cols-8 gap-1.5">
                              {PRESET_AD_ICONS.map((item) => (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => {
                                    setAdIcon(item.icon);
                                    setSelectedCustomIconId(null);
                                    setAdCustomLogoUrl('');
                                  }}
                                  className={`p-2 rounded-xl flex flex-col items-center justify-center gap-1 border transition-all ${
                                    !adCustomLogoUrl && !selectedCustomIconId && adIcon === item.icon
                                      ? 'bg-[#4B8DFF]/20 border-[#4B8DFF] text-white scale-105 shadow-sm'
                                      : 'bg-[#181B1F] border-white/5 hover:border-white/20 text-[#9AA0A8] hover:text-white'
                                  }`}
                                  title={item.label}
                                >
                                  <span className="text-base">{item.icon}</span>
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* 4. Accent Color */}
                          <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                            <span className="text-xs text-[#9AA0A8]">Цвет подсветки метки:</span>
                            <div className="flex items-center gap-2">
                              {['#4B8DFF', '#FF9F0A', '#34C759', '#AF52DE', '#FF453A', '#30B0C7'].map((c) => (
                                <button
                                  key={c}
                                  type="button"
                                  onClick={() => setAdBannerColor(c)}
                                  className={`w-5 h-5 rounded-full border-2 transition-all ${
                                    adBannerColor === c ? 'scale-125 border-white shadow-sm' : 'border-transparent opacity-60 hover:opacity-100'
                                  }`}
                                  style={{ backgroundColor: c }}
                                />
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Coordinates & Address */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="sm:col-span-1">
                            <label className="block text-xs font-medium text-[#9AA0A8] mb-1">
                              Широта (Lat)
                            </label>
                            <input
                              type="text"
                              required
                              value={adLat}
                              onChange={(e) => setAdLat(e.target.value)}
                              className="w-full bg-[#111315] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-hidden"
                            />
                          </div>
                          <div className="sm:col-span-1">
                            <label className="block text-xs font-medium text-[#9AA0A8] mb-1">
                              Долгота (Lng)
                            </label>
                            <input
                              type="text"
                              required
                              value={adLng}
                              onChange={(e) => setAdLng(e.target.value)}
                              className="w-full bg-[#111315] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-hidden"
                            />
                          </div>
                          <div className="sm:col-span-1 flex items-end">
                            <button
                              type="button"
                              onClick={() => {
                                setAdLat('55.0084');
                                setAdLng('82.9357');
                              }}
                              className="w-full py-2 bg-[#20242A] hover:bg-white/10 text-white text-xs font-medium rounded-xl border border-white/10 transition"
                            >
                              В центр города
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-[#9AA0A8] mb-1">
                            Точный адрес *
                          </label>
                          <input
                            type="text"
                            required
                            value={adAddress}
                            onChange={(e) => setAdAddress(e.target.value)}
                            placeholder="ул. Станционная, 32/1"
                            className="w-full bg-[#111315] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-hidden"
                          />
                        </div>

                        {/* Phone, Promo code, and details */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-[#9AA0A8] mb-1">
                              Телефон для звонка
                            </label>
                            <input
                              type="text"
                              value={adPhone}
                              onChange={(e) => setAdPhone(e.target.value)}
                              placeholder="+7 (383) 299-44-22"
                              className="w-full bg-[#111315] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-hidden"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-[#9AA0A8] mb-1">
                              Промокод
                            </label>
                            <input
                              type="text"
                              value={adPromoCode}
                              onChange={(e) => setAdPromoCode(e.target.value)}
                              placeholder="ROADLIVE20"
                              className="w-full bg-[#111315] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-hidden font-mono"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-[#9AA0A8] mb-1">
                              Размер скидки / Подарок
                            </label>
                            <input
                              type="text"
                              value={adDiscountText}
                              onChange={(e) => setAdDiscountText(e.target.value)}
                              placeholder="Скидка 20%"
                              className="w-full bg-[#111315] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-hidden"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-[#9AA0A8] mb-1">
                            Полное описание для карточки спонсора
                          </label>
                          <textarea
                            rows={2}
                            value={adDetails}
                            onChange={(e) => setAdDetails(e.target.value)}
                            placeholder="Круглосуточный экспресс-сервис для легковых и внедорожников..."
                            className="w-full bg-[#111315] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-hidden"
                          />
                        </div>
                      </div>

                      {/* Right Column: Live 2GIS Logo Pin Preview */}
                      <div className="flex flex-col items-center justify-center p-6 bg-[#111315] rounded-2xl border border-white/10 text-center space-y-3">
                        <p className="text-xs font-bold text-[#9AA0A8] uppercase tracking-wider">
                          Превью метки логотипа на карте (2ГИС)
                        </p>

                        {/* Interactive Mock Map Surface */}
                        <div className="relative w-48 h-48 rounded-2xl bg-[#1C2026] border border-white/10 flex items-center justify-center overflow-hidden shadow-inner">
                          {/* Grid road lines */}
                          <div className="absolute inset-0 opacity-15">
                            <div className="w-full h-1 bg-[#4B8DFF] top-1/2 -translate-y-1/2 absolute rotate-12" />
                            <div className="h-full w-1 bg-white/40 left-1/3 absolute" />
                          </div>

                          {/* Render Pure Logo SVG with custom logo or icon */}
                          <div 
                            className="relative z-10 flex flex-col items-center transform scale-110"
                            dangerouslySetInnerHTML={{
                              __html: `
                                <div class="relative flex flex-col items-center">
                                  <div class="absolute -top-1 -right-1 z-30 w-4.5 h-4.5 rounded-full bg-black/40 text-white/50 border border-white/20 flex items-center justify-center text-[9px] font-medium shadow-xs">
                                    ✕
                                  </div>
                                  ${get3DAdSvg('preview', adIcon, adBannerColor, getPreviewLogoSrc())}
                                  <div class="text-[8px] font-medium uppercase tracking-wide text-white/50 bg-black/40 backdrop-blur-xs px-1.5 py-0.2 rounded mt-0.5 border border-white/10">
                                    Реклама
                                  </div>
                                </div>
                              `
                            }}
                          />
                        </div>

                        <div className="text-left w-full text-xs space-y-1 bg-[#181B1F] p-3 rounded-xl border border-white/5">
                          <p className="font-bold text-white truncate">{adTitle || 'Название компании'}</p>
                          <p className="text-[11px] text-[#4B8DFF]">{adCategory}</p>
                          <p className="text-[10px] text-[#9AA0A8] truncate">{adAddress || 'Адрес на карте'}</p>
                        </div>

                        <button
                          type="submit"
                          className="w-full py-3 bg-[#4B8DFF] hover:bg-[#3C7AE6] text-white text-xs font-semibold rounded-xl shadow-lg transition active:scale-95 flex items-center justify-center gap-2"
                        >
                          <Check className="w-4 h-4 stroke-[3]" />
                          <span>Сохранить и разместить на карте</span>
                        </button>
                      </div>
                    </div>
                  </form>
                )}

                {/* LIST OF AD CAMPAIGNS */}
                <div className="space-y-3">
                  {ads.map((ad) => {
                    const visual = AdService.resolveAdVisualSource(ad);
                    return (
                      <div
                        key={ad.id}
                        className="bg-[#181B1F] p-4 rounded-2xl border border-white/[0.08] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition hover:border-white/20"
                      >
                        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                          {/* Visual Logo Container */}
                          <div 
                            className="w-12 h-12 rounded-2xl bg-[#111315] border border-white/10 flex items-center justify-center text-2xl shrink-0 shadow-sm overflow-hidden p-1"
                            style={{ borderColor: `${ad.bannerColor || '#4B8DFF'}40` }}
                          >
                            {visual.customLogoUrl ? (
                              <img src={visual.customLogoUrl} alt="Logo" className="w-full h-full object-cover rounded-xl" />
                            ) : (
                              <span>{ad.icon}</span>
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-sm font-bold text-white truncate">{ad.title}</h4>
                              <span 
                                className="text-[10px] font-medium px-2 py-0.5 rounded-md border"
                                style={{
                                  backgroundColor: `${ad.bannerColor || '#4B8DFF'}15`,
                                  color: ad.bannerColor || '#4B8DFF',
                                  borderColor: `${ad.bannerColor || '#4B8DFF'}30`,
                                }}
                              >
                                {ad.categoryBadge}
                              </span>
                              {ad.discountText && (
                                <span className="text-[10px] font-bold text-[#34C759] bg-[#34C759]/10 px-2 py-0.5 rounded-md border border-[#34C759]/20">
                                  {ad.discountText}
                                </span>
                              )}
                              {ad.isActive === false && (
                                <span className="text-[10px] font-semibold text-[#FF453A] bg-[#FF453A]/10 px-2 py-0.5 rounded-md border border-[#FF453A]/20">
                                  Приостановлена
                                </span>
                              )}
                            </div>

                            <p className="text-xs text-[#9AA0A8] truncate mt-0.5">{ad.subtitle}</p>

                            <div className="flex items-center gap-3 text-[11px] text-[#9AA0A8] mt-1.5 flex-wrap">
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-[#4B8DFF]" />
                                <span className="truncate max-w-[200px]">{ad.address}</span>
                              </span>
                              {ad.promoCode && (
                                <span className="flex items-center gap-1 font-mono text-[#E5A93C]">
                                  <Tag className="w-3 h-3" />
                                  <span>{ad.promoCode}</span>
                                </span>
                              )}
                              {ad.phone && (
                                <span className="flex items-center gap-1">
                                  <Phone className="w-3 h-3 text-[#34C759]" />
                                  <span>{ad.phone}</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-white/5">
                          <button
                            type="button"
                            onClick={() => handleToggleAdActive(ad.id)}
                            className={`p-2 rounded-xl border text-xs font-medium transition active:scale-95 flex items-center gap-1.5 ${
                              ad.isActive !== false
                                ? 'bg-[#34C759]/15 border-[#34C759]/30 text-[#34C759] hover:bg-[#34C759]/25'
                                : 'bg-white/5 border-white/10 text-[#9AA0A8] hover:text-white'
                            }`}
                            title={ad.isActive !== false ? 'Приостановить показ' : 'Активировать показ'}
                          >
                            {ad.isActive !== false ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                            <span>{ad.isActive !== false ? 'Активна' : 'Скрыта'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteAd(ad.id)}
                            className="p-2 rounded-xl bg-white/5 hover:bg-[#FF453A]/20 text-[#9AA0A8] hover:text-[#FF453A] border border-white/10 hover:border-[#FF453A]/30 transition active:scale-95"
                            title="Удалить кампанию"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* EVENTS TAB */}
        {activeTab === 'events' && (
          <div className="space-y-3">
            <h2 className="text-xs font-medium uppercase tracking-wider text-[#9AA0A8] mb-3">
              Все дорожные инциденты для модерации
            </h2>
            {events.map((ev) => (
              <div
                key={ev.id}
                className="bg-[#181B1F] p-4 rounded-2xl border border-white/[0.06] flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{ev.type === 'crossing' ? '🚧' : ev.type === 'accident' ? '🚗' : ev.type === 'patrol' ? '👮' : '⛽'}</span>
                  <div>
                    <h4 className="text-xs sm:text-sm font-semibold text-white">{ev.title}</h4>
                    <p className="text-[11px] text-[#9AA0A8]">{ev.address || `${ev.latitude}, ${ev.longitude}`}</p>
                    <p className="text-[10px] text-[#4B8DFF] mt-0.5">Статус: {ev.status} · Подтверждений: {ev.confirmationCount}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {ev.status !== 'resolved' && (
                    <button
                      onClick={() => handleModerate(ev.id, 'resolve')}
                      className="px-2.5 py-1.5 bg-[#34C759]/15 text-[#34C759] hover:bg-[#34C759]/25 text-xs rounded-xl font-medium"
                    >
                      Решено
                    </button>
                  )}
                  <button
                    onClick={() => handleModerate(ev.id, 'delete')}
                    className="p-1.5 rounded-xl bg-white/5 text-[#9AA0A8] hover:text-[#FF453A]"
                    title="Удалить"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* USERS TAB */}
        {activeTab === 'users' && (
          <div className="space-y-3">
            <h2 className="text-xs font-medium uppercase tracking-wider text-[#9AA0A8] mb-3">
              Список зарегистрированных водителей
            </h2>
            {users.map((u) => (
              <div
                key={u.id}
                className="bg-[#181B1F] p-4 rounded-2xl border border-white/[0.06] flex items-center justify-between"
              >
                <div>
                  <h4 className="text-xs sm:text-sm font-semibold text-white">{u.fullName} ({u.level})</h4>
                  <p className="text-[11px] text-[#9AA0A8]">Рейтинг: ⭐ {u.rating} · Подтверждений: {u.helpfulConfirmationsCount}</p>
                </div>

                <button
                  onClick={() => handleToggleUserBan(u.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                    u.isBanned
                      ? 'bg-[#34C759]/20 text-[#34C759]'
                      : 'bg-[#FF453A]/20 text-[#FF453A]'
                  }`}
                >
                  {u.isBanned ? 'Разблокировать' : 'Заблокировать'}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* STATIONS TAB */}
        {activeTab === 'stations' && (
          <div className="space-y-4">
            <form onSubmit={handleAddStation} className="bg-[#181B1F] p-4 rounded-2xl border border-white/[0.06] space-y-3">
              <h3 className="text-xs font-semibold text-white">Добавить новую АЗС</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  placeholder="Название (например: Прайм №14)"
                  value={newStationName}
                  onChange={(e) => setNewStationName(e.target.value)}
                  className="bg-[#111315] border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                />
                <input
                  type="text"
                  placeholder="Адрес (ул. Большевистская, 125)"
                  value={newStationAddress}
                  onChange={(e) => setNewStationAddress(e.target.value)}
                  className="bg-[#111315] border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
              <button
                type="submit"
                className="py-2 px-4 bg-[#4B8DFF] text-white text-xs font-medium rounded-xl hover:bg-[#3C7AE6]"
              >
                Сохранить АЗС
              </button>
            </form>

            <div className="space-y-2">
              {stations.map((st) => (
                <div key={st.id} className="bg-[#181B1F] p-3.5 rounded-xl border border-white/[0.06] flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-semibold text-white">{st.name} ({st.brand})</h4>
                    <p className="text-[10px] text-[#9AA0A8]">{st.address}</p>
                  </div>
                  <button
                    onClick={() => handleDeleteStation(st.id)}
                    className="p-1 text-[#9AA0A8] hover:text-[#FF453A]"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
