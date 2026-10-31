import { useEffect, useState } from 'react';
import { clock, type ProjectRoom } from './types';

/**
 * Full-screen view for the classroom TV or projector: the room's submission QR code, a live count of
 * teams that have submitted, and the deadline. Esc or the close button returns to the admin page.
 */
export function Present({ room, url, onClose }: { room: ProjectRoom; url: string; onClose: () => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let cancelled = false;
    import('qrcode')
      .then((QR) => QR.toDataURL(url, { width: 900, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#191919', light: '#FFFFFF' } }))
      .then((data) => { if (!cancelled) setQr(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [url]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5_000);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.documentElement.requestFullscreen?.().catch(() => {});
    return () => {
      clearInterval(t);
      window.removeEventListener('keydown', onKey);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, [onClose]);

  const left = room.deadline ? Math.ceil((new Date(room.deadline).getTime() - now) / 60_000) : null;
  const pct = room.teamCount ? Math.round((room.submittedCount / room.teamCount) * 100) : 0;

  return (
    <div className="niat-backdrop fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 p-6 text-center">
      <button type="button" onClick={onClose} className="btn-secondary absolute right-4 top-4 py-1.5 text-sm">Close (Esc)</button>
      <div>
        <div className="eyebrow">AI Bootcamp · Project submission</div>
        <h1 className="mt-2 text-[clamp(2rem,5vw,4rem)] font-extrabold leading-none tracking-tight">{room.name}</h1>
      </div>
      <div className="flex flex-col items-center gap-8 lg:flex-row lg:gap-14">
        <div className="rounded-3xl bg-white p-4 shadow-[var(--shadow-lift)]">
          {qr
            ? <img src={qr} alt={`QR code for ${url}`} className="h-[min(56vh,56vw)] w-[min(56vh,56vw)]" />
            : <div className="grid h-[min(56vh,56vw)] w-[min(56vh,56vw)] place-items-center text-niat-muted">Making QR…</div>}
        </div>
        <div className="max-w-md text-left">
          <ol className="space-y-3 text-[clamp(1.1rem,1.8vw,1.6rem)] font-bold">
            <li>1. Scan with your phone camera</li>
            <li>2. Tap your team number</li>
            <li>3. Tap your name, paste your Lovable link</li>
          </ol>
          <div className="mt-8">
            <div className="flex items-baseline justify-between text-[clamp(1rem,1.6vw,1.4rem)] font-bold">
              <span>Teams submitted</span>
              <span className="tabular-nums">{room.submittedCount}/{room.teamCount}</span>
            </div>
            <div className="mt-2 h-4 overflow-hidden rounded-full bg-white ring-1 ring-niat-line">
              <div className="h-full rounded-full bg-emerald-600 transition-[width] duration-700" style={{ width: `${pct}%` }} />
            </div>
          </div>
          {room.status !== 'open' ? (
            <p className="mt-6 rounded-2xl bg-niat-pink px-4 py-3 text-lg font-bold text-niat-maroon">
              {room.status === 'closed' ? 'Submissions are closed.' : 'Submissions open soon.'}
            </p>
          ) : room.deadline && left !== null && (
            <p className={`mt-6 rounded-2xl px-4 py-3 text-[clamp(1.1rem,1.8vw,1.6rem)] font-extrabold ${left > 0 ? 'bg-niat-cream' : 'bg-niat-pink text-niat-maroon'}`}>
              {left > 0 ? `Submit by ${clock(room.deadline)} · ${left} min left` : 'Time’s up. Submit now!'}
            </p>
          )}
          <p className="mt-6 break-all font-mono text-sm text-niat-muted">{url}</p>
        </div>
      </div>
    </div>
  );
}
