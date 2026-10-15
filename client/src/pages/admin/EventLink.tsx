import { useEffect, useState } from 'react';
import { publicUrl, type EventInfo } from '../../lib/api';

/**
 * The event's public link and QR code, ready to print at the entrance. The QR library loads on demand
 * so it never weighs down the student pages.
 */
export function EventLink({ event }: { event: EventInfo }) {
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const url = event.publicPath ? publicUrl(event.publicPath) : null;

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    import('qrcode')
      .then((QR) => QR.toDataURL(url, { width: 720, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#191919', light: '#FFFFFF' } }))
      .then((data) => { if (!cancelled) setQr(data); })
      .catch(() => { if (!cancelled) setQr(null); });
    return () => { cancelled = true; };
  }, [url]);

  if (!url) {
    return (
      <div className="card mb-6 text-sm text-niat-muted">
        Choose a location and save the event to get its public link and QR code.
      </div>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked: the link is selectable */
    }
  };

  const fileName = `qr-${event.locationSlug}-${event.slug}.png`;

  return (
    <div className="card mb-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="mx-auto shrink-0 rounded-2xl border border-niat-line bg-white p-2 sm:mx-0">
          {qr
            ? <img src={qr} alt={`QR code for ${url}`} width={152} height={152} className="h-38 w-38" />
            : <div className="grid h-38 w-38 place-items-center text-xs text-niat-muted">Making QR…</div>}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">Student check-in link</h2>
          <p className="mt-1 text-sm text-niat-muted">
            Print the QR code at the entrance. Students scan it, enter their phone number, confirm their details and get their seat.
            {event.status === 'draft' && ' The page shows "check-in opens soon" until you activate the event.'}
          </p>
          <div className="mt-3 flex min-w-0 items-center gap-2 rounded-xl border border-niat-line bg-niat-warm-white px-3 py-2">
            <span className="min-w-0 flex-1 truncate font-mono text-sm text-niat-text" title={url}>{url}</span>
            <button type="button" onClick={copy} className="shrink-0 cursor-pointer text-xs font-bold text-niat-maroon hover:underline">
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {qr && <a className="btn-primary py-2 text-sm" href={qr} download={fileName}>Download QR (PNG)</a>}
            <a className="btn-secondary py-2 text-sm" href={event.publicPath!} target="_blank" rel="noopener noreferrer">Open Student Page ↗</a>
            {event.status !== 'completed' && (
              <a className="btn-secondary py-2 text-sm" href={`/gate/${event.id}`} target="_blank" rel="noopener noreferrer">Open Gate Kiosk ↗</a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
