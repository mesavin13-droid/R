import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  !supabaseUrl.includes('placeholder') && 
  supabaseUrl.startsWith('http')
);

// Fallback client: if credentials are not provided, we initialize a dummy client or null
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Local Realtime Event Bus for offline / demo mode
type RealtimeCallback = (payload: any) => void;
class LocalRealtimeBus {
  private listeners: Map<string, Set<RealtimeCallback>> = new Map();

  subscribe(channel: string, callback: RealtimeCallback) {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, new Set());
    }
    this.listeners.get(channel)!.add(callback);
    return () => {
      this.listeners.get(channel)?.delete(callback);
    };
  }

  broadcast(channel: string, payload: any) {
    if (this.listeners.has(channel)) {
      this.listeners.get(channel)!.forEach((cb) => {
        try {
          cb(payload);
        } catch (e) {
          console.error('Error in realtime listener', e);
        }
      });
    }
  }
}

export const localRealtime = new LocalRealtimeBus();
