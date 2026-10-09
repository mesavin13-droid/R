import { FuelStation, StationObservation, UserProfile } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

interface StationRow {
  id: string;
  city_id: string;
  name: string;
  brand: string;
  latitude: number;
  longitude: number;
  address: string;
  fuel_types: FuelStation['fuelTypes'];
  queue_status: 'none' | 'small' | 'large' | null;
  last_reported_at: string | null;
  is_active: boolean;
}

export interface StationInput {
  cityId: string;
  name: string;
  brand: string;
  latitude: number;
  longitude: number;
  address: string;
  fuelTypes: FuelStation['fuelTypes'];
  queueStatus?: 'none' | 'small' | 'large';
}

async function adminRequest<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new Error('Сервер вернул некорректный ответ');
  }
  if (!response.ok) throw new Error(payload?.error || 'Ошибка сервера');
  return payload as T;
}

export class StationService {
  private static stations: FuelStation[] = [];
  private static cityIdBySlug = new Map<string, string>();
  private static loaded = false;
  private static loading: Promise<void> | null = null;

  /** Public reference data, so it is read straight from PostgREST with the anon key. */
  static async initialize(): Promise<void> {
    if (this.loaded) return;
    if (this.loading) return this.loading;

    this.loading = (async () => {
      if (!isSupabaseConfigured || !supabase) {
        this.loaded = true;
        return;
      }

      const [citiesRes, stationsRes] = await Promise.all([
        supabase.from('cities').select('id, slug'),
        supabase.from('stations').select('*').eq('is_active', true),
      ]);

      if (citiesRes.error) throw new Error('Не удалось загрузить города');
      if (stationsRes.error) throw new Error('Не удалось загрузить АЗС');

      this.cityIdBySlug = new Map(
        (citiesRes.data || []).map((city: any) => [city.slug as string, city.id as string]),
      );
      this.stations = ((stationsRes.data || []) as unknown as StationRow[]).map((row) => ({
        id: row.id,
        cityId: this.slugForCityId(row.city_id),
        name: row.name,
        brand: row.brand,
        latitude: row.latitude,
        longitude: row.longitude,
        address: row.address,
        fuelTypes: row.fuel_types || {},
        queueStatus: (row.queue_status || 'none') as FuelStation['queueStatus'],
        lastReportedAt: row.last_reported_at || new Date(0).toISOString(),
      }));
      this.loaded = true;
    })();

    try {
      await this.loading;
    } finally {
      this.loading = null;
    }
  }

  private static slugForCityId(cityId: string): string {
    for (const [slug, id] of this.cityIdBySlug) {
      if (id === cityId) return slug;
    }
    return cityId;
  }

  static getStations(cityId = 'nsk-city-01'): FuelStation[] {
    return this.stations.filter((station) => station.cityId === cityId);
  }

  static async reportQueue(
    stationId: string,
    queueStatus: 'none' | 'small' | 'large',
    user: UserProfile,
    note?: string
  ): Promise<StationObservation> {
    // Reports update the shared station state so every driver sees the same queue,
    // which is why this can no longer be a local-only mutation.
    await this.initialize();
    if (!this.stations.some((station) => station.id === stationId)) {
      throw new Error('АЗС не найдена');
    }

    const station = await adminRequest<{ station: StationRow }>(
      `/api/stations/${stationId}/queue`,
      { method: 'POST', body: JSON.stringify({ queueStatus }) },
    );
    this.applyRow(station.station);

    return {
      id: `so-${Date.now()}`,
      stationId,
      userId: user.id,
      userName: user.fullName,
      queueStatus,
      note,
      createdAt: new Date().toISOString(),
    };
  }

  private static stationPayload(stationId: string) {
    const station = this.stations.find((item) => item.id === stationId);
    if (!station) throw new Error('АЗС не найдена');
    return {
      cityId: this.cityIdBySlug.get(station.cityId) || station.cityId,
      name: station.name,
      brand: station.brand,
      latitude: station.latitude,
      longitude: station.longitude,
      address: station.address,
      fuelTypes: station.fuelTypes,
    };
  }

  private static applyRow(row: StationRow) {
    const next: FuelStation = {
      id: row.id,
      cityId: this.slugForCityId(row.city_id),
      name: row.name,
      brand: row.brand,
      latitude: row.latitude,
      longitude: row.longitude,
      address: row.address,
      fuelTypes: row.fuel_types || {},
      queueStatus: (row.queue_status || 'none') as FuelStation['queueStatus'],
      lastReportedAt: row.last_reported_at || new Date(0).toISOString(),
    };
    const index = this.stations.findIndex((item) => item.id === row.id);
    if (index === -1) this.stations.push(next);
    else this.stations[index] = next;
  }

  static async addStation(data: StationInput): Promise<FuelStation> {
    await this.initialize();
    const payload = { ...data, cityId: this.cityIdBySlug.get(data.cityId) || data.cityId };
    const result = await adminRequest<{ station: StationRow }>('/api/admin/stations', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    this.applyRow(result.station);
    return this.stations.find((item) => item.id === result.station.id)!;
  }

  static async updateStation(id: string, data: StationInput): Promise<FuelStation> {
    await this.initialize();
    const payload = { ...data, cityId: this.cityIdBySlug.get(data.cityId) || data.cityId };
    const result = await adminRequest<{ station: StationRow }>(`/api/admin/stations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    this.applyRow(result.station);
    return this.stations.find((item) => item.id === result.station.id)!;
  }

  /** Deactivates the station on the server; it disappears from the map for everyone. */
  static async deleteStation(id: string): Promise<boolean> {
    await this.initialize();
    await adminRequest<{ station: StationRow }>(`/api/admin/stations/${id}`, { method: 'DELETE' });
    this.stations = this.stations.filter((item) => item.id !== id);
    return true;
  }
}