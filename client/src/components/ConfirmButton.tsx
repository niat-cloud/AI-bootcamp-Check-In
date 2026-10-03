import { useState } from 'react';

/** Two-step button: first click asks "Are you sure?", second click runs the action. */
export default function ConfirmButton({ className, children, confirmText, onConfirm, disabled }: {
  className: string;
  children: React.ReactNode;
  confirmText: string;
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!asking) {
    return <button className={className} disabled={disabled} onClick={() => setAsking(true)}>{children}</button>;
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
      {confirmText}
      <button className={className} disabled={busy} onClick={async () => {
        setBusy(true);
        try { await onConfirm(); } finally { setBusy(false); setAsking(false); }
      }}>{busy ? 'Working…' : 'Yes, continue'}</button>
      <button className="btn-secondary" disabled={busy} onClick={() => setAsking(false)}>Cancel</button>
    </span>
  );
}
