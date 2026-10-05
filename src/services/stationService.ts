import { FuelStation, StationObservation, UserProfile } from '../types';
import { INITIAL_STATIONS } from '../data/seedData';
import { localRealtime } from '../lib/supabase';

const STORAGE_KEY = 'roadlive_stations_v1';

export class StationService {
  private static stations: FuelStation[] = [];

  static initialize() {
    if (this.stations.length > 0) return;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.stations = JSON.parse(stored);
      } else {
        this.stations = [...INITIAL_STATIONS];
        this.persist();
      }
    } catch {
      this.stations = [...INITIAL_STATIONS];
    }
  }

  private static persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.stations));
    } catch (e) {
      console.warn('Storage quota exceeded', e);
    }
  }

  static getStations(cityId = 'nsk-city-01'): FuelStation[] {
    this.initialize();
    return this.stations.filter((s) => s.cityId === cityId);
  }

  static reportQueue(
    stationId: string,
    queueStatus: 'none' | 'small' | 'large',
    user: UserProfile,
    note?: string
  ): StationObservation {
    this.initialize();

    const station = this.stations.find((s) => s.id === stationId);
    if (!station) throw new Error('АЗС не найдена');

    const observation: StationObservation = {
      id: `so-${Date.now()}`,
      stationId,
      userId: user.id,
      userName: user.fullName,
      queueStatus,
      note,
      createdAt: new Date().toISOString(),
    };

    station.queueStatus = queueStatus;
    station.lastReportedAt = new Date().toISOString();
    station.observationsCount = (station.observationsCount || 0) + 1;

    this.persist();
    localRealtime.broadcast('stations_channel', { type: 'UPDATE', station });

    return observation;
  }

  static addStation(
    data: Omit<FuelStation, 'id' | 'lastReportedAt' | 'observationsCount'>
  ): FuelStation {
    this.initialize();

    const newStation: FuelStation = {
      ...data,
      id: `st-${Date.now()}`,
      lastReportedAt: new Date().toISOString(),
      observationsCount: 1,
    };

    this.stations.push(newStation);
    this.persist();

    localRealtime.broadcast('stations_channel', { type: 'INSERT', station: newStation });
    return newStation;
  }

  static deleteStation(id: string): boolean {
    this.initialize();
    const idx = this.stations.findIndex((s) => s.id === id);
    if (idx !== -1) {
      this.stations.splice(idx, 1);
      this.persist();
      localRealtime.broadcast('stations_channel', { type: 'DELETE', stationId: id });
      return true;
    }
    return false;
  }
}
