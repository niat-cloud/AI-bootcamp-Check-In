import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api, type LocationInfo } from '../../lib/api';
import { PageHeader, useAdmin } from './AdminLayout';
import { Icons } from './kit';

const slugify = (text: string) => text.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

interface Draft { id?: number; name: string; city: string; state: string; slug: string; isActive: boolean; live?: number }

const blank: Draft = { name: '', city: '', state: '', slug: '', isActive: true };

/** Super admin: the places AI Bootcamp runs. Each one's link name starts every event URL there. */
export default function Locations() {
  const { user } = useAdmin();
  const [locations, setLocations] = useState<LocationInfo[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = () => api<LocationInfo[]>('/platform/locations').then(setLocations);
  useEffect(() => { load(); }, []);

  if (user.role !== 'super_admin') return <Navigate to="/admin/overview" replace />;

  const edit = (l?: LocationInfo) => {
    setDraft(l ? { id: l.id, name: l.name, city: l.city, state: l.state, slug: l.slug, isActive: l.isActive, live: l.liveCount } : blank);
    setSlugTouched(Boolean(l));
    setError(null);
    setMessage(null);
  };

  const set = (key: keyof Draft, value: string | boolean) => {
    if (!draft) return;
    const next = { ...draft, [key]: value };
    if (key === 'name' && !slugTouched) next.slug = slugify(String(value));
    if (key === 'slug') setSlugTouched(true);
    setDraft(next);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const body = { name: draft.name, city: draft.city, state: draft.state, slug: draft.slug, isActive: draft.isActive };
      if (draft.id) await api(`/platform/locations/${draft.id}`, { method: 'PATCH', body });
      else await api('/platform/locations', { body });
      setMessage(`${draft.name} saved.`);
      setDraft(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Locations" subtitle="Cities and campuses where AI Bootcamp runs. Location admins can only see and manage their own."
        actions={<button className="btn-primary" onClick={() => edit()}>+ Add Location</button>} />

      {message && <p className="mb-4 text-sm font-semibold text-emerald-700" role="status">{message}</p>}

      {draft && (
        <form onSubmit={save} className="card mb-6" noValidate>
          <h2 className="text-lg font-semibold">{draft.id ? `Edit ${draft.name || 'location'}` : 'New location'}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label><span className="label">Name</span>
              <input className="input" value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="Hyderabad – Madhapur" maxLength={80} required autoFocus />
            </label>
            <label><span className="label">City</span>
              <input className="input" value={draft.city} onChange={(e) => set('city', e.target.value)} placeholder="Hyderabad" maxLength={80} />
            </label>
            <label><span className="label">State</span>
              <input className="input" value={draft.state} onChange={(e) => set('state', e.target.value)} placeholder="Telangana" maxLength={80} />
            </label>
            <label><span className="label">Link name</span>
              <input className="input font-mono" value={draft.slug} spellCheck={false} maxLength={60}
                onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} disabled={Boolean(draft.live)} />
              <span className="mt-1 block text-xs text-niat-muted">
                {draft.live ? 'Locked while an event here is live.' : <>Event links: <code>{window.location.host}/{draft.slug || 'link-name'}/18-oct-2026</code></>}
              </span>
            </label>
          </div>
          {draft.id && (
            <label className="mt-4 flex w-fit cursor-pointer items-center gap-2.5 text-sm font-medium">
              <input type="checkbox" className="h-4 w-4 accent-[#A7191E]" checked={draft.isActive} onChange={(e) => set('isActive', e.target.checked)} />
              Active (new events and admin requests can use it)
            </label>
          )}
          {draft.id && draft.slug !== locations?.find((l) => l.id === draft.id)?.slug && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Changing the link name changes the link of every event here. QR codes already printed for upcoming events will stop working.
            </p>
          )}
          {error && <p className="mt-3 text-sm font-semibold text-niat-maroon" role="alert">{error}</p>}
          <div className="mt-5 flex gap-2">
            <button type="submit" className="btn-primary" disabled={busy || !draft.name.trim()}>{busy ? 'Saving…' : draft.id ? 'Save Location' : 'Add Location'}</button>
            <button type="button" className="btn-secondary" onClick={() => setDraft(null)} disabled={busy}>Cancel</button>
          </div>
        </form>
      )}

      {locations === null ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-2xl bg-white shadow-[var(--shadow-card)]" />)}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {locations.map((l) => (
            <article key={l.id}
              className={`flex flex-col rounded-2xl border bg-white p-4 shadow-[var(--shadow-card)] ${l.isActive ? 'border-niat-line' : 'border-dashed border-stone-300 opacity-80'}`}>
              <div className="flex items-start gap-3">
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-lg font-extrabold ${l.isActive ? 'bg-niat-maroon text-white' : 'bg-stone-200 text-stone-600'}`} aria-hidden="true">
                  {l.name.trim()[0]?.toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="truncate font-bold text-niat-text">{l.name}</h3>
                    {l.liveCount
                      ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />Live</span>
                      : l.isActive
                        ? <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-niat-muted">Active</span>
                        : <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-niat-muted">Disabled</span>}
                  </div>
                  <p className="truncate text-[13px] text-niat-muted">{[l.city, l.state].filter(Boolean).join(', ') || 'No city set'}</p>
                  <code className="mt-1 inline-block rounded-md bg-niat-warm-white px-1.5 py-0.5 font-mono text-[11.5px] text-niat-muted">/{l.slug}</code>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-3 divide-x divide-niat-line rounded-xl border border-niat-line bg-niat-warm-white/60 text-center">
                {([['Events', l.eventCount ?? 0], ['Live', l.liveCount ?? 0], ['Admins', l.adminCount ?? 0]] as const).map(([k, v]) => (
                  <div key={k} className="py-2">
                    <dd className="text-lg font-bold tabular-nums text-niat-text">{v}</dd>
                    <dt className="text-[11px] font-semibold uppercase tracking-wider text-niat-muted">{k}</dt>
                  </div>
                ))}
              </dl>
              <div className="mt-3 flex justify-end">
                <button className="btn-secondary py-1.5 text-sm" onClick={() => edit(l)}>Edit</button>
              </div>
            </article>
          ))}
          <button type="button" onClick={() => edit()}
            className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-niat-line text-sm font-semibold text-niat-muted transition-colors hover:border-niat-maroon/40 hover:bg-niat-pink/30 hover:text-niat-maroon">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-white shadow-sm">{Icons.plus}</span>
            Add a location
          </button>
        </div>
      )}
    </div>
  );
}
