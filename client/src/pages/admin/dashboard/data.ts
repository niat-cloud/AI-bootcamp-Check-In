import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type EventInfo } from '../../../lib/api';

export interface Breakdown {
  rows: { label: string; registered: number; arrived: number }[];
  /** Groups beyond the top rows, as one total. */
  others: { count: number; registered: number; arrived: number };
  /** People with no value (no area given, no school). */
  missing: { registered: number; arrived: number };
}

export interface SeatedPerson {
  id: number;
  name: string;
  schoolCollege: string;
  teamNumber: number | null;
  seatLabel: string | null;
  roomName: string | null;
  checkInTime: string | null;
}

export interface SourceRow {
  /** What the participants list and export take as their `source` filter. */
  key: string;
  source: string;
  kind: 'source' | 'walk_in' | 'none';
  registered: number;
  arrived: number;
}

export interface Room {
  id: number;
  name: string;
  capacity: number;
  priority: number;
  isActive: boolean;
  used: number;
}

export interface Team {
  id: number;
  teamNumber: number;
  capacity: number;
  roomId: number;
  assigned: number;
  seats: { label: string; student: string | null }[];
}

export interface DashboardData {
  event: EventInfo;
  generatedAt: string;
  stats: {
    expected: number;
    /** Imported before the event. */
    registered: number;
    walkIns: number;
    total: number;
    /** Reached the venue: seated or waiting for a seat. */
    arrived: number;
    seated: number;
    waiting: number;
    notArrived: number;
    arrivedLast15Min: number;
    lastArrivalAt: string | null;
    withoutSource: number;
    /** Seats in open rooms. */
    capacity: number;
    seatsLeft: number;
  };
  rooms: Room[];
  teams: Team[];
  recentActivity: SeatedPerson[];
  firstCheckIns: SeatedPerson[];
  waiting: { id: number; name: string; schoolCollege: string; registrationType: 'existing' | 'walk_in'; arrivedAt: string | null }[];
  arrivals: { bucketMinutes: number; buckets: { start: string; count: number }[] };
  sources: SourceRow[];
  areas: Breakdown;
  schools: Breakdown;
}

/**
 * The event dashboard, refreshed every 5 seconds while the event is live. A failed refresh keeps the
 * last data on screen and reports the error, so a brief network drop never blanks the dashboard.
 */
export function useDashboard(eventId: number | undefined, live: boolean) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const latest = useRef(0);

  const refresh = useCallback(async () => {
    if (!eventId) return;
    const ticket = ++latest.current;
    try {
      const d = await api<DashboardData>(`/events/${eventId}/dashboard`);
      if (ticket !== latest.current) return; // a newer request (or another event) has taken over
      setData(d);
      setError(null);
      setLoadedAt(Date.now());
    } catch (err) {
      if (ticket === latest.current) setError((err as Error).message);
    }
  }, [eventId]);

  // Never show one event's numbers under another event's name.
  useEffect(() => {
    setData(null);
    setError(null);
    setLoadedAt(null);
  }, [eventId]);

  useEffect(() => {
    refresh();
    if (!live) return;
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [refresh, live]);

  return { data, error, loadedAt, refresh };
}

/** The current time, updated every `intervalMs`, for "3 min ago" style labels. */
export function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;

/** "10:05 AM" */
export const clock = (at: string | number) =>
  new Date(at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase();

/** "under a minute", "12 min", "1 h 5 min" */
export function duration(minutes: number) {
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return `${Math.floor(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

export const minutesSince = (at: string, now: number) => Math.max(0, (now - Date.parse(at)) / 60_000);

/** "just now", "3 min ago" */
export function ago(at: string | null, now: number) {
  if (!at) return '';
  const minutes = minutesSince(at, now);
  return minutes < 1 ? 'just now' : `${duration(minutes)} ago`;
}
