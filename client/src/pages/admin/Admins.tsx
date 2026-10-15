import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api, type LocationInfo } from '../../lib/api';
import { PageHeader, useAdmin } from './AdminLayout';

interface AdminRow {
  id: number;
  email: string;
  name: string;
  role: 'super_admin' | 'location_admin';
  status: 'pending' | 'approved' | 'rejected' | 'disabled';
  requestNote: string | null;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  lastLoginAt: string | null;
  requestedLocation: { id: number; name: string } | null;
  locations: { id: number; name: string }[];
}

const when = (iso: string | null) => iso
  ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  : '—';

const statusStyle: Record<AdminRow['status'], string> = {
  pending: 'bg-amber-50 text-amber-800',
  approved: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-stone-100 text-niat-muted',
  disabled: 'bg-niat-pink text-niat-maroon',
};

/** Super admin: approve access requests, assign locations, and switch accounts off. */
export default function Admins() {
  const { user, refreshPending } = useAdmin();
  const [admins, setAdmins] = useState<AdminRow[] | null>(null);
  const [locations, setLocations] = useState<LocationInfo[]>([]);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () => api<AdminRow[]>('/platform/admins').then(setAdmins);
  useEffect(() => {
    load();
    api<LocationInfo[]>('/platform/locations').then(setLocations).catch(() => {});
  }, []);

  if (user.role !== 'super_admin') return <Navigate to="/admin/overview" replace />;

  const update = async (admin: AdminRow, body: object, success: string) => {
    setMessage(null);
    try {
      await api(`/platform/admins/${admin.id}`, { method: 'PATCH', body });
      setMessage({ ok: true, text: success });
      await load();
      refreshPending();
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    }
  };

  const pending = admins?.filter((a) => a.status === 'pending') ?? [];
  const others = admins?.filter((a) => a.status !== 'pending') ?? [];

  return (
    <div>
      <PageHeader title="Admins" subtitle="Location admins request access from the sign-in page. Approve them and choose the locations they manage." />
      {message && (
        <p className={`mb-4 text-sm font-semibold ${message.ok ? 'text-emerald-700' : 'text-niat-maroon'}`} role={message.ok ? 'status' : 'alert'}>{message.text}</p>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-bold">Waiting for approval {pending.length > 0 && <span className="text-niat-maroon">({pending.length})</span>}</h2>
        {admins === null ? (
          <div className="card text-niat-muted">Loading…</div>
        ) : pending.length === 0 ? (
          <div className="card text-sm text-niat-muted">No pending requests. New requests appear here when someone uses “Request access” on the sign-in page.</div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {pending.map((a) => <PendingCard key={a.id} admin={a} locations={locations} onDecide={update} />)}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">All admins</h2>
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-niat-line bg-niat-warm-white text-niat-muted">
              <tr>
                <th className="px-4 py-3">Admin</th><th className="px-3">Role</th><th className="px-3">Locations</th>
                <th className="px-3">Status</th><th className="px-3">Last sign-in</th><th className="px-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {others.map((a) => (
                <AdminTableRow key={a.id} admin={a} self={a.id === user.id} locations={locations} onUpdate={update} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

type Update = (admin: AdminRow, body: object, success: string) => Promise<void>;

function LocationPicker({ locations, value, onChange }: { locations: LocationInfo[]; value: number[]; onChange: (ids: number[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {locations.map((l) => {
        const on = value.includes(l.id);
        return (
          <label key={l.id} className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
            on ? 'border-niat-maroon bg-niat-pink text-niat-maroon' : 'border-niat-line text-niat-muted hover:border-niat-maroon/40'}`}>
            <input type="checkbox" className="sr-only" checked={on}
              onChange={(e) => onChange(e.target.checked ? [...value, l.id] : value.filter((id) => id !== l.id))} />
            {on ? '✓ ' : ''}{l.name}
          </label>
        );
      })}
      {locations.length === 0 && <span className="text-xs text-niat-muted">Add a location first.</span>}
    </div>
  );
}

function PendingCard({ admin, locations, onDecide }: { admin: AdminRow; locations: LocationInfo[]; onDecide: Update }) {
  const [chosen, setChosen] = useState<number[]>(admin.requestedLocation ? [admin.requestedLocation.id] : []);
  const [busy, setBusy] = useState(false);
  const run = async (body: object, text: string) => {
    setBusy(true);
    await onDecide(admin, body, text);
    setBusy(false);
  };
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-bold">{admin.name || '—'}</div>
          <div className="truncate text-sm text-niat-muted">{admin.email}</div>
        </div>
        <span className="shrink-0 text-xs text-niat-muted">{when(admin.createdAt)}</span>
      </div>
      <p className="mt-3 text-sm">Asked to manage <strong>{admin.requestedLocation?.name ?? 'a location'}</strong></p>
      {admin.requestNote && <p className="mt-1 rounded-lg bg-niat-warm-white px-3 py-2 text-sm italic text-niat-muted">“{admin.requestNote}”</p>}
      <div className="mt-4">
        <div className="label">Give access to</div>
        <LocationPicker locations={locations} value={chosen} onChange={setChosen} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn-success py-1.5 text-sm" disabled={busy || chosen.length === 0}
          onClick={() => run({ status: 'approved', locationIds: chosen }, `${admin.name || admin.email} approved.`)}>
          Approve
        </button>
        <button className="btn-secondary py-1.5 text-sm" disabled={busy}
          onClick={() => run({ status: 'rejected' }, `${admin.name || admin.email}'s request was rejected.`)}>
          Reject
        </button>
      </div>
    </div>
  );
}

function AdminTableRow({ admin, self, locations, onUpdate }: { admin: AdminRow; self: boolean; locations: LocationInfo[]; onUpdate: Update }) {
  const [editing, setEditing] = useState(false);
  const [chosen, setChosen] = useState<number[]>(admin.locations.map((l) => l.id));
  const label = admin.name || admin.email;
  return (
    <tr className="border-b border-niat-line/60 align-top">
      <td className="px-4 py-3">
        <div className="font-semibold">{admin.name || '—'}{self && <span className="ml-1.5 text-xs font-normal text-niat-muted">(you)</span>}</div>
        <div className="text-xs text-niat-muted">{admin.email}</div>
      </td>
      <td className="px-3 py-3">{admin.role === 'super_admin' ? <strong className="text-niat-maroon">Super admin</strong> : 'Location admin'}</td>
      <td className="px-3 py-3">
        {admin.role === 'super_admin' ? (
          <span className="text-niat-muted">All locations</span>
        ) : editing ? (
          <div className="space-y-2">
            <LocationPicker locations={locations} value={chosen} onChange={setChosen} />
            <div className="flex gap-2">
              <button className="btn-primary py-1 text-xs" disabled={chosen.length === 0 && admin.status === 'approved'}
                onClick={async () => { await onUpdate(admin, { locationIds: chosen }, `${label}'s locations updated.`); setEditing(false); }}>Save</button>
              <button className="btn-secondary py-1 text-xs" onClick={() => { setChosen(admin.locations.map((l) => l.id)); setEditing(false); }}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="cursor-pointer text-left hover:text-niat-maroon" onClick={() => setEditing(true)} title="Change locations">
            {admin.locations.map((l) => l.name).join(', ') || <span className="text-niat-muted">None</span>} <span className="text-xs text-niat-maroon">✎</span>
          </button>
        )}
      </td>
      <td className="px-3 py-3">
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${statusStyle[admin.status]}`}>{admin.status}</span>
        {admin.decidedBy && <div className="mt-1 text-[11px] text-niat-muted">by {admin.decidedBy}</div>}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-niat-muted">{when(admin.lastLoginAt)}</td>
      <td className="whitespace-nowrap px-3 py-3 text-right">
        {!self && admin.status === 'approved' && (
          <button className="font-semibold text-niat-maroon hover:underline" onClick={() => onUpdate(admin, { status: 'disabled' }, `${label} can no longer sign in.`)}>Disable</button>
        )}
        {!self && (admin.status === 'disabled' || admin.status === 'rejected') && (
          <button className="font-semibold text-emerald-700 hover:underline"
            onClick={() => onUpdate(admin, { status: 'approved' }, `${label} can sign in again.`)}>
            {admin.status === 'rejected' ? 'Approve' : 'Enable'}
          </button>
        )}
      </td>
    </tr>
  );
}
