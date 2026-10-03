import { useEffect, useState } from 'react';

const MOBILE_QUERY = '(max-width: 767px)';

/** True on phone-sized screens. Students use their own phones; volunteers use the gate laptop. */
export function useIsMobile() {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return mobile;
}

export function vibrate(pattern: number | number[]) {
  try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
}

// A student's own phone remembers their seat, so reopening the page shows it straight away.
const seatKey = (eventId: number) => `aibootcamp.myseat.${eventId}`;

export function rememberSeat(eventId: number, eventParticipantId: number) {
  try { localStorage.setItem(seatKey(eventId), String(eventParticipantId)); } catch { /* storage unavailable */ }
}

export function recallSeat(eventId: number): number | null {
  try {
    const v = localStorage.getItem(seatKey(eventId));
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

export function forgetSeat(eventId: number) {
  try { localStorage.removeItem(seatKey(eventId)); } catch { /* storage unavailable */ }
}

/** Resolve `work`, but never sooner than `ms` — lets a short animation finish without slowing slow requests. */
export async function atLeast<T>(work: Promise<T>, ms: number): Promise<T> {
  const [result] = await Promise.all([work, new Promise((r) => setTimeout(r, ms))]);
  return result;
}
