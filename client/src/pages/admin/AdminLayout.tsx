import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useOutletContext } from 'react-router-dom';
import logo from '../../assets/niat-logo.png';
import { api, checkAdminAuth, formatDate, logoutAdmin, type AdminUser, type EventInfo } from '../../lib/api';
import ChangePassword from './ChangePassword';
import { EmptyState, Icons } from './kit';
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

/** The NIAT shield, cut from the full logo, with the product name beside it. */
function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`block shrink-0 overflow-hidden ${compact ? 'h-8 w-[25px]' : 'h-10 w-[31px]'}`}>
        <img src={logo} alt="NIAT" className="block h-full w-auto max-w-none" />
      </span>
      <span className="min-w-0 leading-tight">
        <span className={`block font-extrabold tracking-tight text-niat-text ${compact ? 'text-sm' : 'text-[15px]'}`}>AI Bootcamp</span>
        <span className="block text-[10.5px] font-bold uppercase tracking-[0.16em] text-niat-maroon">Admin console</span>
      </span>
    </div>
  );
}

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
    title: 'Event',
    items: [
      {
        to: '/admin',
        label: 'Dashboard',
        end: true,
        icon: (
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
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
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        ),
      },
      {
        to: '/admin/participants',
        label: 'Participants',
        icon: (
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        ),
      },
      {
        to: '/admin/import',
        label: 'Import Participants',
        icon: (
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        ),
      },
    ],
  },
  {
    title: 'Operations',
    items: [
      {
        to: '/admin/teams',
        label: 'Rooms & Teams',
        icon: (
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        ),
      },
      {
        to: '/admin/projects',
        label: 'Projects',
        icon: (
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 21h8m-4-4v4m-5-17h10v5a5 5 0 01-10 0V4zM7 6H4v1a3 3 0 003 3m10-4h3v1a3 3 0 01-3 3" />
          </svg>
        ),
      },
      {
        to: '/admin/export',
        label: 'Export',
        icon: (
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        ),
      },
    ],
  },
  {
    title: 'Events',
    items: [
      {
        to: '/admin/events',
        label: 'All Events',
        icon: (
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        ),
      },
    ],
  },
];

const platformIcon = (
  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h4l3 8 4-16 3 8h4" />
  </svg>
);
const locationIcon = (
  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s-7-6.2-7-11.5A7 7 0 0112 2.5a7 7 0 017 7C19 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </svg>
);
const adminsIcon = (
  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
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
  return { title: 'Platform', items };
}

export default function AdminLayout() {
  const { pathname } = useLocation();
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
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#F7F6F3] text-xs font-semibold text-niat-muted">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-niat-maroon/20 border-t-niat-maroon" aria-hidden="true" />
        Checking your session…
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
    <div className="flex min-h-screen bg-[#F7F6F3]">
      <a href="#admin-main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-niat-maroon focus:shadow-lg">
        Skip to content
      </a>
      {/* Laptop-first sidebar: everything fits in 768px of height without scrolling. */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-niat-line bg-white md:flex">
        <div className="px-4 pb-4 pt-5">
          <Brand />
        </div>

        {/* The current event doubles as the event switcher. */}
        <div className="px-3 pb-2">
          {event ? (
            <NavLink to="/admin/events" title="Switch event"
              className="group block rounded-xl border border-niat-line bg-niat-warm-white px-3 py-2 transition-colors hover:border-niat-maroon/30 hover:bg-niat-pink/40">
              <div className="flex items-start justify-between gap-2">
                <span className="line-clamp-2 text-[13px] font-semibold leading-snug text-niat-text" title={event.name}>{event.name}</span>
                <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-px text-[11px] font-semibold ${statusBadge[event.status]}`}>
                  {event.status === 'active' && <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" aria-hidden="true" />}
                  {event.status === 'active' ? 'Live' : event.status === 'draft' ? 'Draft' : 'Done'}
                </span>
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-niat-muted">
                <span className="truncate">{event.locationName && <>{event.locationName} · </>}{formatDate(event.date)}</span>
                <span className="shrink-0 font-semibold text-niat-maroon opacity-0 transition-opacity group-hover:opacity-100">Switch</span>
              </div>
            </NavLink>
          ) : loaded ? (
            <NavLink to="/admin/setup" className="block rounded-xl border border-dashed border-niat-line px-3 py-2 text-[13px] text-niat-muted hover:text-niat-maroon">
              No event selected · Create one
            </NavLink>
          ) : null}
        </div>

        <nav className="flex-1 space-y-3 overflow-y-auto px-3 pb-3 pt-1" aria-label="Admin">
          {sections.map((section) => (
            <div key={section.title}>
              <div className="px-2.5 pb-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-niat-muted/70">{section.title}</div>
              <div className="space-y-px">
                {section.items.map((n) => (
                  <NavLink key={n.to} to={n.to} end={n.end}
                    className={({ isActive }) =>
                      `relative flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] transition-colors ${
                        isActive
                          ? 'bg-niat-pink/80 font-semibold text-niat-maroon before:absolute before:inset-y-1.5 before:-left-3 before:w-[3px] before:rounded-r before:bg-niat-maroon'
                          : 'font-medium text-niat-muted hover:bg-stone-100 hover:text-niat-text'
                      }`
                    }>
                    {n.icon}
                    <span className="flex-1 truncate">{n.label}</span>
                    {n.badge ? (
                      <span className="rounded-full bg-niat-maroon px-1.5 py-0.5 text-[11px] font-bold leading-none text-white" aria-label={`${n.badge} pending`}>
                        {n.badge}
                      </span>
                    ) : null}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="space-y-2 border-t border-niat-line p-3">
          {event?.publicPath && event.status !== 'completed' && (
            <div className="grid grid-cols-2 gap-1.5">
              <a href={event.publicPath} target="_blank" rel="noopener noreferrer"
                className="flex h-8 items-center justify-center gap-1 rounded-lg border border-niat-line bg-white text-xs font-semibold text-niat-text hover:border-niat-maroon/30 hover:text-niat-maroon">
                Student page <span aria-hidden="true">↗</span>
              </a>
              <a href={`/gate/${event.id}`} target="_blank" rel="noopener noreferrer"
                className="flex h-8 items-center justify-center gap-1 rounded-lg bg-niat-maroon text-xs font-semibold text-white hover:bg-niat-maroon-dark">
                Gate kiosk <span aria-hidden="true">↗</span>
              </a>
            </div>
          )}
          <div className="flex items-center gap-2.5 px-1">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-niat-pink text-xs font-bold text-niat-maroon" aria-hidden="true">
              {(user.name || user.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('')}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[13px] font-semibold text-niat-text" title={user.email}>{user.name || user.email}</div>
              <div className="truncate text-[11.5px] text-niat-muted" title={roleLabel}>{roleLabel}</div>
            </div>
            <button type="button" onClick={handleSignOut} title="Sign out" aria-label="Sign out"
              className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-niat-muted transition-colors hover:bg-niat-pink hover:text-niat-maroon">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-30 border-b border-niat-line bg-white/95 backdrop-blur md:hidden">
          <div className="flex items-center justify-between px-4 pb-1.5 pt-2.5">
            <Brand compact />
            <button
              type="button"
              onClick={handleSignOut}
              className="shrink-0 cursor-pointer rounded-lg border border-niat-line bg-white px-2.5 py-1 text-xs font-bold text-niat-muted hover:text-niat-maroon"
            >
              Sign out
            </button>
          </div>
          <div className="flex gap-1.5 overflow-x-auto px-4 pb-2.5 [scrollbar-width:none]">
            {sections.flatMap((s) => s.items).map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    isActive ? 'border-niat-maroon bg-niat-maroon text-white' : 'border-niat-line bg-white text-niat-muted'
                  }`
                }
              >
                {n.label}{n.badge ? ` (${n.badge})` : ''}
              </NavLink>
            ))}
          </div>
        </div>

        <main id="admin-main" tabIndex={-1} className="mx-auto w-full max-w-[1440px] px-4 py-5 outline-none sm:px-6 lg:px-8 lg:py-6">
          {loaded ? (
            // Opacity only: a transform here would trap the pages' fixed drawers and dialogs.
            <div key={pathname} className="animate-fade-in">
              <Outlet context={{ event, reload, selectEvent, user, refreshPending } satisfies AdminContext} />
            </div>
          ) : (
            <AdminSkeleton />
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
  badge,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  /** Shown right after the title (a status pill). */
  badge?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[22px] font-bold leading-tight tracking-tight text-niat-text">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="mt-0.5 text-[13.5px] text-niat-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function NoEvent() {
  return (
    <EmptyState icon={Icons.calendar} title="No event selected"
      action={(
        <div className="flex flex-wrap justify-center gap-2">
          <NavLink to="/admin/setup" className="btn-primary">Create an event</NavLink>
          <NavLink to="/admin/events" className="btn-secondary">Pick an existing one</NavLink>
        </div>
      )}>
      Choose or create an event to see its check-ins, rooms and projects here.
    </EmptyState>
  );
}

/** Placeholder blocks in the page's shape while the first data loads. */
export function AdminSkeleton() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-56 rounded-lg bg-stone-200/70" />
      <div className="mt-2 h-4 w-80 max-w-full rounded bg-stone-200/50" />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-2xl bg-white shadow-[var(--shadow-card)]" />)}
      </div>
      <div className="mt-4 h-72 rounded-2xl bg-white shadow-[var(--shadow-card)]" />
    </div>
  );
}
