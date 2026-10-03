export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export async function api<T = any>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: options.method ?? (options.body ? 'POST' : 'GET'),
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check the internet connection.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok && !data) {
    throw new ApiError(res.status, 'NETWORK', 'The server is not responding. Please wait a moment and try again.');
  }
  if (!res.ok) throw new ApiError(res.status, data.code ?? 'ERROR', data.message ?? `Request failed (${res.status})`);
  return data as T;
}

export interface EventInfo {
  id: number;
  name: string;
  date: string;
  time: string;
  status: 'draft' | 'active' | 'completed';
  expectedStudents: number;
  teamSize: number;
  seatLabels: string[];
  teamNamePrefix: string;
  activePoolSize: number;
  poolFillThreshold: number;
  participantCount?: number;
  checkedInCount?: number;
}

export interface Room {
  id: number;
  name: string;
  capacity: number;
  priority: number;
  used: number;
  teamCount: number;
  plannedTeams: number;
  firstTeam: number | null;
  lastTeam: number | null;
  partialTeamSeats: number;
}

export interface SeatAssignment {
  eventParticipantId: number;
  alreadyAssigned: boolean;
  participant: { name: string; schoolCollege: string; className: string | null; phone: string; registrationType: string };
  room: string | null;
  teamNumber: number | null;
  teamName: string | null;
  seatLabel: string | null;
  seatCode: string | null;
  members: { label: string; name: string | null; isSelf: boolean }[];
}

export interface SearchResult {
  eventParticipantId: number;
  name: string;
  schoolCollege: string;
  className: string | null;
  phone: string;
  registrationType: string;
  seatCode: string | null;
}

export const formatDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

export const formatTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase() : '';
