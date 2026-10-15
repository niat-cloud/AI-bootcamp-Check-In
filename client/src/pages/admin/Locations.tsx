import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api, type LocationInfo } from '../../lib/api';
import { PageHeader, useAdmin } from './AdminLayout';

const slugify = (text: string) => text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
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

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-niat-line bg-niat-warm-white text-niat-muted">
            <tr>
              <th className="px-4 py-3">Location</th><th className="px-3">Link name</th><th className="px-3 text-right">Events</th>
              <th className="px-3 text-right">Admins</th><th className="px-3">Status</th><th className="px-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {locations?.map((l) => (
              <tr key={l.id} className="border-b border-niat-line/60">
                <td className="px-4 py-3">
                  <div className="font-semibold">{l.name}</div>
                  <div className="text-xs text-niat-muted">{[l.city, l.state].filter(Boolean).join(', ') || '—'}</div>
                </td>
                <td className="px-3 font-mono text-xs">/{l.slug}</td>
                <td className="px-3 text-right tabular-nums">{l.eventCount}{l.liveCount ? <span className="ml-1 text-xs font-bold text-emerald-700">({l.liveCount} live)</span> : null}</td>
                <td className="px-3 text-right tabular-nums">{l.adminCount}</td>
                <td className="px-3">
                  {l.isActive
                    ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Active</span>
                    : <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold text-niat-muted">Disabled</span>}
                </td>
                <td className="px-3 text-right"><button className="font-semibold text-niat-maroon hover:underline" onClick={() => edit(l)}>Edit</button></td>
              </tr>
            ))}
            {locations === null && <tr><td colSpan={6} className="px-4 py-8 text-center text-niat-muted">Loading…</td></tr>}
            {locations?.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-niat-muted">No locations yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
