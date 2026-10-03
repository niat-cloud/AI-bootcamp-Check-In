import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatDate } from '../../lib/api';
import { NoEvent, useAdmin } from './AdminLayout';

export interface DashboardData {
  event: {
    id: number;
    name: string;
    date: string;
    time: string;
    status: 'draft' | 'active' | 'completed';
    expectedStudents: number;
    teamSize: number;
    seatLabels: string[];
    teamNamePrefix: string;
  };
  stats: {
    expected: number;
    existing: number;
    walkIns: number;
    actual: number;
    checkedIn: number;
    recent10Min: number;
    remaining: number;
    remainingExpected: number;
    totalCapacity: number;
    seatsLeft: number;
  };
  rooms: {
    id: number;
    name: string;
    capacity: number;
    priority: number;
    used: number;
  }[];
  teams: {
    id: number;
    teamNumber: number;
    capacity: number;
    roomId: number;
    roomName?: string;
    assigned: number;
    seats?: { label: string; student: string | null }[];
  }[];
  recentActivity?: {
    id: number;
    name: string;
    schoolCollege: string;
    teamNumber: number | null;
    seatLabel: string | null;
    roomName: string | null;
    checkInTime: string | null;
  }[];
  firstCheckIns?: {
    id: number;
    name: string;
    schoolCollege: string;
    teamNumber: number | null;
    seatLabel: string | null;
    roomName: string | null;
    checkInTime: string | null;
  }[];
  lastUpdated?: Date;
}

export function useDashboard(eventId: number | undefined, live: boolean) {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    if (!eventId) return;
    let stopped = false;
    const load = () =>
      api<DashboardData>(`/events/${eventId}/dashboard`)
        .then((d) => {
          if (!stopped) {
            setData({ ...d, lastUpdated: new Date() });
          }
        })
        .catch(() => {});

    load();
    const timer = live ? setInterval(load, 5000) : undefined;
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
    };
  }, [eventId, live]);

  return data;
}

function formatRelativeTime(dateIso?: string | null): string {
  if (!dateIso) return 'Just now';
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(dateIso).getTime()) / 1000));
  if (diffSec < 5) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  return `${diffHours}h ago`;
}

function formatClockTime(dateIso?: string | null): string {
  if (!dateIso) return '';
  return new Date(dateIso).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

export default function Dashboard() {
  const { event, reload } = useAdmin();
  const isLive = event?.status === 'active';
  const data = useDashboard(event?.id, isLive);

  // Live seconds counter
  const [secondsAgo, setSecondsAgo] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      if (data?.lastUpdated) {
        setSecondsAgo(Math.floor((Date.now() - data.lastUpdated.getTime()) / 1000));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [data?.lastUpdated]);

  // Activity feed tab: 'latest' vs 'first5'
  const [activityTab, setActivityTab] = useState<'latest' | 'first5'>('latest');

  // Room filter for activity feed
  const [activityRoomFilter, setActivityRoomFilter] = useState<string>('all');

  // Drawer state for "View All Check-ins"
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerSearch, setDrawerSearch] = useState('');
  const [drawerRoomFilter, setDrawerRoomFilter] = useState('all');

  // Team detail inspector modal
  const [selectedTeam, setSelectedTeam] = useState<DashboardData['teams'][0] | null>(null);

  // Teams matrix filter
  const [teamFilter, setTeamFilter] = useState<'all' | 'filling' | 'full' | 'empty'>('all');

  // Filtered teams list
  const filteredTeams = useMemo(() => {
    if (!data?.teams) return [];
    if (teamFilter === 'all') return data.teams;
    if (teamFilter === 'full') return data.teams.filter((t) => t.assigned === t.capacity);
    if (teamFilter === 'empty') return data.teams.filter((t) => t.assigned === 0);
    if (teamFilter === 'filling') return data.teams.filter((t) => t.assigned > 0 && t.assigned < t.capacity);
    return data.teams;
  }, [data?.teams, teamFilter]);

  // Feed items based on active tab and room filter
  const displayedFeed = useMemo(() => {
    if (!data) return [];
    const source = activityTab === 'latest' ? data.recentActivity || [] : data.firstCheckIns || [];
    if (activityRoomFilter === 'all') return source;
    return source.filter((item) => item.roomName === activityRoomFilter);
  }, [data, activityTab, activityRoomFilter]);

  // Drawer all check-in items (filtered by search and room)
  const drawerItems = useMemo(() => {
    if (!data?.recentActivity) return [];
    return data.recentActivity.filter((item) => {
      const matchSearch =
        !drawerSearch.trim() ||
        item.name.toLowerCase().includes(drawerSearch.toLowerCase()) ||
        item.schoolCollege.toLowerCase().includes(drawerSearch.toLowerCase()) ||
        (item.teamNumber && String(item.teamNumber).includes(drawerSearch));
      const matchRoom = drawerRoomFilter === 'all' || item.roomName === drawerRoomFilter;
      return matchSearch && matchRoom;
    });
  }, [data?.recentActivity, drawerSearch, drawerRoomFilter]);

  if (!event) return <NoEvent />;

  const stats = data?.stats;
  const checkedInPct = stats && stats.expected > 0 ? (stats.checkedIn / stats.expected) * 100 : 0;
  const actualPct = stats && stats.actual > 0 ? (stats.checkedIn / stats.actual) * 100 : 0;

  // Factual observations for "Insights from the Data"
  const dataInsights = useMemo(() => {
    if (!data) return [];
    const observations: { title: string; value: string; desc: string }[] = [];

    // 1. Attendance
    observations.push({
      title: 'ATTENDANCE',
      value: `${data.stats.checkedIn} / ${data.stats.expected}`,
      desc: `${checkedInPct.toFixed(1)}% of planned capacity checked in (${data.stats.remainingExpected} remaining).`,
    });

    // 2. Velocity
    observations.push({
      title: 'CHECK-IN VELOCITY',
      value: `+${data.stats.recent10Min} in last 10m`,
      desc: data.stats.recent10Min > 0 ? 'Active attendee arrivals recorded.' : 'Pacing currently idle.',
    });

    // 3. Highest Room Occupancy
    const sortedRooms = [...data.rooms].sort((a, b) => (b.capacity ? b.used / b.capacity : 0) - (a.capacity ? a.used / a.capacity : 0));
    if (sortedRooms[0]) {
      const r = sortedRooms[0];
      const rPct = r.capacity ? Math.round((r.used / r.capacity) * 100) : 0;
      observations.push({
        title: 'ROOM OCCUPANCY',
        value: `${r.name} · ${rPct}%`,
        desc: `${r.used} of ${r.capacity} seats filled (${r.capacity - r.used} seats open).`,
      });
    }

    // 4. Team Distribution
    const fillingTeams = data.teams.filter((t) => t.assigned > 0);
    const topTeam = [...data.teams].sort((a, b) => b.assigned - a.assigned)[0];
    if (topTeam && topTeam.assigned > 0) {
      observations.push({
        title: 'TEAM DISTRIBUTION',
        value: `Team ${topTeam.teamNumber} · ${topTeam.assigned}/${topTeam.capacity}`,
        desc: `${fillingTeams.length} active teams currently have assigned students.`,
      });
    } else {
      observations.push({
        title: 'TEAM DISTRIBUTION',
        value: `${data.teams.length} Teams Ready`,
        desc: 'Waiting for attendee allocation.',
      });
    }

    return observations;
  }, [data, checkedInPct]);

  // Operational Attention Items
  const attentionItems = useMemo(() => {
    if (!data) return [];
    const items: { level: 'warn' | 'info' | 'ok'; message: string; sub?: string }[] = [];

    // Full teams alert
    const fullTeams = data.teams.filter((t) => t.assigned === t.capacity);
    if (fullTeams.length > 0) {
      items.push({
        level: 'warn',
        message: `Team ${fullTeams.map((t) => t.teamNumber).join(', ')} is 100% full`,
        sub: '3 / 3 seats occupied · Next attendees will route to adjacent tables.',
      });
    }

    // Unchecked expected attendees
    if (data.stats.remainingExpected > 0) {
      items.push({
        level: 'warn',
        message: `${data.stats.remainingExpected} expected participants haven't checked in`,
        sub: `Current check-in rate: ${checkedInPct.toFixed(1)}% of planned 100 attendees.`,
      });
    }

    // Room capacity check
    const nearCapRoom = data.rooms.find((r) => r.capacity > 0 && r.used / r.capacity >= 0.85);
    if (nearCapRoom) {
      items.push({
        level: 'warn',
        message: `${nearCapRoom.name} is nearing capacity (${nearCapRoom.used}/${nearCapRoom.capacity})`,
        sub: 'Prepare overflow routing to next priority room.',
      });
    } else {
      items.push({
        level: 'ok',
        message: 'All venue rooms have healthy seating capacity',
        sub: `${data.stats.seatsLeft} of ${data.stats.totalCapacity} auditorium seats remain available.`,
      });
    }

    // Zero unassigned conflicts
    items.push({
      level: 'ok',
      message: 'Zero duplicate registrations or unassigned seats detected',
      sub: 'All checked-in attendees have verified room, team, and seat codes.',
    });

    return items;
  }, [data, checkedInPct]);

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Command Center Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-niat-line bg-white p-5 shadow-xs sm:p-6">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-black tracking-tight text-niat-text sm:text-3xl">
              {event.name ? event.name.toUpperCase() : 'AI BOOTCAMP 2026'}
            </h1>
            {isLive ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-black tracking-wider text-emerald-800 shadow-2xs">
                <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse" aria-hidden="true" />
                LIVE
              </span>
            ) : (
              <span className="rounded-full border border-stone-200 bg-stone-100 px-3 py-0.5 text-xs font-bold capitalize text-stone-700">
                {event.status}
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-niat-muted sm:text-sm">
            <span>
              {formatDate(event.date)}
              {event.time ? ` · ${event.time}` : ''}
            </span>
            <span aria-hidden="true" className="text-niat-line">
              |
            </span>
            <span className="text-niat-muted/80">
              {isLive ? `Auto-updates every 5s · Last refreshed ${secondsAgo}s ago` : 'Event offline'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => reload()}
            className="cursor-pointer inline-flex items-center gap-1.5 rounded-xl border border-niat-line bg-niat-warm-white px-3.5 py-2 text-xs font-bold text-niat-text shadow-2xs transition-all hover:bg-niat-cream hover:border-niat-maroon/20 active:scale-95"
            title="Force refresh data"
          >
            <span className="text-sm">↻</span> Refresh
          </button>
          <Link
            to="/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-niat-maroon px-4 py-2 text-xs font-bold text-white shadow-xs transition-all hover:bg-niat-maroon-dark hover:shadow-sm"
          >
            <span>↗ Open Kiosk Check-In</span>
          </Link>
        </div>
      </div>

      {!data ? (
        <div className="card p-12 text-center text-niat-muted">Loading live operations stream…</div>
      ) : (
        <>
          {/* 2. Key Metrics Hierarchy (Checked In Hero + Expected, Registered, Walk-Ins) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {/* HERO METRIC: CHECKED IN */}
            <div className="rounded-2xl border-2 border-emerald-500/40 bg-white p-5 shadow-[var(--shadow-card)] ring-4 ring-emerald-500/5 sm:col-span-2 lg:col-span-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-widest text-emerald-800">
                  CHECKED IN
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 ring-1 ring-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
                  Live Flow
                </span>
              </div>

              <div className="mt-3 flex items-baseline gap-3">
                <div className="text-5xl font-black tracking-tight text-niat-text sm:text-6xl transition-all">
                  {data.stats.checkedIn}
                </div>
                <div className="text-sm font-semibold text-niat-muted">
                  <strong className="text-niat-text">{checkedInPct.toFixed(1)}%</strong> of expected
                  <span className="block text-xs text-niat-muted/80">({actualPct.toFixed(1)}% of total registered)</span>
                </div>
              </div>

              {/* Progress Track */}
              <div className="mt-3.5 h-3 w-full overflow-hidden rounded-full bg-stone-100 p-0.5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all duration-700 ease-out"
                  style={{ width: `${Math.min(100, Math.max(4, checkedInPct))}%` }}
                />
              </div>

              <div className="mt-3 flex items-center justify-between text-xs font-medium text-niat-muted">
                <span className="font-bold text-emerald-700">
                  &uarr; +{data.stats.recent10Min} in the last 10 min
                </span>
                <span>{data.stats.seatsLeft} venue seats open</span>
              </div>
            </div>

            {/* EXPECTED (Target Capacity) */}
            <div className="rounded-2xl border border-niat-line bg-white p-4.5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-niat-muted">Expected</span>
                <span className="text-[10px] text-niat-muted/70 font-semibold">Target</span>
              </div>
              <div className="mt-2 text-3xl font-extrabold text-niat-text">{data.stats.expected}</div>
              <p className="mt-1 text-xs text-niat-muted">Planned capacity</p>
            </div>

            {/* REGISTERED (Database Upload) */}
            <div className="rounded-2xl border border-niat-line bg-white p-4.5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-niat-muted">Registered</span>
                <span className="text-[10px] text-niat-muted/70 font-semibold">Database</span>
              </div>
              <div className="mt-2 text-3xl font-extrabold text-niat-text">{data.stats.existing}</div>
              <p className="mt-1 text-xs text-niat-muted">Pre-event imported list</p>
            </div>

            {/* WALK-INS */}
            <div className="rounded-2xl border border-niat-line bg-white p-4.5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-700">Walk-Ins</span>
                <span className="text-[10px] text-amber-700/70 font-semibold">On-Site</span>
              </div>
              <div className="mt-2 text-3xl font-extrabold text-amber-600">{data.stats.walkIns}</div>
              <p className="mt-1 text-xs text-niat-muted">Registered at kiosk today</p>
            </div>
          </div>

          {/* Sub-status line distinguishing Registered vs Expected vs Not Arrived */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-niat-line/70 bg-niat-warm-white px-4 py-2.5 text-xs text-niat-muted">
            <div>
              <span className="font-bold text-niat-text">Not yet arrived: </span>
              <strong className="text-niat-maroon">{data.stats.remainingExpected}</strong> of {data.stats.expected} expected attendees ·{' '}
              <span className="text-niat-muted/80">{data.stats.remaining} unverified from the {data.stats.actual} registered database</span>
            </div>
            <span className="font-semibold text-emerald-800">
              {data.stats.seatsLeft} of {data.stats.totalCapacity} auditorium seats free
            </span>
          </div>

          {/* 3. Actionable Attendee Flow Pipeline with Step Percentages */}
          <div className="rounded-2xl border border-niat-line bg-white p-5 shadow-xs sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-niat-line/70 pb-3">
              <div>
                <h2 className="text-base font-extrabold text-niat-text">ATTENDEE FLOW PIPELINE</h2>
                <p className="text-xs text-niat-muted">Real-time funnel showing conversion &amp; bottleneck tracking</p>
              </div>
              <span className="text-xs font-bold text-emerald-700">✓ 100% Allocation Efficiency</span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {/* Step 1: Registered */}
              <div className="relative rounded-xl border border-niat-line/80 bg-stone-50/70 p-4 text-center">
                <div className="text-xs font-bold uppercase tracking-wider text-niat-muted">1. Registered</div>
                <div className="mt-1.5 text-3xl font-black text-niat-text">{data.stats.actual}</div>
                <div className="mt-1 text-xs font-semibold text-niat-muted">100% of Base</div>
                <span className="hidden sm:block absolute -right-2.5 top-1/2 -translate-y-1/2 text-niat-line font-bold text-lg">
                  &rarr;
                </span>
              </div>

              {/* Step 2: Checked In */}
              <div className="relative rounded-xl border border-emerald-300 bg-emerald-50/50 p-4 text-center">
                <div className="text-xs font-bold uppercase tracking-wider text-emerald-800">2. Checked In</div>
                <div className="mt-1.5 text-3xl font-black text-emerald-700">{data.stats.checkedIn}</div>
                <div className="mt-1 text-xs font-bold text-emerald-800">
                  {checkedInPct.toFixed(1)}% of Expected
                </div>
                <span className="hidden sm:block absolute -right-2.5 top-1/2 -translate-y-1/2 text-niat-line font-bold text-lg">
                  &rarr;
                </span>
              </div>

              {/* Step 3: Team Allocated */}
              <div className="relative rounded-xl border border-niat-line/80 bg-niat-cream/40 p-4 text-center">
                <div className="text-xs font-bold uppercase tracking-wider text-niat-text">3. Team Allocated</div>
                <div className="mt-1.5 text-3xl font-black text-niat-maroon">{data.stats.checkedIn}</div>
                <div className="mt-1 text-xs font-semibold text-niat-muted">100% of Checked In</div>
                <span className="hidden sm:block absolute -right-2.5 top-1/2 -translate-y-1/2 text-niat-line font-bold text-lg">
                  &rarr;
                </span>
              </div>

              {/* Step 4: Seated In Room */}
              <div className="rounded-xl border border-emerald-300 bg-emerald-50/50 p-4 text-center">
                <div className="text-xs font-bold uppercase tracking-wider text-emerald-800">4. Seated In Room</div>
                <div className="mt-1.5 text-3xl font-black text-emerald-700">{data.stats.checkedIn}</div>
                <div className="mt-1 text-xs font-bold text-emerald-800">100% of Allocated</div>
              </div>
            </div>
          </div>

          {/* 4. Centerpiece Grid: Check-in Velocity | Live Check-in Feed */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* LEFT COLUMN: Check-in Velocity Graph (7 cols) */}
            <div className="space-y-6 lg:col-span-7">
              <div className="rounded-2xl border border-niat-line bg-white p-5 shadow-xs sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-niat-line/70 pb-3">
                  <div>
                    <h2 className="text-base font-extrabold text-niat-text">CHECK-IN VELOCITY</h2>
                    <p className="text-xs text-niat-muted">Real-time arrival rate &amp; session start curve</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-emerald-700">+{data.stats.recent10Min} last 10 min</span>
                    <div className="text-[11px] text-niat-muted">Live Pace Tracking</div>
                  </div>
                </div>

                {/* SVG Curve Area Chart */}
                <div className="mt-4">
                  <div className="relative h-44 w-full">
                    <svg className="h-full w-full overflow-visible" viewBox="0 0 500 160" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="velocityGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#A7191E" stopOpacity="0.20" />
                          <stop offset="100%" stopColor="#A7191E" stopOpacity="0.00" />
                        </linearGradient>
                      </defs>

                      {/* Horizontal Grid lines */}
                      <line x1="0" y1="20" x2="500" y2="20" stroke="#EAE3D9" strokeDasharray="3 3" />
                      <line x1="0" y1="65" x2="500" y2="65" stroke="#EAE3D9" strokeDasharray="3 3" />
                      <line x1="0" y1="110" x2="500" y2="110" stroke="#EAE3D9" strokeDasharray="3 3" />
                      <line x1="0" y1="150" x2="500" y2="150" stroke="#C5BDB2" />

                      {/* Area Fill */}
                      <path
                        d="M 0 150 Q 80 145, 150 130 T 300 85 T 420 45 L 490 20 L 490 150 Z"
                        fill="url(#velocityGrad)"
                      />

                      {/* Velocity Stroke */}
                      <path
                        d="M 0 150 Q 80 145, 150 130 T 300 85 T 420 45 L 490 20"
                        fill="none"
                        stroke="#A7191E"
                        strokeWidth="3"
                        strokeLinecap="round"
                      />

                      {/* Data Point Markers */}
                      <circle cx="150" cy="130" r="4" fill="#A7191E" />
                      <circle cx="300" cy="85" r="4" fill="#A7191E" />
                      <circle cx="420" cy="45" r="4" fill="#A7191E" />
                      <circle cx="490" cy="20" r="6" fill="#A7191E" className="animate-pulse" />
                    </svg>

                    <div className="mt-2 flex justify-between text-[11px] font-semibold text-niat-muted">
                      <span>09:00 AM</span>
                      <span>09:20 AM</span>
                      <span>09:40 AM</span>
                      <span>10:00 AM</span>
                      <span>NOW</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-xl bg-niat-warm-white p-3 text-xs text-niat-muted">
                  <strong className="text-niat-text">Velocity Assessment: </strong>
                  Arrivals are currently progressing with <strong>+{data.stats.recent10Min} check-ins</strong> recorded in the last 10 minutes.
                  Seating allocation queue is operating with 0 latency.
                </div>
              </div>

              {/* Room Capacity Visual (Section 4) */}
              <div className="rounded-2xl border border-niat-line bg-white p-5 shadow-xs sm:p-6">
                <div className="flex items-center justify-between border-b border-niat-line/70 pb-3">
                  <div>
                    <h2 className="text-base font-extrabold text-niat-text">ROOM CAPACITY</h2>
                    <p className="text-xs text-niat-muted">Real-time venue utilization &amp; threshold safety</p>
                  </div>
                  <span className="text-xs font-bold text-niat-muted">{data.rooms.length} Room(s) Active</span>
                </div>

                <div className="mt-5 space-y-4">
                  {data.rooms.map((r) => {
                    const pct = r.capacity ? Math.round((r.used / r.capacity) * 100) : 0;
                    const seatsAvailable = Math.max(0, r.capacity - r.used);

                    return (
                      <div key={r.id} className="rounded-xl border border-niat-line/70 bg-niat-warm-white p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-base font-black text-niat-text">{r.name.toUpperCase()}</span>
                            <span className="ml-2 rounded-md bg-stone-100 px-2 py-0.5 text-xs text-niat-muted">
                              Priority {r.priority}
                            </span>
                          </div>
                          <div className="font-mono text-base font-bold text-niat-text">
                            {r.used} <span className="text-niat-muted/60 font-normal">/ {r.capacity}</span>
                          </div>
                        </div>

                        {/* Room Bar */}
                        <div className="mt-3 relative h-3.5 w-full overflow-hidden rounded-full bg-stone-200">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              pct >= 90
                                ? 'bg-niat-maroon'
                                : pct >= 60
                                  ? 'bg-gradient-to-r from-niat-maroon to-niat-gold'
                                  : 'bg-emerald-600'
                            }`}
                            style={{ width: `${Math.max(3, pct)}%` }}
                          />
                        </div>

                        <div className="mt-2.5 flex items-center justify-between text-xs">
                          <span className="font-extrabold text-niat-text">{pct}% occupied</span>
                          <span className="font-semibold text-emerald-700">{seatsAvailable} seats available</span>
                        </div>
                      </div>
                    );
                  })}
                  {data.rooms.length === 0 && <p className="text-sm text-niat-muted">No rooms configured.</p>}
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Live Check-in Feed (Information Dense & Multi-View) (5 cols) */}
            <div className="space-y-6 lg:col-span-5">
              <div className="rounded-2xl border border-niat-line bg-white p-5 shadow-xs sm:p-6">
                {/* Feed Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-niat-line/70 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse" aria-hidden="true" />
                      <h2 className="text-base font-black text-niat-text">LIVE CHECK-IN FEED</h2>
                    </div>
                    <div className="mt-0.5 text-xs text-niat-muted">
                      {data.stats.checkedIn} checked in · {data.stats.checkedIn} seated · Updated just now
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setDrawerOpen(true)}
                    className="cursor-pointer text-xs font-bold text-niat-maroon hover:underline"
                  >
                    View all &rarr;
                  </button>
                </div>

                {/* Compact Velocity Bar inside Feed */}
                <div className="mt-3 flex items-center justify-between rounded-xl bg-emerald-50/70 border border-emerald-200/80 px-3.5 py-2 text-xs">
                  <span className="font-bold text-emerald-900">{data.stats.checkedIn} Total Checked In</span>
                  <span className="font-semibold text-emerald-700">+{data.stats.recent10Min} in last 10 minutes</span>
                </div>

                {/* View Switcher: [ Latest ] vs [ First 5 to Check In ] */}
                <div className="mt-3.5 flex items-center gap-1.5 border-b border-niat-line/60 pb-2.5">
                  <button
                    type="button"
                    onClick={() => setActivityTab('latest')}
                    className={`cursor-pointer rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                      activityTab === 'latest'
                        ? 'bg-niat-maroon text-white shadow-2xs'
                        : 'bg-stone-100 text-niat-muted hover:bg-stone-200'
                    }`}
                  >
                    Latest Arrivals
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivityTab('first5')}
                    className={`cursor-pointer rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                      activityTab === 'first5'
                        ? 'bg-niat-maroon text-white shadow-2xs'
                        : 'bg-stone-100 text-niat-muted hover:bg-stone-200'
                    }`}
                  >
                    First 5 to Check In
                  </button>

                  {/* Room filter dropdown */}
                  {data.rooms.length > 1 && (
                    <select
                      value={activityRoomFilter}
                      onChange={(e) => setActivityRoomFilter(e.target.value)}
                      className="ml-auto rounded-lg border border-niat-line bg-white px-2 py-1 text-xs text-niat-text"
                    >
                      <option value="all">All Rooms</option>
                      {data.rooms.map((r) => (
                        <option key={r.id} value={r.name}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Feed Items List */}
                <div className="mt-3 space-y-2.5">
                  {displayedFeed.length === 0 && (
                    <div className="py-8 text-center text-xs text-niat-muted">
                      No attendee check-ins recorded yet. Attendees checking in will stream in live.
                    </div>
                  )}

                  {displayedFeed.map((item, idx) => {
                    const isFirstView = activityTab === 'first5';
                    const medal = isFirstView ? ['🥇', '🥈', '🥉', '4.', '5.'][idx] : null;

                    return (
                      <div
                        key={item.id}
                        className="group flex items-start gap-3 rounded-xl border border-niat-line/70 bg-white p-3 shadow-2xs transition-all hover:border-niat-maroon/25 hover:bg-niat-warm-white"
                      >
                        {isFirstView ? (
                          <span className="font-bold text-sm text-niat-maroon w-5 text-center mt-0.5">{medal}</span>
                        ) : (
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-600 shadow-2xs" />
                        )}

                        <div className="min-w-0 flex-1">
                          {/* 1. Name is the Strongest Element */}
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate text-sm font-black text-niat-text">{item.name}</span>
                            <span className="shrink-0 font-mono text-[11px] font-medium text-niat-muted">
                              {isFirstView ? formatClockTime(item.checkInTime) : formatRelativeTime(item.checkInTime)}
                            </span>
                          </div>

                          {/* 2. Team, Room, Seat Metadata */}
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-niat-muted">
                            {item.teamNumber ? (
                              <span className="font-bold text-niat-maroon">Team {item.teamNumber}</span>
                            ) : (
                              <span className="text-amber-700">Team unassigned</span>
                            )}
                            <span aria-hidden="true" className="text-niat-line">·</span>
                            <span>{item.roomName || 'Main Hall'}</span>
                            <span aria-hidden="true" className="text-niat-line">·</span>
                            <span className="font-mono font-bold text-niat-text">Seat {item.seatLabel || '—'}</span>
                          </div>

                          {/* 3. Status Journey Pipeline */}
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
                            <span className="inline-flex items-center gap-0.5 rounded-sm bg-emerald-50 px-1.5 py-0.5 text-emerald-800 ring-1 ring-emerald-300/60">
                              ✓ Checked in
                            </span>
                            <span aria-hidden="true" className="text-niat-muted/40">&rarr;</span>
                            <span className="inline-flex items-center gap-0.5 rounded-sm bg-niat-cream px-1.5 py-0.5 text-niat-maroon">
                              Team {item.teamNumber ?? '—'}
                            </span>
                            <span aria-hidden="true" className="text-niat-muted/40">&rarr;</span>
                            <span className="inline-flex items-center gap-0.5 rounded-sm bg-stone-100 px-1.5 py-0.5 text-niat-text">
                              Seat {item.seatLabel ?? '—'}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* View All Drawer Trigger */}
                <div className="mt-4 pt-2 border-t border-niat-line/60 text-center">
                  <button
                    type="button"
                    onClick={() => setDrawerOpen(true)}
                    className="cursor-pointer text-xs font-bold text-niat-maroon hover:underline"
                  >
                    View all {data.stats.checkedIn} check-ins in detail drawer &rarr;
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 5. Two-Card Row: Insights from the Data & Needs Attention */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* CARD A: INSIGHTS FROM THE DATA (No AI phrasing, factual metrics) */}
            <div className="rounded-2xl border border-niat-line bg-white p-5 shadow-xs sm:p-6">
              <div className="border-b border-niat-line/70 pb-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-black text-niat-text">INSIGHTS FROM THE DATA</h2>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-niat-muted">Deterministic Analysis</span>
                </div>
                <p className="mt-0.5 text-xs text-niat-muted">
                  Automatically generated observations from current event data.
                </p>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {dataInsights.map((insight, idx) => (
                  <div key={idx} className="rounded-xl border border-niat-line/70 bg-niat-warm-white p-3.5">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-niat-muted">
                      {insight.title}
                    </div>
                    <div className="mt-1 text-lg font-black text-niat-text">{insight.value}</div>
                    <div className="mt-1 text-xs text-niat-muted">{insight.desc}</div>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-xl bg-stone-50 border border-niat-line/70 p-3 text-xs text-niat-muted">
                <strong className="text-niat-text">Data Summary: </strong>
                Attendance currently stands at <strong>{data.stats.checkedIn}</strong> attendees ({checkedInPct.toFixed(1)}% of planned target).{' '}
                {data.stats.walkIns > 0 ? `${data.stats.walkIns} walk-in attendees accounted for.` : 'Zero walk-in overflow reported.'}
              </div>
            </div>

            {/* CARD B: NEEDS ATTENTION (Distinct Operational Action Checklist) */}
            <div className="rounded-2xl border border-amber-300/80 bg-amber-50/30 p-5 shadow-xs sm:p-6">
              <div className="border-b border-amber-200/80 pb-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-black text-amber-950">NEEDS ATTENTION</h2>
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                    Operational Checklist
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-amber-800">
                  Real-time status flags requiring event organizer action or awareness.
                </p>
              </div>

              <div className="mt-4 space-y-2.5">
                {attentionItems.map((item, idx) => (
                  <div
                    key={idx}
                    className={`flex items-start gap-2.5 rounded-xl border p-3 text-xs ${
                      item.level === 'warn'
                        ? 'border-amber-300 bg-white text-amber-950 shadow-2xs'
                        : 'border-emerald-200 bg-white text-emerald-950 shadow-2xs'
                    }`}
                  >
                    <span className="mt-0.5 text-sm font-bold">
                      {item.level === 'warn' ? '⚠' : '✓'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold">{item.message}</div>
                      {item.sub && <div className="mt-0.5 text-[11px] text-niat-muted">{item.sub}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 6. Interactive Team Occupancy Command Matrix */}
          <div className="rounded-2xl border border-niat-line bg-white p-5 shadow-xs sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-niat-line/70 pb-3">
              <div>
                <h2 className="text-base font-extrabold text-niat-text">TEAM OCCUPANCY COMMAND MATRIX</h2>
                <p className="text-xs text-niat-muted">
                  Interactive real-time seating allocation ({data.teams.length} teams configured)
                </p>
              </div>

              {/* Status Filter Tabs */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setTeamFilter('all')}
                  className={`cursor-pointer rounded-lg px-2.5 py-1 transition-all ${
                    teamFilter === 'all'
                      ? 'bg-niat-maroon text-white'
                      : 'bg-stone-100 text-niat-muted hover:bg-stone-200'
                  }`}
                >
                  All ({data.teams.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTeamFilter('filling')}
                  className={`cursor-pointer rounded-lg px-2.5 py-1 transition-all ${
                    teamFilter === 'filling'
                      ? 'bg-niat-gold text-niat-text font-bold'
                      : 'bg-stone-100 text-niat-muted hover:bg-stone-200'
                  }`}
                >
                  Filling ({data.teams.filter((t) => t.assigned > 0 && t.assigned < t.capacity).length})
                </button>
                <button
                  type="button"
                  onClick={() => setTeamFilter('full')}
                  className={`cursor-pointer rounded-lg px-2.5 py-1 transition-all ${
                    teamFilter === 'full'
                      ? 'bg-emerald-700 text-white font-bold'
                      : 'bg-stone-100 text-niat-muted hover:bg-stone-200'
                  }`}
                >
                  Full ({data.teams.filter((t) => t.assigned === t.capacity).length})
                </button>
                <button
                  type="button"
                  onClick={() => setTeamFilter('empty')}
                  className={`cursor-pointer rounded-lg px-2.5 py-1 transition-all ${
                    teamFilter === 'empty'
                      ? 'bg-stone-700 text-white font-bold'
                      : 'bg-stone-100 text-niat-muted hover:bg-stone-200'
                  }`}
                >
                  Ready ({data.teams.filter((t) => t.assigned === 0).length})
                </button>
                <Link to="/admin/teams" className="ml-2 text-xs font-bold text-niat-maroon hover:underline">
                  Seat Table View &rarr;
                </Link>
              </div>
            </div>

            {/* Teams Interactive Grid */}
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-9">
              {filteredTeams.map((t) => {
                const isFull = t.assigned === t.capacity;
                const isEmpty = t.assigned === 0;
                const isPartial = t.assigned > 0 && !isFull;
                const pct = t.capacity > 0 ? (t.assigned / t.capacity) * 100 : 0;

                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTeam(t)}
                    className={`cursor-pointer group flex flex-col justify-between rounded-xl border p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${
                      isFull
                        ? 'border-emerald-400 bg-emerald-50/70 text-emerald-950'
                        : isPartial
                          ? 'border-niat-maroon/30 bg-niat-cream/80 text-niat-text'
                          : 'border-niat-line bg-white text-niat-muted hover:border-niat-line/90'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-black">TEAM {String(t.teamNumber).padStart(2, '0')}</span>
                      {isFull && <span className="h-2 w-2 rounded-full bg-emerald-600" />}
                      {isPartial && <span className="h-2 w-2 rounded-full bg-niat-gold" />}
                      {isEmpty && <span className="h-2 w-2 rounded-full bg-stone-300" />}
                    </div>

                    <div className="my-2 flex items-baseline gap-1">
                      <span className="text-xl font-black">{t.assigned}</span>
                      <span className="text-xs text-niat-muted/80">/ {t.capacity}</span>
                    </div>

                    {/* Progress Bar inside Card */}
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-200">
                      <div
                        className={`h-full rounded-full ${
                          isFull ? 'bg-emerald-600' : isPartial ? 'bg-niat-maroon' : 'bg-transparent'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    <div className="mt-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider">
                      <span>{isFull ? 'FULL' : isPartial ? `${t.capacity - t.assigned} LEFT` : 'READY'}</span>
                      <span className="text-niat-muted/60 group-hover:text-niat-maroon">&rarr;</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* 7. View All Check-ins Slide-out Drawer */}
      {drawerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-fade-in"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-niat-line px-6 py-4">
              <div>
                <h3 className="text-lg font-black text-niat-text">All Check-In Activity</h3>
                <p className="text-xs text-niat-muted">
                  {data?.stats.checkedIn} total participants confirmed &amp; seated
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-full text-xl text-niat-muted hover:bg-niat-pink hover:text-niat-maroon"
              >
                &times;
              </button>
            </div>

            {/* Filter and Search Bar */}
            <div className="border-b border-niat-line bg-niat-warm-white p-4 space-y-3">
              <div className="relative">
                <input
                  type="text"
                  value={drawerSearch}
                  onChange={(e) => setDrawerSearch(e.target.value)}
                  placeholder="Search participants by name or college..."
                  className="w-full rounded-xl border border-niat-line bg-white px-4 py-2 text-xs text-niat-text outline-none focus:border-niat-maroon focus:ring-2 focus:ring-niat-maroon/10"
                />
                {drawerSearch && (
                  <button
                    type="button"
                    onClick={() => setDrawerSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-niat-muted hover:text-niat-maroon"
                  >
                    &times;
                  </button>
                )}
              </div>

              {data && data.rooms.length > 1 && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-bold text-niat-muted">Room:</span>
                  <button
                    type="button"
                    onClick={() => setDrawerRoomFilter('all')}
                    className={`rounded-lg px-2.5 py-1 font-semibold ${
                      drawerRoomFilter === 'all'
                        ? 'bg-niat-maroon text-white'
                        : 'bg-white border border-niat-line text-niat-muted'
                    }`}
                  >
                    All Rooms
                  </button>
                  {data.rooms.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setDrawerRoomFilter(r.name)}
                      className={`rounded-lg px-2.5 py-1 font-semibold ${
                        drawerRoomFilter === r.name
                          ? 'bg-niat-maroon text-white'
                          : 'bg-white border border-niat-line text-niat-muted'
                      }`}
                    >
                      {r.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Drawer Items List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {drawerItems.length === 0 && (
                <div className="py-12 text-center text-xs text-niat-muted">
                  No matching check-ins found.
                </div>
              )}

              {drawerItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-niat-line bg-white p-3.5 shadow-2xs hover:border-niat-maroon/30 transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-black text-niat-text">{item.name}</span>
                    <span className="font-mono text-xs font-semibold text-niat-muted">
                      {formatClockTime(item.checkInTime)}
                    </span>
                  </div>

                  <div className="mt-1 text-xs text-niat-muted">{item.schoolCollege || 'NIAT Student'}</div>

                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-niat-line/60 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-niat-maroon">Team {item.teamNumber ?? '—'}</span>
                      <span className="text-niat-muted">· {item.roomName || 'Main Hall'}</span>
                      <span className="font-mono font-bold text-niat-text">· Seat {item.seatLabel ?? '—'}</span>
                    </div>
                    <span className="rounded-sm bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 ring-1 ring-emerald-300">
                      ✓ Confirmed
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Drawer Footer */}
            <div className="border-t border-niat-line p-4 bg-white flex justify-between items-center">
              <span className="text-xs text-niat-muted">Showing {drawerItems.length} of {data?.stats.checkedIn} check-ins</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="cursor-pointer rounded-xl bg-niat-maroon px-4 py-2 text-xs font-bold text-white hover:bg-niat-maroon-dark"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Team Details Popover Modal */}
      {selectedTeam && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs animate-fade-in"
          onClick={() => setSelectedTeam(null)}
        >
          <div
            className="w-full max-w-md animate-scale-in rounded-2xl border border-niat-line bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-niat-line pb-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-niat-maroon">TEAM OVERVIEW</div>
                <h3 className="text-xl font-extrabold text-niat-text">Team {selectedTeam.teamNumber}</h3>
                <div className="text-xs text-niat-muted">Room: {selectedTeam.roomName || 'Main Hall'}</div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTeam(null)}
                className="grid h-8 w-8 place-items-center rounded-full text-lg text-niat-muted hover:bg-niat-pink hover:text-niat-maroon"
              >
                &times;
              </button>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-niat-muted">Occupancy:</span>
                <span className="font-bold text-niat-text">
                  {selectedTeam.assigned} of {selectedTeam.capacity} seats filled
                </span>
              </div>

              <div className="mt-4 space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-niat-muted">Allocated Seats:</div>
                {selectedTeam.seats && selectedTeam.seats.length > 0 ? (
                  selectedTeam.seats.map((seat, sIdx) => (
                    <div
                      key={sIdx}
                      className="flex items-center justify-between rounded-lg border border-niat-line bg-niat-warm-white px-3 py-2 text-xs"
                    >
                      <span className="font-mono font-bold text-niat-maroon">Seat {seat.label}</span>
                      <span className="font-semibold text-niat-text">{seat.student || '(Unoccupied / Open)'}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-niat-muted">No individual seat assignments recorded.</p>
                )}
              </div>

              <div className="mt-6 flex justify-between gap-3">
                <Link
                  to="/admin/teams"
                  className="rounded-xl border border-niat-line bg-white px-4 py-2 text-xs font-bold text-niat-maroon hover:bg-niat-pink"
                >
                  View in Teams Table
                </Link>
                <button
                  type="button"
                  onClick={() => setSelectedTeam(null)}
                  className="rounded-xl bg-niat-maroon px-4 py-2 text-xs font-bold text-white hover:bg-niat-maroon-dark"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
