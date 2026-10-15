import { useState } from 'react';
import { api, type AdminUser } from '../../lib/api';
import { AuthField, AuthFrame, FormAlert, passwordProblem } from './AuthFrame';

/** Shown on first sign-in with the default password, before anything else is reachable. */
export default function ChangePassword({ user, forced, onDone, onSignOut }: {
  user: AdminUser;
  forced?: boolean;
  onDone: (user: AdminUser) => void;
  onSignOut: () => void;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weak = next ? passwordProblem(next) : null;
  const mismatch = confirm.length > 0 && confirm !== next;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!current || !next || weak || next !== confirm) {
      setError(weak ?? (next !== confirm ? 'The new passwords do not match.' : 'Fill in every field.'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ user: AdminUser }>('/admin/auth/change-password', { body: { currentPassword: current, newPassword: next } });
      onDone(res.user);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <AuthFrame
      title="Set a new password"
      subtitle={forced ? `Welcome, ${user.name || user.email}. Replace the default password before you continue.` : 'Choose a new password for your account.'}
      footer={<button type="button" onClick={onSignOut} className="cursor-pointer hover:text-niat-maroon">Sign out</button>}
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <FormAlert>{error}</FormAlert>}
        <AuthField label="Current password">
          <input className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </AuthField>
        <AuthField label="New password" hint={weak ?? 'At least 8 characters, with letters and numbers.'}>
          <input className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />
        </AuthField>
        <AuthField label="Confirm new password" hint={mismatch ? 'Does not match yet.' : undefined}>
          <input className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </AuthField>
        <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? 'Saving…' : 'Save Password'}</button>
      </form>
    </AuthFrame>
  );
}
