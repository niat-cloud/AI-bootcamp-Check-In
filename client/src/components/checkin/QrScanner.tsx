import { useEffect, useRef, useState } from 'react';

/** Hosts whose QR codes are our venue codes: this site, plus the live site (so its printed codes work on any copy). */
const OUR_HOSTS = new Set([window.location.host, 'niatai-bootcamp-check-in.vercel.app']);
const EVENT_PATH = /^\/[a-z0-9-]+\/[a-z0-9-]+(\/project)?\/?$/;

/** The in-app path a scanned code points to, or null if it isn't one of our venue QR codes. */
export function eventPathFromQr(text: string): string | null {
  try {
    const url = new URL(text.trim());
    if (!OUR_HOSTS.has(url.host) || !EVENT_PATH.test(url.pathname) || url.pathname.startsWith('/admin/')) return null;
    return url.pathname.replace(/\/$/, '') + url.search;
  } catch {
    return null;
  }
}

type BarcodeDetectorLike = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

/**
 * Full-screen camera that reads the venue QR code without leaving the page. Uses the browser's own
 * QR reader where there is one (Android Chrome) and a small JS decoder elsewhere (iPhone Safari),
 * which is loaded only when the scanner opens.
 */
export function QrScanner({ onResult, onClose }: { onResult: (path: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<'starting' | 'scanning' | 'blocked' | 'unsupported'>('starting');
  const [wrongCode, setWrongCode] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    let lastWrong = '';

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) return setStatus('unsupported');
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      } catch {
        return setStatus('blocked');
      }
      if (stopped) return stream.getTracks().forEach((t) => t.stop());
      const v = video.current!;
      v.srcObject = stream;
      await v.play().catch(() => {});
      setStatus('scanning');

      const Native = (window as unknown as { BarcodeDetector?: new (o: object) => BarcodeDetectorLike }).BarcodeDetector;
      const native = Native ? new Native({ formats: ['qr_code'] }) : null;
      const jsQR = native ? null : (await import('jsqr')).default;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      const read = async (): Promise<string | null> => {
        if (v.readyState < 2 || !v.videoWidth) return null;
        if (native) return (await native.detect(v).catch(() => []))[0]?.rawValue ?? null;
        // Decode a downscaled frame: plenty for a QR code and fast on older phones.
        const scale = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight));
        canvas.width = Math.round(v.videoWidth * scale);
        canvas.height = Math.round(v.videoHeight * scale);
        ctx!.drawImage(v, 0, 0, canvas.width, canvas.height);
        const img = ctx!.getImageData(0, 0, canvas.width, canvas.height);
        return jsQR!(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
      };

      const tick = async () => {
        if (stopped) return;
        const text = await read();
        if (text) {
          const path = eventPathFromQr(text);
          if (path) {
            navigator.vibrate?.(60);
            return onResult(path);
          }
          if (text !== lastWrong) { lastWrong = text; setWrongCode(true); }
        }
        frame = window.setTimeout(() => requestAnimationFrame(tick), 120);
      };
      tick();
    };
    start();

    return () => {
      stopped = true;
      clearTimeout(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onResult]);

  // Escape closes the scanner on desktops.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label="Scan the venue QR code" className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <video ref={video} playsInline muted className="absolute inset-0 h-full w-full object-cover" />

      {status === 'scanning' && (
        <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="relative h-64 w-64 rounded-[28px] shadow-[0_0_0_9999px_rgb(0_0_0/0.55)]">
            {['left-0 top-0 border-l-4 border-t-4 rounded-tl-[28px]', 'right-0 top-0 border-r-4 border-t-4 rounded-tr-[28px]',
              'left-0 bottom-0 border-l-4 border-b-4 rounded-bl-[28px]', 'right-0 bottom-0 border-r-4 border-b-4 rounded-br-[28px]'].map((c) => (
              <span key={c} className={`absolute h-12 w-12 border-white ${c}`} />
            ))}
            <span className="qr-scan-line absolute inset-x-5 h-0.5 rounded-full bg-white/80 shadow-[0_0_12px_2px_rgb(255_255_255/0.6)]" />
          </div>
        </div>
      )}

      <div className="relative flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))]">
        <span className="text-base font-bold">Scan the venue QR code</span>
        <button type="button" onClick={onClose} aria-label="Close scanner"
          className="grid h-11 w-11 place-items-center rounded-full bg-white/15 backdrop-blur focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>

      <div className="relative mt-auto px-6 pb-[max(2rem,env(safe-area-inset-bottom))] text-center">
        {status === 'starting' && <p className="text-[15px] text-white/85">Opening the camera…</p>}
        {status === 'scanning' && (
          <p role="status" className={`mx-auto max-w-[30ch] rounded-2xl px-4 py-3 text-[15px] font-semibold backdrop-blur ${wrongCode ? 'bg-[#A50925]/85' : 'bg-black/40'}`}>
            {wrongCode ? 'That’s not an AI Bootcamp check-in code. Find the QR code at the venue entrance.' : 'Point at the QR code at the entrance. It opens by itself.'}
          </p>
        )}
        {(status === 'blocked' || status === 'unsupported') && (
          <div className="mx-auto max-w-[32ch] rounded-2xl bg-white px-5 py-5 text-[var(--checkin-ink)]">
            <p className="text-lg font-extrabold">{status === 'blocked' ? 'Camera access is off' : 'Can’t open the camera here'}</p>
            <p className="mt-1.5 text-[15px] leading-relaxed text-[var(--checkin-muted)]">
              Open your phone’s <b>Camera</b> app and point it at the QR code instead, or choose your venue from the list.
            </p>
            <button type="button" onClick={onClose} className="checkin-cta mt-4">Back</button>
          </div>
        )}
      </div>
    </div>
  );
}
