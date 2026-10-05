import { EventComment, EventConfirmation, EventType, RoadEvent, UserProfile } from '../types';
import { INITIAL_EVENTS } from '../data/seedData';
import { localRealtime, supabase, isSupabaseConfigured } from '../lib/supabase';
import { NotificationService } from './notificationService';
import { TelegramService } from './telegramService';

const STORAGE_KEY = 'roadlive_events_v1';
const ARCHIVE_KEY = 'roadlive_archived_events_v1';
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export class EventService {
  private static events: RoadEvent[] = [];

  /**
   * In Telegram WebApp mode, all client-side event mutations must be tied to
   * the server-verified Telegram session. This is an additional guard on top
   * of the server API checks and prevents forged local UserProfile objects
   * from being accepted by mutation helpers.
   */
  private static assertMutationIdentity(userId: string, adminOnly = false): void {
    if (!TelegramService.isTelegramWebApp()) return;

    const identity = TelegramService.getCachedAuthoritativeIdentity();
    if (!identity) {
      throw new Error('Сессия Telegram недействительна или истекла');
    }
    if (identity.userId !== userId) {
      throw new Error('Действие запрещено: пользователь не совпадает с Telegram-сессией');
    }
    if (adminOnly && !identity.isAdmin) {
      throw new Error('Недостаточно прав администратора');
    }
  }

  static initialize() {
    if (this.events.length > 0) {
      this.archiveOldEvents();
      return;
    }

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.events = JSON.parse(stored);
      } else {
        this.events = [...INITIAL_EVENTS];
        this.persist();
      }
    } catch {
      this.events = [...INITIAL_EVENTS];
    }

    // Refresh aging and perform automatic 24h client & Supabase archiving
    this.refreshEventStatuses();
    this.archiveOldEvents();
  }

  private static persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.events));
    } catch (e) {
      console.warn('Storage quota exceeded', e);
    }
  }

  /**
   * Determine TTL in minutes based on event type
   */
  static getTTLMinutes(type: EventType, subType?: string): number {
    switch (type) {
      case 'crossing':
        return 20; // 20 mins after last confirmation
      case 'accident':
        return subType === 'road_blocked' ? 60 : 45;
      case 'patrol':
        return 25;
      case 'fuel':
        return 25;
      case 'traffic_light':
        return 90;
      case 'road':
        return subType === 'repair' || subType === 'pothole' ? 2880 : 360; // 2 days for holes/repairs
      case 'hazard':
        return 40;
      default:
        return 30;
    }
  }

  /**
   * Calculate distance between two coordinates in meters (Haversine)
   */
  static calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Earth radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return Math.round(R * c);
  }

  /**
   * Check for duplicate reports in proximity
   */
  static findPossibleDuplicate(type: EventType, lat: number, lng: number): RoadEvent | null {
    this.initialize();
    return this.events.find(
      (ev) =>
        ev.status === 'active' &&
        ev.type === type &&
        this.calculateDistanceMeters(ev.latitude, ev.longitude, lat, lng) <= 250
    ) || null;
  }

  /**
   * Get all active and expiring events within bounding box or city
   */
  static getEvents(cityId = 'nsk-city-01', bbox?: [number, number, number, number]): RoadEvent[] {
    this.initialize();
    this.refreshEventStatuses();

    const hideOldEvents = localStorage.getItem('roadlive_hide_old_events') !== 'false';
    const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000;

    return this.events.filter((ev) => {
      if (ev.cityId !== cityId) return false;
      if (ev.status === 'hidden' || ev.status === 'expired' || ev.status === 'resolved') return false;

      // Filter out events older than 4 hours if hideOldEvents (Smart Cleanliness) settings is enabled
      // EXCEPT critical accidents (ДТП) which must stay visible!
      if (hideOldEvents) {
        const isCriticalAccident = ev.type === 'accident';
        if (!isCriticalAccident) {
          const lastActivityTime = ev.updatedAt ? new Date(ev.updatedAt).getTime() : new Date(ev.createdAt).getTime();
          if (lastActivityTime < fourHoursAgo) {
            return false;
          }
        }
      }

      if (bbox) {
        const [south, west, north, east] = bbox;
        if (ev.latitude < south || ev.latitude > north || ev.longitude < west || ev.longitude > east) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Get all events for admin view including expired and hidden
   */
  static getAllEventsForAdmin(): RoadEvent[] {
    this.initialize();
    return [...this.events].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Create a new event with automatic TTL, confidence score, and duplicate check
   */
  static async createEvent(
    data: {
      type: EventType;
      subType?: string;
      title: string;
      description: string;
      latitude: number;
      longitude: number;
      address: string;
      direction?: string;
      cityId?: string;
      districtId?: string;
      imageUrl?: string;
    },
    user: UserProfile,
    authorCoords?: { lat: number; lng: number } | null
  ): Promise<RoadEvent> {
    this.initialize();

    // In the real Telegram app, identity must come from the server-verified
    // Telegram session. Never trust a localStorage profile/userId for authorship.
    const authoritative = await TelegramService.getAuthoritativeIdentity();
    if (TelegramService.isTelegramWebApp()) {
      if (!authoritative) {
        throw new Error('Сессия Telegram недействительна или истекла');
      }
      if (authoritative.userId !== user.id) {
        throw new Error('Пользователь события не совпадает с авторизованным Telegram-пользователем');
      }
    }

    if (!Number.isFinite(data.latitude) || data.latitude < -90 || data.latitude > 90) {
      throw new Error('Некорректная широта');
    }
    if (!Number.isFinite(data.longitude) || data.longitude < -180 || data.longitude > 180) {
      throw new Error('Некорректная долгота');
    }
    const title = data.title.trim().slice(0, 200);
    const description = data.description.trim().slice(0, 2000);
    const address = data.address.trim().slice(0, 255);
    if (!title || !address) throw new Error('Название и адрес обязательны');

    data = {
      ...data,
      title,
      description,
      address,
      subType: data.subType?.trim().slice(0, 100),
      direction: data.direction?.trim().slice(0, 100),
      cityId: data.cityId?.trim().slice(0, 100),
      districtId: data.districtId?.trim().slice(0, 100),
      imageUrl: data.imageUrl?.trim().slice(0, 2048),
    };

    const now = new Date();
    const ttlMins = this.getTTLMinutes(data.type, data.subType);
    const expiresAt = new Date(now.getTime() + ttlMins * 60 * 1000).toISOString();

    let distanceFromAuthor = 0;
    let isWithin1000m = true;
    if (authorCoords) {
      distanceFromAuthor = this.calculateDistanceMeters(
        data.latitude,
        data.longitude,
        authorCoords.lat,
        authorCoords.lng
      );
      isWithin1000m = distanceFromAuthor <= 1000;
    }

    const initialConfidence = isWithin1000m
      ? 0.95
      : Math.max(0.35, +(0.85 - (distanceFromAuthor / 5000) * 0.35).toFixed(2));

    const newEvent: RoadEvent = {
      id: `ev-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      userId: user.id,
      authorName: user.fullName,
      authorLevel: user.level,
      cityId: data.cityId || 'nsk-city-01',
      districtId: data.districtId,
      type: data.type,
      subType: data.subType,
      status: 'active',
      title: data.title,
      description: data.description,
      latitude: data.latitude,
      longitude: data.longitude,
      address: data.address,
      direction: data.direction,
      imageUrl: data.imageUrl,
      confirmationCount: 1,
      disputeCount: 0,
      confidenceScore: initialConfidence,
      isRemoteReport: !isWithin1000m,
      distanceFromAuthorMeters: distanceFromAuthor,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      lastConfirmedAt: now.toISOString(),
      expiresAt,
      comments: [],
      confirmations: [
        {
          id: `cf-init-${Date.now()}`,
          eventId: '',
          userId: user.id,
          userName: user.fullName,
          action: 'confirm',
          isNearby: isWithin1000m,
          distanceMeters: distanceFromAuthor,
          createdAt: now.toISOString(),
        },
      ],
    };

    newEvent.confirmations![0].eventId = newEvent.id;

    this.events.unshift(newEvent);
    this.persist();

    // Broadcast to real-time bus
    localRealtime.broadcast('events_channel', { type: 'INSERT', event: newEvent });

    // Broadcast Web Push for critical events (major accidents, road closures, closed crossings)
    NotificationService.broadcastCriticalEvent(newEvent).catch((err) => {
      console.warn('Could not broadcast push notification:', err);
    });

    return newEvent;
  }

  /**
   * Confirm event ("Я здесь" / "👍 Я тоже это вижу") with distance weighting
   */
  static confirmEvent(
    eventId: string,
    user: UserProfile,
    userLocation?: { lat: number; lng: number }
  ): { success: boolean; event: RoadEvent; isNearby: boolean; distanceMeters?: number } {
    this.initialize();
    this.assertMutationIdentity(user.id);
    const event = this.events.find((e) => e.id === eventId);
    if (!event) throw new Error('Событие не найдено');

    let distanceMeters: number | undefined;
    let isNearby = true;

    if (userLocation) {
      distanceMeters = this.calculateDistanceMeters(
        event.latitude,
        event.longitude,
        userLocation.lat,
        userLocation.lng
      );
      // Nearby threshold: within 1000 meters
      isNearby = distanceMeters <= 1000;
    }

    // Check if user already confirmed
    const existing = event.confirmations?.find((c) => c.userId === user.id);
    if (existing) {
      // Toggle or update
      if (existing.action === 'confirm') {
        return { success: true, event, isNearby, distanceMeters };
      }
      existing.action = 'confirm';
      event.disputeCount = Math.max(0, event.disputeCount - 1);
      event.confirmationCount += 1;
    } else {
      const confirmation: EventConfirmation = {
        id: `cf-${Date.now()}`,
        eventId,
        userId: user.id,
        userName: user.fullName,
        action: 'confirm',
        isNearby,
        distanceMeters,
        createdAt: new Date().toISOString(),
      };
      if (!event.confirmations) event.confirmations = [];
      event.confirmations.push(confirmation);
      event.confirmationCount += 1;
    }

    // Refresh TTL on confirmation
    const now = new Date();
    const ttlMins = this.getTTLMinutes(event.type, event.subType);
    event.lastConfirmedAt = now.toISOString();
    event.expiresAt = new Date(now.getTime() + ttlMins * 60 * 1000).toISOString();
    event.status = 'active';

    // Recalculate confidence
    const ratio = event.confirmationCount / (event.confirmationCount + event.disputeCount);
    event.confidenceScore = Math.min(1.0, Math.round(ratio * 100) / 100);

    this.persist();
    localRealtime.broadcast('events_channel', { type: 'UPDATE', event });

    return { success: true, event, isNearby, distanceMeters };
  }

  /**
   * Dispute event ("👎 Уже не актуально")
   */
  static disputeEvent(eventId: string, user: UserProfile): RoadEvent {
    this.initialize();
    this.assertMutationIdentity(user.id);
    const event = this.events.find((e) => e.id === eventId);
    if (!event) throw new Error('Событие не найдено');

    const existing = event.confirmations?.find((c) => c.userId === user.id);
    if (existing) {
      if (existing.action === 'dispute') return event;
      existing.action = 'dispute';
      event.confirmationCount = Math.max(1, event.confirmationCount - 1);
      event.disputeCount += 1;
    } else {
      if (!event.confirmations) event.confirmations = [];
      event.confirmations.push({
        id: `cf-${Date.now()}`,
        eventId,
        userId: user.id,
        userName: user.fullName,
        action: 'dispute',
        isNearby: false,
        createdAt: new Date().toISOString(),
      });
      event.disputeCount += 1;
    }

    // If disputes exceed confirmations significantly, expire or resolve early
    if (event.disputeCount >= 3 && event.disputeCount > event.confirmationCount) {
      event.status = 'resolved';
    }

    this.persist();
    localRealtime.broadcast('events_channel', { type: 'UPDATE', event });
    return event;
  }

  /**
   * Add a driver comment / update to event
   */
  static addComment(eventId: string, content: string, user: UserProfile): EventComment {
    this.initialize();
    this.assertMutationIdentity(user.id);
    const event = this.events.find((e) => e.id === eventId);
    if (!event) throw new Error('Событие не найдено');

    const comment: EventComment = {
      id: `cm-${Date.now()}`,
      eventId,
      userId: user.id,
      authorName: user.fullName,
      authorLevel: user.level,
      content: content.trim(),
      createdAt: new Date().toISOString(),
    };

    if (!event.comments) event.comments = [];
    event.comments.push(comment);

    // Refresh lastConfirmedAt
    event.lastConfirmedAt = new Date().toISOString();
    this.persist();

    localRealtime.broadcast('events_channel', { type: 'UPDATE', event });
    return comment;
  }

  /**
   * Moderate event (admin actions: hide, resolve, delete, change type)
   */
  static moderateEvent(
    eventId: string,
    action: 'hide' | 'restore' | 'resolve' | 'delete'
  ): boolean {
    this.initialize();
    const identity = TelegramService.getCachedAuthoritativeIdentity();
    if (TelegramService.isTelegramWebApp() && (!identity || !identity.isAdmin)) {
      throw new Error('Недостаточно прав администратора');
    }
    const idx = this.events.findIndex((e) => e.id === eventId);
    if (idx === -1) return false;

    if (action === 'delete') {
      this.events.splice(idx, 1);
    } else if (action === 'hide') {
      this.events[idx].status = 'hidden';
    } else if (action === 'restore') {
      this.events[idx].status = 'active';
    } else if (action === 'resolve') {
      this.events[idx].status = 'resolved';
    }

    this.persist();
    localRealtime.broadcast('events_channel', { type: 'MODERATE', eventId, action });
    return true;
  }

  /**
   * Age verification: active -> expiring -> expired
   */
  static refreshEventStatuses(): number {
    const now = Date.now();
    let updated = 0;

    this.events.forEach((ev) => {
      if (ev.status === 'hidden' || ev.status === 'resolved') return;

      const exp = new Date(ev.expiresAt).getTime();
      if (now >= exp) {
        if (ev.status !== 'expired') {
          ev.status = 'expired';
          updated++;
        }
      } else if (exp - now < 5 * 60 * 1000) {
        // Less than 5 minutes left
        if (ev.status !== 'expiring') {
          ev.status = 'expiring';
          updated++;
        }
      }
    });

    if (updated > 0) {
      this.persist();
    }

    return updated;
  }

  /**
   * Automatic 24-hour archiving mechanism:
   * Prunes active memory and localStorage of events created >24h ago,
   * archives them to separate secondary storage and syncs status with Supabase.
   */
  static archiveOldEvents(): { archivedCount: number; remainingCount: number } {
    const now = Date.now();
    const activeEvents: RoadEvent[] = [];
    const eventsToArchive: RoadEvent[] = [];

    this.events.forEach((ev) => {
      const createdAtMs = new Date(ev.createdAt).getTime();
      const ageMs = now - createdAtMs;

      // Event is older than 24 hours or expired over 12h ago
      if (ageMs > TWENTY_FOUR_HOURS_MS) {
        eventsToArchive.push({ ...ev, status: 'expired' });
      } else {
        activeEvents.push(ev);
      }
    });

    if (eventsToArchive.length > 0) {
      try {
        const storedArchive = localStorage.getItem(ARCHIVE_KEY);
        const existingArchive: RoadEvent[] = storedArchive ? JSON.parse(storedArchive) : [];
        const mergedArchive = [...eventsToArchive, ...existingArchive.filter(
          (a) => !eventsToArchive.some((ta) => ta.id === a.id)
        )];
        // Keep at most 200 items in archive storage to preserve minimal memory footprint
        localStorage.setItem(ARCHIVE_KEY, JSON.stringify(mergedArchive.slice(0, 200)));
      } catch (e) {
        console.warn('Could not update archive storage', e);
      }

      this.events = activeEvents;
      this.persist();

      // Trigger background Supabase synchronization for 24h archiving
      this.syncSupabaseArchiving(eventsToArchive.map((e) => e.id)).catch((err) => {
        console.warn('[Supabase Archiving] Sync notice:', err);
      });
    }

    return {
      archivedCount: eventsToArchive.length,
      remainingCount: this.events.length,
    };
  }

  /**
   * Sync 24-hour expiration/archiving with Supabase remote backend
   */
  static async syncSupabaseArchiving(archivedIds: string[] = []): Promise<void> {
    if (!isSupabaseConfigured || !supabase) return;

    const twentyFourHoursAgo = new Date(Date.now() - TWENTY_FOUR_HOURS_MS).toISOString();

    try {
      // 1. Update remote status of items older than 24h
      await supabase
        .from('events')
        .update({ status: 'expired' })
        .lt('created_at', twentyFourHoursAgo);

      if (archivedIds.length > 0) {
        await supabase
          .from('events')
          .update({ status: 'expired' })
          .in('id', archivedIds);
      }
    } catch (err) {
      console.warn('[Supabase Archiving Error]', err);
    }
  }

  /**
   * Delete an event created by the user
   */
  static deleteEvent(eventId: string, userId: string): boolean {
    this.initialize();
    this.assertMutationIdentity(userId);
    const index = this.events.findIndex((e) => e.id === eventId && e.userId === userId);
    if (index !== -1) {
      this.events.splice(index, 1);
      this.persist();
      localRealtime.broadcast('events_channel', { type: 'DELETE', eventId });
      return true;
    }
    return false;
  }

  /**
   * Respond to an assistance / SOS request ("Еду помочь")
   */
  static respondToAssistance(eventId: string, user: UserProfile): RoadEvent {
    this.initialize();
    this.assertMutationIdentity(user.id);
    const event = this.events.find((e) => e.id === eventId);
    if (!event) throw new Error('Событие не найдено');

    event.helperUserId = user.id;
    event.helperName = user.fullName;

    // Add a comment/message to the stream
    const newComment = {
      id: `cm-${Date.now()}`,
      eventId,
      userId: user.id,
      authorName: user.fullName,
      authorLevel: user.level,
      content: `🤝 Выехал на помощь водителю! Постараюсь быть как можно быстрее.`,
      createdAt: new Date().toISOString(),
    };
    if (!event.comments) event.comments = [];
    event.comments.push(newComment);

    this.persist();
    localRealtime.broadcast('events_channel', { type: 'UPDATE', event });
    return event;
  }

  /**
   * Confirm that an assistance / SOS situation is resolved
   */
  static confirmResolved(eventId: string, userId: string): RoadEvent {
    this.initialize();
    this.assertMutationIdentity(userId);
    const event = this.events.find((e) => e.id === eventId);
    if (!event) throw new Error('Событие не найдено');

    if (event.userId === userId) {
      event.creatorConfirmedResolved = true;
    } else if (event.helperUserId === userId) {
      event.helperConfirmedResolved = true;
    }

    // If both users confirmed, or if the creator resolves it directly, change status to 'resolved'
    // This removes the active SOS from the map to keep other drivers unconfused!
    if (event.creatorConfirmedResolved && event.helperConfirmedResolved) {
      event.status = 'resolved';
    } else if (event.userId === userId) {
      // The person who needed help can close it unilaterally!
      event.status = 'resolved';
    }

    this.persist();
    localRealtime.broadcast('events_channel', { type: 'UPDATE', event });
    return event;
  }

  /**
   * Retrieve archived events (>24h old) for admin or historical logs
   */
  static getArchivedEvents(): RoadEvent[] {
    try {
      const storedArchive = localStorage.getItem(ARCHIVE_KEY);
      return storedArchive ? JSON.parse(storedArchive) : [];
    } catch {
      return [];
    }
  }
}
