export type EventType = 
  | 'crossing'       // 🚧 Переезд
  | 'accident'       // 🚗 ДТП
  | 'patrol'         // 👮 Дорожный контроль
  | 'fuel'           // ⛽ АЗС
  | 'road'           // 🛣️ Дорога (ремонт, яма, гололед)
  | 'traffic_light'  // 🚦 Светофор
  | 'hazard'         // 🚚 Препятствие
  | 'assistance'     // 🆘 Помощь на дороге (взаимовыручка)
  | 'other';         // ❓ Другое

export type EventStatus = 'active' | 'expiring' | 'expired' | 'resolved' | 'hidden';

export type UserLevel = 'Новичок' | 'Водитель' | 'Активный водитель' | 'Наблюдатель' | 'Эксперт района';

export type UserRole = 'driver' | 'moderator' | 'admin' | 'owner';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
  role: UserRole;
  level: UserLevel;
  rating: number; // e.g. 4.9
  helpfulConfirmationsCount: number;
  eventsCount: number;
  questionsCount: number;
  answersCount: number;
  reportsCount: number;
  isBanned: boolean;
  createdAt: string;
}

export interface City {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  defaultZoom: number;
  isActive: boolean;
}

export interface District {
  id: string;
  cityId: string;
  name: string;
  slug: string;
  centerLat: number;
  centerLng: number;
}

export interface EventConfirmation {
  id: string;
  eventId: string;
  userId: string;
  userName: string;
  action: 'confirm' | 'dispute';
  isNearby: boolean;
  distanceMeters?: number;
  createdAt: string;
}

export interface EventComment {
  id: string;
  eventId: string;
  userId: string;
  authorName: string;
  authorLevel?: string;
  content: string;
  createdAt: string;
}

export interface RoadEvent {
  id: string;
  userId: string;
  authorName: string;
  authorLevel?: UserLevel;
  cityId: string;
  districtId?: string;
  districtName?: string;
  type: EventType;
  subType?: string; // e.g. 'closed', 'open', 'major', 'minor', 'pothole', 'ice'
  status: EventStatus;
  title: string;
  description: string;
  latitude: number;
  longitude: number;
  address: string;
  direction?: string; // e.g. "в сторону центра", "из Академгородка"
  imageUrl?: string;
  confirmationCount: number;
  disputeCount: number;
  confidenceScore: number; // 0.0 - 1.0
  isRemoteReport?: boolean; // If placed >1000m away from author's GPS
  distanceFromAuthorMeters?: number; // Distance from author when reported
  createdAt: string;
  updatedAt: string;
  lastConfirmedAt: string;
  expiresAt: string;
  comments?: EventComment[];
  confirmations?: EventConfirmation[];
  helperUserId?: string;
  helperName?: string;
  creatorConfirmedResolved?: boolean;
  helperConfirmedResolved?: boolean;
}

export interface QuestionAnswer {
  id: string;
  questionId: string;
  userId: string;
  authorName: string;
  authorLevel?: UserLevel;
  content: string;
  helpfulCount: number;
  isVerified?: boolean;
  createdAt: string;
}

export interface DriverQuestion {
  id: string;
  userId: string;
  authorName: string;
  cityId: string;
  districtId?: string;
  category: string;
  question: string;
  latitude: number;
  longitude: number;
  address: string;
  answersCount: number;
  status: 'open' | 'closed';
  createdAt: string;
  answers?: QuestionAnswer[];
}

export interface FuelStation {
  id: string;
  cityId: string;
  name: string;
  brand: string;
  latitude: number;
  longitude: number;
  address: string;
  fuelTypes: {
    ai92?: number;
    ai95?: number;
    ai98?: number;
    ai100?: number;
    dt?: number;
    lpg?: number;
  };
  queueStatus: 'none' | 'small' | 'large';
  lastReportedAt: string;
  observationsCount?: number;
}

export interface StationObservation {
  id: string;
  stationId: string;
  userId: string;
  userName: string;
  queueStatus: 'none' | 'small' | 'large';
  note?: string;
  createdAt: string;
}

export interface RouteRisk {
  id: string;
  eventId?: string;
  type: EventType;
  title: string;
  address: string;
  distanceFromStartKm: number;
  estimatedDelayMinutes: number;
  severity: 'low' | 'medium' | 'high';
}

export interface RoutePlan {
  fromAddress: string;
  toAddress: string;
  fromCoords: [number, number];
  toCoords: [number, number];
  distanceKm: number;
  durationMinutes: number;
  coordinates: [number, number][];
  risks: RouteRisk[];
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'alert' | 'answer' | 'confirmation' | 'system';
  eventId?: string;
  read: boolean;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  channelId: string;
  userId: string;
  userName: string;
  userLevel: UserLevel;
  userRating: number;
  content: string;
  locationName?: string;
  latitude?: number;
  longitude?: number;
  reactions: { [emoji: string]: number };
  createdAt: string;
}

export interface ChatChannel {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export interface CustomAdIcon {
  id: string;
  name: string;
  category?: string;
  svgContent: string;
  createdAt: string;
}

export interface SponsoredBanner {
  id: string;
  title: string;
  subtitle: string;
  categoryBadge: string;
  icon: string;
  customIconId?: string;
  customLogoUrl?: string;
  bannerColor?: string;
  address: string;
  latitude: number;
  longitude: number;
  phone?: string;
  promoCode?: string;
  discountText?: string;
  actionText: string;
  details: string;
  isActive?: boolean;
  impressions?: number;
  clicks?: number;
  priority?: number;
  startsAt?: string;
  endsAt?: string;
}

