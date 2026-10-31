import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useOutletContext } from 'react-router-dom';
import logo from '../../assets/niat-logo.png';
import { api, checkAdminAuth, formatDate, logoutAdmin, type AdminUser, type EventInfo } from '../../lib/api';
import ChangePassword from './ChangePassword';
import AdminLogin from './Login';

export interface AdminContext {
  event: EventInfo | null;
  reload: () => Promise<void>;
  selectEvent: (id: number | null) => void;
  user: AdminUser;
  /** Re-count access requests waiting for approval (super admin badge). */
  refreshPending: () => void;
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
    badge?: number;
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
        to: '/admin/projects',
        label: 'Projects',
        icon: (
          <svg className="h-4.5 w-4.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 21h8m-4-4v4m-5-17h10v5a5 5 0 01-10 0V4zM7 6H4v1a3 3 0 003 3m10-4h3v1a3 3 0 01-3 3" />
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

const platformIcon = (
  <svg className="h-4.5 w-4.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h4l3 8 4-16 3 8h4" />
  </svg>
);
const locationIcon = (
  <svg className="h-4.5 w-4.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s-7-6.2-7-11.5A7 7 0 0112 2.5a7 7 0 017 7C19 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </svg>
);
const adminsIcon = (
  <svg className="h-4.5 w-4.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
  </svg>
);

/** Overview for everyone; locations and admin approvals for the super admin only. */
function platformSection(user: AdminUser, pendingAdmins: number): NavSection {
  const items: NavSection['items'] = [{ to: '/admin/overview', label: 'All Locations', icon: platformIcon }];
  if (user.role === 'super_admin') {
    items.push({ to: '/admin/locations', label: 'Locations', icon: locationIcon });
    items.push({ to: '/admin/admins', label: 'Admins', icon: adminsIcon, badge: pendingAdmins || undefined });
  }
  return { title: 'PLATFORM', items };
}

export default function AdminLayout() {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [authChecking, setAuthChecking] = useState<boolean>(true);
  const [pendingAdmins, setPendingAdmins] = useState(0);

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

  const refreshUser = useCallback(() => checkAdminAuth().then((u) => {
    setUser(u);
    setAuthChecking(false);
  }), []);

  // Verify the session on mount, and again whenever the server says it changed.
  useEffect(() => {
    refreshUser();
    const onUnauthorized = () => setUser(null);
    window.addEventListener('admin_unauthorized', onUnauthorized);
    window.addEventListener('admin_password_change', refreshUser);
    return () => {
      window.removeEventListener('admin_unauthorized', onUnauthorized);
      window.removeEventListener('admin_password_change', refreshUser);
    };
  }, [refreshUser]);

  const ready = Boolean(user && !user.mustChangePassword);

  // Only the newest reload may set the event: replies from the remote database can arrive out of
  // order, and an older reply must never switch the admin back to a previous event.
  const latestReload = useRef(0);
  const reload = useCallback(async () => {
    const ticket = ++latestReload.current;
    let e: EventInfo | null = null;
    if (selectedId) e = await api<EventInfo>(`/events/${selectedId}`).catch(() => null);
    if (!e) e = await api<EventInfo | null>('/events/current').catch(() => null);
    if (ticket !== latestReload.current) return;
    setEvent(e);
    setLoaded(true);
  }, [selectedId]);

  useEffect(() => {
    if (ready) reload();
  }, [ready, reload]);

  const refreshPending = useCallback(() => {
    if (user?.role !== 'super_admin') return;
    api<{ status: string }[]>('/platform/admins')
      .then((list) => setPendingAdmins(list.filter((a) => a.status === 'pending').length))
      .catch(() => {});
  }, [user?.role]);
  useEffect(() => { if (ready) refreshPending(); }, [ready, refreshPending]);

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
    setUser(null);
    setEvent(null);
    setLoaded(false);
  };

  if (authChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8F9FA] text-xs font-semibold text-niat-muted">
        Verifying administrator session…
      </div>
    );
  }

  if (!user) return <AdminLogin onLoginSuccess={(u) => setUser(u)} />;
  if (user.mustChangePassword) return <ChangePassword user={user} forced onDone={setUser} onSignOut={handleSignOut} />;

  const sections = [platformSection(user, pendingAdmins), ...navSections];
  const roleLabel = user.role === 'super_admin'
    ? 'Super Admin'
    : user.locations.map((l) => l.name).join(', ') || 'Location Admin';

  return (
    <div className="flex min-h-screen bg-[#F8F9FA]">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-niat-line bg-white shadow-2xs md:flex">
        <div className="border-b border-niat-line px-5 pb-4 pt-5">
          {/* The logo is a wide wordmark that already spells out NIAT, so it gets the full width to stay legible. */}
          <img src={logo} alt="NIAT – NxtWave of Innovation in Advanced Technologies" className="block h-auto w-full max-w-52" />
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-niat-text">AI Bootcamp</span>
            <span className="rounded-md bg-niat-pink px-2 py-0.5 text-xs font-semibold text-niat-maroon">Admin</span>
          </div>

          {event ? (
            <div className="mt-4 rounded-xl border border-niat-line/80 bg-niat-warm-white px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-niat-text" title={event.name}>{event.name}</span>
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadge[event.status]}`}>
                  {event.status === 'active' && <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" aria-hidden="true" />}
                  {event.status === 'active' ? 'Live' : event.status === 'draft' ? 'Draft' : 'Completed'}
                </span>
              </div>
              <div className="mt-1 truncate text-xs text-niat-muted">
                {event.locationName && <>{event.locationName} · </>}{formatDate(event.date)}
              </div>
            </div>
          ) : loaded ? (
            <div className="mt-4 text-sm text-niat-muted">No event selected</div>
          ) : null}
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          {sections.map((section) => (
            <div key={section.title}>
              <div className="px-3 pb-1.5 text-xs font-semibold uppercase tracking-wider text-niat-muted/80">
                {section.title}
              </div>
              <div className="space-y-0.5">
                {section.items.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    end={n.end}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? 'border-niat-maroon/15 bg-niat-pink/70 font-semibold text-niat-maroon'
                          : 'border-transparent text-niat-muted hover:bg-niat-cream/40 hover:text-niat-text'
                      }`
                    }
                  >
                    {n.icon}
                    <span className="flex-1">{n.label}</span>
                    {n.badge ? (
                      <span className="rounded-full bg-niat-maroon px-1.5 py-0.5 text-xs font-bold leading-none text-white" aria-label={`${n.badge} pending`}>
                        {n.badge}
                      </span>
                    ) : null}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-niat-line p-3 bg-white space-y-2">
          <div className="flex items-center justify-between gap-2 rounded-xl border border-niat-line/70 bg-niat-warm-white px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-niat-text" title={user.email}>{user.name || user.email}</div>
              <div className="truncate text-xs text-niat-muted" title={roleLabel}>{roleLabel}</div>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="shrink-0 cursor-pointer rounded-lg border border-niat-line bg-white px-2.5 py-1 text-xs font-semibold text-niat-muted transition-colors hover:border-niat-maroon/30 hover:bg-niat-pink hover:text-niat-maroon"
              title="Sign out of admin session"
            >
              Sign Out
            </button>
          </div>

          {event?.publicPath && event.status !== 'completed' && (
            <div className="grid grid-cols-2 gap-1.5">
              <a href={event.publicPath} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-1 rounded-xl border border-niat-maroon/25 bg-white px-2 py-2 text-xs font-semibold text-niat-maroon hover:bg-niat-pink">
                Student page <span aria-hidden="true">↗</span>
              </a>
              <a href={`/gate/${event.id}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-1 rounded-xl bg-niat-maroon px-2 py-2 text-xs font-semibold text-white shadow-xs hover:bg-niat-maroon-dark">
                Gate kiosk <span aria-hidden="true">↗</span>
              </a>
            </div>
          )}
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between border-b border-niat-line bg-white px-4 py-2.5 md:hidden">
          <div className="flex gap-2 overflow-x-auto">
            {sections.flatMap((s) => s.items).map((n) => (
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
                {n.label}{n.badge ? ` (${n.badge})` : ''}
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
            <Outlet context={{ event, reload, selectEvent, user, refreshPending } satisfies AdminContext} />
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
      <h2 className="mt-3 text-xl font-bold text-niat-text">No event selected</h2>
      <p className="mt-1 text-sm text-niat-muted">Configure an event to view the live operations command center.</p>
      <NavLink to="/admin/setup" className="btn-primary mt-5">
        Create an event
      </NavLink>
    </div>
  );
}
