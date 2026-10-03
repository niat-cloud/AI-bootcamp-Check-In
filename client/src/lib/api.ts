export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const ADMIN_TOKEN_KEY = 'admin_token';
const ADMIN_USER_KEY = 'admin_user';

export function getAdminToken(): string | null {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAdminAuth(token: string, email: string) {
  try {
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
    localStorage.setItem(ADMIN_USER_KEY, JSON.stringify({ email }));
  } catch {
    /* storage unavailable */
  }
}

export function clearAdminAuth() {
  try {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_USER_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function getStoredAdminUser(): { email: string } | null {
  try {
    const raw = localStorage.getItem(ADMIN_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function loginAdmin(email: string, password: string): Promise<{ token: string; email: string }> {
  const data = await api<{ token: string; email: string }>('/admin/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  setAdminAuth(data.token, data.email);
  return data;
}

export async function logoutAdmin(): Promise<void> {
  try {
    await api('/admin/auth/logout', { method: 'POST' }).catch(() => {});
  } finally {
    clearAdminAuth();
  }
}

export async function checkAdminAuth(): Promise<{ authenticated: boolean; email?: string }> {
  const token = getAdminToken();
  if (!token) return { authenticated: false };
  try {
    const res = await api<{ authenticated: boolean; email: string }>('/admin/auth/me');
    return res;
  } catch {
    clearAdminAuth();
    return { authenticated: false };
  }
}

export async function api<T = any>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal; headers?: Record<string, string> } = {},
): Promise<T> {
  let res: Response;
  const token = getAdminToken();

  const reqHeaders: Record<string, string> = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  try {
    res = await fetch(`/api${path}`, {
      method: options.method ?? (options.body ? 'POST' : 'GET'),
      headers: reqHeaders,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check the internet connection.');
  }

  const data = await res.json().catch(() => null);

  if (res.status === 401 && path.startsWith('/events')) {
    // Session expired for admin call
    clearAdminAuth();
    window.dispatchEvent(new CustomEvent('admin_unauthorized'));
  }

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
  participant: {
    name: string;
    schoolCollege: string;
    className: string | null;
    location?: string | null;
    phone: string;
    registrationType: string;
  };
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
  location?: string | null;
  phone: string;
  registrationType: string;
  seatCode: string | null;
}

export const formatDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

export const formatTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase() : '';
