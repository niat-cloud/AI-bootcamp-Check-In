import { useEffect, useMemo, useRef, useState } from 'react';
import type { SeatAssignment } from '../../lib/api';
import { vibrate } from '../../lib/device';
import { CtaButton } from './CtaButton';
import { initials } from './Search';

const AUTO_RETURN_SECONDS = 20;
// The draw: the TEAM reel lands first, then the SEAT reel, then the celebration.
const TEAM_LANDS_MS = 1300;
const SEAT_LANDS_MS = 2100;
const pad = (n: number | null) => (n === null ? '—' : String(n).padStart(2, '0'));

/** "BHUTHKURI LAASYA" / "bhuthkuri laasya" → "Bhuthkuri Laasya"; names already in mixed case stay as typed. */
export function displayName(name: string): string {
  const n = name.trim().replace(/\s+/g, ' ');
  if (n !== n.toUpperCase() && n !== n.toLowerCase()) return n;
  return n.toLowerCase().replace(/(^|[\s.'-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** "10:00" → "10:00 AM". */
function clock(time?: string) {
  const m = time?.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

const shortDate = (iso?: string) => (iso
  ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  : null);

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

type Phase = 'spinning' | 'team-landed' | 'done';

export interface SeatEventInfo {
  locationName?: string | null;
  date?: string;
  time?: string;
}

/**
 * The seat moment, built for a phone screen. A first-time seat runs "the team draw": two reels shuffle
 * and land on the student's TEAM, then their SEAT, with a burst of light, confetti and a buzz, so
 * getting placed feels like winning. Then it shows how to get there (room → team → seat) and who is at
 * the table. Reopening it ("Welcome back") skips the draw. Tapping the card skips it too.
 *
 * `kiosk` mode (gate laptop): Next Student + auto-return. `personal` mode (student's phone): stays put.
 */
export function SeatReveal({ assignment, mode, onDone, event }: {
  assignment: SeatAssignment;
  mode: 'kiosk' | 'personal';
  onDone: () => void;
  event?: SeatEventInfo;
}) {
  const returning = assignment.alreadyAssigned;
  const [phase, setPhase] = useState<Phase>(() => (returning || prefersReducedMotion() ? 'done' : 'spinning'));
  const drew = useRef(phase !== 'done'); // this view ran the draw (celebrate at the end)
  const done = phase === 'done';
  const doneRef = useRef<HTMLButtonElement>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // The draw's timeline. Skipping jumps straight to 'done'.
  useEffect(() => {
    if (phase === 'done') return;
    const t1 = setTimeout(() => { setPhase('team-landed'); vibrate(18); }, TEAM_LANDS_MS);
    const t2 = setTimeout(() => setPhase('done'), SEAT_LANDS_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (done && drew.current) vibrate([30, 50, 90]);
  }, [done]);

  useEffect(() => {
    if (mode !== 'kiosk') return;
    doneRef.current?.focus({ preventScroll: true });
    const timer = setTimeout(() => onDoneRef.current(), AUTO_RETURN_SECONDS * 1000);
    return () => clearTimeout(timer);
  }, [mode]);

  const name = displayName(assignment.participant.name);
  const seatLetter = assignment.seatLabel ?? '—';
  const eventLine = [event?.locationName, shortDate(event?.date), clock(event?.time)].filter(Boolean).join(' · ');

  return (
    <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col items-center pb-4 pt-1 text-center sm:py-6">
      {!returning && <div className="aurora" aria-hidden />}
      {done && drew.current && <Confetti />}

      {/* Headline: what's happening now. */}
      <div className="relative z-10 w-full" aria-live="polite">
        {returning ? (
          <>
            <div className="eyebrow animate-fade-up">Your seat is safe</div>
            <h1 className="mt-2 animate-fade-up text-[30px] font-extrabold leading-tight tracking-tight sm:text-5xl">Welcome back 👋</h1>
          </>
        ) : done ? (
          <>
            <div className="eyebrow animate-fade-up">You’re in</div>
            <h1 key="won" className="mt-2 animate-seat-pop text-[30px] font-extrabold leading-tight tracking-tight sm:text-5xl">
              🎉 Welcome to {assignment.teamName ?? 'your team'}!
            </h1>
          </>
        ) : (
          <>
            <div className="eyebrow">The team draw</div>
            <h1 className="mt-2 text-[30px] font-extrabold leading-tight tracking-tight sm:text-5xl">
              {phase === 'spinning' ? 'Shuffling the teams…' : 'Picking your seat…'}
            </h1>
          </>
        )}
        <p className="mt-1 truncate text-base font-bold text-niat-muted sm:text-lg">{name}</p>
        {done && <p className="sr-only">{`${assignment.teamName}, seat ${seatLetter}, ${assignment.room}.`}</p>}
      </div>

      {/* The card: the reels land here and stay as the result. Tap to skip the draw. */}
      <div onClick={() => !done && setPhase('done')}
        className={`relative z-10 mt-4 w-full overflow-hidden rounded-[30px] border border-niat-line bg-white shadow-[var(--shadow-lift)] ${done ? '' : 'cursor-pointer'}`}>
        <div aria-hidden className="h-2 bg-gradient-to-r from-niat-maroon via-niat-maroon to-niat-gold" />
        <div className="flex items-center justify-between gap-2 px-5 pt-3.5 text-left">
          <span className="text-[11px] font-extrabold tracking-[0.18em] text-niat-maroon">AI BOOTCAMP</span>
          {eventLine && <span className="truncate text-[11px] font-semibold text-niat-muted">{eventLine}</span>}
        </div>

        <div className="relative px-5 pb-2 pt-4">
          {done && (
            <>
              <div className="seat-rays" aria-hidden />
              <Sparkles />
              {drew.current && <div className="win-flash" aria-hidden />}
            </>
          )}
          <div className="relative grid grid-cols-2 gap-3" aria-hidden={!done}>
            <ReelColumn label="Team">
              <Reel final={pad(assignment.teamNumber)} values={teamValues(assignment.teamNumber)}
                spinning={phase === 'spinning'} durationMs={TEAM_LANDS_MS} landed={phase !== 'spinning'} />
            </ReelColumn>
            <ReelColumn label="Seat">
              <Reel final={seatLetter} values={seatValues(assignment)}
                spinning={phase !== 'done'} durationMs={SEAT_LANDS_MS} landed={done} />
            </ReelColumn>
          </div>
          {done ? (
            <div className="relative mt-3 animate-fade-in text-xs font-semibold text-niat-muted">
              Seat code <span className="font-extrabold tracking-wider text-niat-text">{assignment.seatCode ?? '—'}</span>
            </div>
          ) : (
            <div className="relative mt-3 text-xs font-semibold text-niat-muted/80">Tap to skip</div>
          )}
        </div>

        {done && (
          <>
            {/* Ticket perforation */}
            <div className="relative my-2 flex items-center" aria-hidden>
              <span className="-ml-3 h-6 w-6 rounded-full bg-niat-warm-white ring-1 ring-niat-line" />
              <span className="mx-2 flex-1 border-t-2 border-dashed border-niat-line" />
              <span className="-mr-3 h-6 w-6 rounded-full bg-niat-warm-white ring-1 ring-niat-line" />
            </div>

            {/* Where to go, in walking order: room first, then the table, then the seat. */}
            <div className="animate-fade-up px-5 pb-5 pt-1 text-left">
              <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-niat-muted">How to find your seat</div>
              <ol className="mt-2 flex items-stretch gap-1.5">
                {[['Room', assignment.room ?? '—'], ['Table', assignment.teamName ?? '—'], ['Seat', seatLetter]].map(([label, value], i) => (
                  <li key={label} className="flex min-w-0 flex-1 items-center gap-1.5">
                    <div className={`min-w-0 flex-1 rounded-2xl px-2 py-2.5 text-center ${i === 0
                      ? 'bg-niat-maroon text-white shadow-[var(--shadow-soft)]' : 'bg-niat-warm-white text-niat-text ring-1 ring-niat-line/80'}`}>
                      <div className={`text-[10px] font-bold uppercase tracking-wider ${i === 0 ? 'text-niat-gold-light' : 'text-niat-muted'}`}>
                        {i + 1} · {label}
                      </div>
                      <div className="mt-0.5 truncate text-base font-extrabold">{value}</div>
                    </div>
                    {i < 2 && <span aria-hidden className="shrink-0 text-sm font-bold text-niat-muted/70">→</span>}
                  </li>
                ))}
              </ol>
            </div>
          </>
        )}
      </div>

      {done && <YourTable assignment={assignment} />}

      {done && (
        <p className="relative z-10 mt-4 animate-fade-in text-sm font-semibold text-niat-maroon" style={{ animationDelay: '350ms' }}>
          {mode === 'personal' ? '📸 Take a screenshot of your seat. See you inside ✨' : 'See you inside ✨'}
        </p>
      )}

      {mode === 'kiosk' ? (
        <div className="relative z-10 mt-6 w-full">
          <CtaButton ref={doneRef} onClick={onDone} className="w-full">
            {returning ? 'Continue' : 'Next Student'}
          </CtaButton>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-niat-line/60" aria-hidden>
            <div className="h-full origin-left rounded-full bg-niat-maroon/40" style={{ animation: `countdown ${AUTO_RETURN_SECONDS}s linear forwards` }} />
          </div>
          <p className="mt-2 text-xs text-niat-muted/80">Returns to search automatically</p>
        </div>
      ) : done && (
        // Secondary action, at the end of the page so it never covers the seat or the team.
        <button onClick={onDone}
          className="relative z-10 mt-4 cursor-pointer rounded-lg px-4 py-3 text-base font-bold text-niat-maroon underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-niat-gold/50">
          Check in someone else
        </button>
      )}
    </div>
  );
}

function ReelColumn({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.24em] text-niat-muted">{label}</div>
      {children}
    </div>
  );
}

/** Shuffle strip for the TEAM reel: a run of team numbers that ends on the real one. */
function teamValues(team: number | null) {
  const top = Math.max(9, (team ?? 1) + 6);
  return Array.from({ length: 16 }, () => pad(1 + Math.floor(Math.random() * top)));
}

/** Shuffle strip for the SEAT reel: the table's seat letters, ending on the real one. */
function seatValues(a: SeatAssignment) {
  const letters = a.members.map((m) => m.label);
  const pool = letters.length ? letters : ['A', 'B', 'C', 'D', 'E'];
  return Array.from({ length: 22 }, (_, i) => pool[i % pool.length]);
}

/**
 * One slot reel. While spinning, the strip slides up through `values` and settles on `final` with a
 * small overshoot; once landed it shows `final` alone (also when the draw is skipped).
 */
function Reel({ final, values, spinning, landed, durationMs }: {
  final: string;
  values: string[];
  spinning: boolean;
  landed: boolean;
  durationMs: number;
}) {
  const strip = useMemo(() => [...values, final], []); // eslint-disable-line react-hooks/exhaustive-deps
  const [started, setStarted] = useState(false);
  const animate = spinning && !landed;

  // Start the slide on the next frame so the transition runs from the top of the strip.
  useEffect(() => {
    if (!animate) return;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setStarted(true)));
    return () => cancelAnimationFrame(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const items = landed ? [final] : strip;
  const offset = started && !landed ? strip.length - 1 : 0;

  return (
    <div className={`reel ${animate ? 'reel-spinning' : ''} ${landed ? 'reel-locked' : ''}`}>
      <div className="reel-strip"
        style={{
          transform: `translateY(calc(var(--h) * -${offset}))`,
          transition: started && !landed ? `transform ${durationMs - 80}ms cubic-bezier(0.12, 0.72, 0.18, 1.04)` : 'none',
        }}>
        {items.map((v, i) => (
          <div key={i} className="reel-item text-[64px] font-extrabold leading-none tracking-tight text-niat-maroon tabular-nums sm:text-[84px]">{v}</div>
        ))}
      </div>
    </div>
  );
}

/** The table at a glance: every seat (yours in gold), who has arrived, and how many are still coming. */
function YourTable({ assignment }: { assignment: SeatAssignment }) {
  const joined = assignment.members.filter((m) => m.name);
  const open = assignment.members.length - joined.length;
  return (
    <section className="relative z-10 mt-4 w-full rounded-[var(--radius-card)] border border-niat-line bg-white/90 p-4 text-left shadow-[var(--shadow-card)] backdrop-blur animate-fade-up">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-extrabold">Your table · {assignment.teamName}</h2>
        <span className="shrink-0 text-xs font-semibold text-niat-muted">{joined.length} of {assignment.members.length} here</span>
      </div>

      <div className="mt-3 flex justify-center gap-2.5" aria-hidden>
        {assignment.members.map((m, i) => (
          <div key={m.label} className="seat-chip flex flex-col items-center gap-1" style={{ '--i': i } as React.CSSProperties}>
            <span className={`grid h-11 w-11 place-items-center rounded-full text-sm font-extrabold ${
              m.isSelf ? 'bg-niat-gold text-niat-text shadow-[0_0_0_4px_rgb(255_183_25/0.25)]'
                : m.name ? 'bg-niat-maroon text-white' : 'border-2 border-dashed border-niat-line text-niat-muted'}`}>
              {m.label}
            </span>
            <span className={`text-[10px] font-bold ${m.isSelf ? 'text-niat-maroon' : 'text-transparent'}`}>You</span>
          </div>
        ))}
      </div>

      <ul className="mt-2 space-y-1">
        {joined.map((m) => (
          <li key={m.label} className={`flex items-center gap-3 rounded-xl px-2.5 py-2 ${m.isSelf ? 'bg-niat-cream ring-1 ring-niat-gold/50' : ''}`}>
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${m.isSelf ? 'bg-niat-maroon text-white' : 'bg-niat-pink text-niat-maroon'}`}>
              {initials(m.name!)}
            </span>
            <span className={`min-w-0 flex-1 truncate text-[15px] ${m.isSelf ? 'font-extrabold text-niat-maroon' : 'font-semibold text-niat-text'}`}>{displayName(m.name!)}</span>
            <span className="shrink-0 text-xs font-bold text-niat-muted">Seat {m.label}{m.isSelf ? ' · You' : ''}</span>
          </li>
        ))}
      </ul>
      {open > 0 && (
        <p className="mt-2 px-1 text-sm text-niat-muted">
          ✨ {open} more {open === 1 ? 'teammate is' : 'teammates are'} joining soon. Say hi when they arrive!
        </p>
      )}
    </section>
  );
}

function Sparkles() {
  const spots = [
    { left: '10%', top: '14%', delay: '0ms', scale: 1 },
    { left: '86%', top: '10%', delay: '600ms', scale: 0.8 },
    { left: '90%', top: '66%', delay: '1200ms', scale: 1.1 },
    { left: '6%', top: '70%', delay: '1800ms', scale: 0.7 },
    { left: '50%', top: '2%', delay: '900ms', scale: 0.6 },
  ];
  return (
    <>
      {spots.map((s, i) => (
        <span key={i} aria-hidden className="sparkle" style={{ left: s.left, top: s.top, animationDelay: s.delay, scale: String(s.scale) }} />
      ))}
    </>
  );
}

const CONFETTI_COLORS = ['#A7191E', '#FFB719', '#FFD65A', '#861317', '#FFF8D6'];

/** ~32 tasteful pieces, about a second, then gone. */
export function Confetti() {
  const [alive, setAlive] = useState(true);
  const pieces = useMemo(() => Array.from({ length: 32 }, (_, i) => {
    const angle = Math.PI + Math.PI * (i / 31);
    const distance = 140 + Math.random() * 200;
    return {
      dx: `${Math.cos(angle) * distance}px`,
      dy: `${Math.sin(angle) * distance * 0.7 + 240 + Math.random() * 140}px`,
      rot: `${Math.round(Math.random() * 720 - 360)}deg`,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: `${Math.round(Math.random() * 120)}ms`,
      dur: `${850 + Math.round(Math.random() * 300)}ms`,
      round: i % 4 === 0,
    };
  }), []);

  useEffect(() => {
    const t = setTimeout(() => setAlive(false), 1500);
    return () => clearTimeout(t);
  }, []);
  if (!alive) return null;

  return (
    <div aria-hidden className="pointer-events-none absolute left-1/2 top-48 z-20 h-0 w-0 sm:top-64">
      {pieces.map((p, i) => (
        <span key={i} className="confetti-piece"
          style={{
            background: p.color,
            borderRadius: p.round ? '999px' : undefined,
            width: p.round ? 8 : undefined,
            height: p.round ? 8 : undefined,
            opacity: 0,
            '--dx': p.dx, '--dy': p.dy, '--rot': p.rot, '--delay': p.delay, '--dur': p.dur,
          } as React.CSSProperties} />
      ))}
    </div>
  );
}
