import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useOutletContext } from 'react-router-dom';
import logo from '../../assets/niat-logo.png';
import { api, checkAdminAuth, formatDate, logoutAdmin, type EventInfo } from '../../lib/api';
import AdminLogin from './Login';

export interface AdminContext {
  event: EventInfo | null;
  reload: () => Promise<void>;
  selectEvent: (id: number | null) => void;
}

export const useAdmin = () => useOutletContext<AdminContext>();

const STORAGE_KEY = 'admin.selectedEventId';

export const statusBadge: Record<string, string> = {
  draft: 'bg-stone-100 text-stone-700 border border-stone-200',
  active: 'bg-emerald-50 text-emerald-700 border border-emerald-300 font-bold',
  completed: 'bg-niat-pink text-niat-maroon border border-niat-maroon/20',
};

interface NavSection {
  title: string;
  items: {
    to: string;
    label: string;
    end?: boolean;
    icon: React.ReactNode;
  }[];
}

const navSections: NavSection[] = [
  {
    title: 'EVENT',
    items: [
      {
        to: '/admin',
        label: 'Dashboard',
        end: true,
        icon: (
          <svg className="h-4.5 w-4.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="9" rx="1.5" />
            <rect x="14" y="3" width="7" height="5" rx="1.5" />
            <rect x="14" y="12" width="7" height="9" rx="1.5" />
            <rect x="3" y="16" width="7" height="5" rx="1.5" />
          </svg>
        ),
      },
      {
        to: '/admin/setup',
        label: 'Event Setup',
        icon: (
          <svg className="h-4.5 w-4.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        ),
      },
      {
        to: '/admin/participants',
        label: 'Participants',
        icon: (
          <svg className="h-4.5 w-4.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        ),
      },
      {
        to: '/admin/import',
        label: 'Import Participants',
        icon: (
          <svg className="h-4.5 w-4.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        ),
      },
    ],
  },
  {
    title: 'OPERATIONS',
    items: [
      {
        to: '/admin/teams',
        label: 'Rooms & Teams',
        icon: (
          <svg className="h-4.5 w-4.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        ),
      },
      {
        to: '/admin/export',
        label: 'Export',
        icon: (
          <svg className="h-4.5 w-4.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        ),
      },
    ],
  },
  {
    title: 'EVENTS',
    items: [
      {
        to: '/admin/events',
        label: 'All Events',
        icon: (
          <svg className="h-4.5 w-4.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        ),
      },
    ],
  },
];

export default function AdminLayout() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [adminEmail, setAdminEmail] = useState<string>('admin@niat.edu');
  const [authChecking, setAuthChecking] = useState<boolean>(true);

  const [event, setEvent] = useState<EventInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return v ? Number(v) : null;
    } catch {
      return null;
    }
  });

  // Verify authentication on mount
  useEffect(() => {
    checkAdminAuth().then((res) => {
      setIsAuthenticated(res.authenticated);
      if (res.email) setAdminEmail(res.email);
      setAuthChecking(false);
    });

    const onUnauthorized = () => {
      setIsAuthenticated(false);
    };
    window.addEventListener('admin_unauthorized', onUnauthorized);
    return () => window.removeEventListener('admin_unauthorized', onUnauthorized);
  }, []);

  const reload = useCallback(async () => {
    let e: EventInfo | null = null;
    if (selectedId) e = await api<EventInfo>(`/events/${selectedId}`).catch(() => null);
    if (!e) e = await api<EventInfo | null>('/events/current');
    setEvent(e);
    setLoaded(true);
  }, [selectedId]);

  useEffect(() => {
    if (isAuthenticated) {
      reload();
    }
  }, [isAuthenticated, reload]);

  const selectEvent = (id: number | null) => {
    try {
      if (id) localStorage.setItem(STORAGE_KEY, String(id));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
    setSelectedId(id);
  };

  const handleSignOut = async () => {
    await logoutAdmin();
    setIsAuthenticated(false);
  };

  if (authChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8F9FA] text-xs font-semibold text-niat-muted">
        Verifying administrator session…
      </div>
    );
  }

  // If not authenticated, render Login screen
  if (!isAuthenticated) {
    return (
      <AdminLogin
        onLoginSuccess={(email) => {
          setIsAuthenticated(true);
          setAdminEmail(email);
        }}
      />
    );
  }

  return (
    <div className="flex min-h-screen bg-[#F8F9FA]">
      {/* Modern, Structured Operations Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-niat-line bg-white shadow-2xs md:flex">
        {/* Brand header */}
        <div className="border-b border-niat-line px-5 py-4">
          <div className="flex items-center gap-2.5">
            <img src={logo} alt="NIAT" className="h-8 w-auto object-contain" />
            <div className="leading-none">
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-niat-maroon">NIAT</div>
              <div className="text-xs font-extrabold tracking-tight text-niat-text">AI BOOTCAMP</div>
            </div>
          </div>

          {/* Active Event Card Badge */}
          {event ? (
            <div className="mt-3.5 rounded-xl border border-niat-line/80 bg-niat-warm-white p-2.5">
              <div className="flex items-center justify-between gap-1">
                <span className="truncate text-xs font-bold text-niat-text">{event.name}</span>
                {event.status === 'active' && (
                  <span className="flex items-center gap-1 text-[10px] font-black uppercase text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
                    LIVE
                  </span>
                )}
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-niat-muted">
                <span className={`rounded-full px-1.5 py-0.2 font-semibold capitalize ${statusBadge[event.status]}`}>
                  {event.status}
                </span>
                <span>{formatDate(event.date)}</span>
              </div>
            </div>
          ) : loaded ? (
            <div className="mt-2 text-xs text-niat-muted">No active event selected</div>
          ) : null}
        </div>

        {/* Categorized Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          {navSections.map((section) => (
            <div key={section.title}>
              <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-niat-muted/70">
                {section.title}
              </div>
              <div className="space-y-0.5">
                {section.items.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    end={n.end}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
                        isActive
                          ? 'border border-niat-maroon/15 bg-niat-pink/70 text-niat-maroon shadow-2xs'
                          : 'text-niat-muted hover:bg-niat-cream/40 hover:text-niat-text'
                      }`
                    }
                  >
                    {n.icon}
                    <span>{n.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom User Profile + Quick-Launch Action */}
        <div className="border-t border-niat-line p-3 bg-white space-y-2">
          {/* Authenticated Admin Account Badge */}
          <div className="flex items-center justify-between rounded-xl border border-niat-line/70 bg-niat-warm-white px-2.5 py-2 text-xs">
            <div className="min-w-0 pr-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-niat-muted">Admin Account</div>
              <div className="truncate font-bold text-niat-text text-[11px]">{adminEmail}</div>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="cursor-pointer rounded-lg border border-niat-line bg-white px-2 py-1 text-[10px] font-bold text-niat-muted transition-colors hover:border-niat-maroon/30 hover:bg-niat-pink hover:text-niat-maroon"
              title="Sign out of admin session"
            >
              Sign Out
            </button>
          </div>

          <NavLink
            to="/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl bg-niat-maroon px-3 py-2.5 text-xs font-bold text-white shadow-xs transition-all hover:bg-niat-maroon-dark hover:shadow-sm"
          >
            <span>↗ Open Check-in Kiosk</span>
          </NavLink>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="min-w-0 flex-1">
        {/* Mobile Navbar */}
        <div className="flex items-center justify-between border-b border-niat-line bg-white px-4 py-2.5 md:hidden">
          <div className="flex gap-2 overflow-x-auto">
            {navSections.flatMap((s) => s.items).map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                    isActive ? 'bg-niat-pink text-niat-maroon' : 'text-niat-muted'
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            className="ml-2 shrink-0 cursor-pointer rounded-lg border border-niat-line bg-white px-2.5 py-1 text-xs font-bold text-niat-muted hover:text-niat-maroon"
          >
            Sign Out
          </button>
        </div>

        <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
          {loaded ? (
            <Outlet context={{ event, reload, selectEvent } satisfies AdminContext} />
          ) : (
            <div className="p-8 text-center text-niat-muted">Loading command center…</div>
          )}
        </main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-niat-line/70 pb-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-niat-text sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm font-medium text-niat-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function NoEvent() {
  return (
    <div className="card text-center p-12">
      <div className="text-4xl" aria-hidden="true">
        📅
      </div>
      <h2 className="mt-3 text-xl font-bold text-niat-text">No active event selected</h2>
      <p className="mt-1 text-sm text-niat-muted">Configure an event to view the live operations command center.</p>
      <NavLink to="/admin/setup" className="btn-primary mt-5">
        Create an event
      </NavLink>
    </div>
  );
}
