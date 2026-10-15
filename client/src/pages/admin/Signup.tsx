import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { AuthField, AuthFrame, FormAlert, passwordProblem } from './AuthFrame';

interface PublicLocation { id: number; name: string; city: string; state: string }

/** A new location admin asks for access. Nothing is unlocked until the super admin approves it. */
export default function Signup() {
  const [locations, setLocations] = useState<PublicLocation[] | null>(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', locationId: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api<PublicLocation[]>('/public/locations').then(setLocations).catch(() => setLocations([]));
  }, []);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [key]: e.target.value });

  const weak = form.password ? passwordProblem(form.password) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = form.name.trim().length < 2 ? 'Enter your full name.'
      : !/^\S+@\S+\.\S+$/.test(form.email.trim()) ? 'Enter a valid email address.'
      : passwordProblem(form.password)
        ?? (!form.locationId ? 'Choose the location you will manage.' : null);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api('/admin/auth/signup', { body: { ...form, locationId: Number(form.locationId) } });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AuthFrame title="Request sent" subtitle="The super admin will review it shortly."
        footer={<Link to="/admin" className="hover:text-niat-maroon">← Back to sign in</Link>}>
        <FormAlert tone="success">
          Thanks, {form.name.trim().split(/\s+/)[0]}. Once your request is approved you can sign in with {form.email.trim()} and the password you chose.
        </FormAlert>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      title="Request admin access"
      subtitle="For location admins running AI Bootcamp events."
      footer={<>Already approved? <Link to="/admin" className="font-bold text-niat-maroon hover:underline">Sign in</Link></>}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <FormAlert>{error}</FormAlert>}
        <AuthField label="Full name">
          <input className="input" value={form.name} onChange={set('name')} autoComplete="name" maxLength={100} required />
        </AuthField>
        <AuthField label="Work email">
          <input className="input" type="email" value={form.email} onChange={set('email')} autoComplete="email" spellCheck={false} maxLength={200} required />
        </AuthField>
        <AuthField label="Password" hint={weak ?? 'At least 8 characters, with letters and numbers.'}>
          <input className="input" type="password" value={form.password} onChange={set('password')} autoComplete="new-password" required />
        </AuthField>
        <AuthField label="Location you will manage">
          <select className="input" value={form.locationId} onChange={set('locationId')} required disabled={!locations}>
            <option value="">{locations ? 'Choose a location…' : 'Loading locations…'}</option>
            {locations?.map((l) => (
              <option key={l.id} value={l.id}>{l.name}{l.state ? ` · ${l.state}` : ''}</option>
            ))}
          </select>
        </AuthField>
        {locations?.length === 0 && (
          <p className="text-xs text-niat-muted">No locations are open yet. Ask the super admin to add yours first.</p>
        )}
        <AuthField label="Note for the super admin (optional)">
          <textarea className="input min-h-20" value={form.note} onChange={set('note')} maxLength={500}
            placeholder="e.g. I run the Madhapur campus events" />
        </AuthField>
        <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? 'Sending…' : 'Send Request'}</button>
      </form>
    </AuthFrame>
  );
}
