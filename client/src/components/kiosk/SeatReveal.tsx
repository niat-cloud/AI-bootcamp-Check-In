import { useEffect, useMemo, useRef, useState } from 'react';
import type { SeatAssignment } from '../../lib/api';
import { vibrate } from '../../lib/device';
import { CtaButton } from './CtaButton';
import { initials } from './Search';

const AUTO_RETURN_SECONDS = 20;
// The draw: a chit rises from the bowl and unfolds, the TEAM reel lands, then the SEAT reel, then the celebration.
const TEAM_LANDS_MS = 2000;
const SEAT_LANDS_MS = 2800;
const CHIT_OPEN_MS = 650; // the bowl sinks away just before the chit unfolds

/** "BHUTHKURI LAASYA" / "bhuthkuri laasya" → "Bhuthkuri Laasya"; names already in mixed case stay as typed. */
export function displayName(name: string): string {
  const n = name.trim().replace(/\s+/g, ' ');
  if (n !== n.toUpperCase() && n !== n.toLowerCase()) return n;
  return n.toLowerCase().replace(/(^|[\s.'-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** Buzz ticks that slow down like a reel settling, filling `total` ms (phones that can buzz; ignored elsewhere). */
function tickPattern(total: number): number[] {
  const out: number[] = [];
  let gap = 60;
  for (let t = 0; t + 10 + gap < total; gap = Math.round(gap * 1.18)) { out.push(10, gap); t += 10 + gap; }
  return out;
}

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

type Phase = 'spinning' | 'team-landed' | 'done';

export interface SeatEventInfo {
  locationName?: string | null;
  date?: string;
  time?: string;
}

/**
 * The seat moment, built for a phone screen. A first-time seat runs "the chit draw", like picking a slip
 * from a bowl: a folded chit jumps out of the bowl, unfolds, and the TEAM and SEAT reels on it land on
 * the student's code (3A), with a burst of light, confetti and a buzz. Then it shows how to get there in
 * walking order (room → team table → seat) and who is at the table. Reopening it ("Welcome back") skips
 * the draw; tapping the chit skips it too.
 *
 * `kiosk` mode (gate laptop): Next Student + auto-return. `personal` mode (student's phone): stays put.
 */
export function SeatReveal({ assignment, mode, onDone }: {
  assignment: SeatAssignment;
  mode: 'kiosk' | 'personal';
  onDone: () => void;
  /** Kept for callers; the seat screen no longer prints the event line. */
  event?: SeatEventInfo;
}) {
  const returning = assignment.alreadyAssigned;
  const [phase, setPhase] = useState<Phase>(() => (returning || prefersReducedMotion() ? 'done' : 'spinning'));
  const drew = useRef(phase !== 'done'); // this view ran the draw (celebrate at the end)
  const done = phase === 'done';
  // After the code lands the celebration comes in beats (stamp → confetti → the way → the table), then the page
  // goes still so the student can read it: stage 0 = just landed … 3 = everything shown; calm = decorations gone.
  const [stage, setStage] = useState(drew.current ? 0 : 3);
  const [calm, setCalm] = useState(!drew.current);
  useEffect(() => {
    if (!done || !drew.current) return;
    const ts = [setTimeout(() => setStage(1), 500), setTimeout(() => setStage(2), 900),
      setTimeout(() => setStage(3), 1500), setTimeout(() => setCalm(true), 4800)];
    return () => ts.forEach(clearTimeout);
  }, [done]);
  const chitRef = useRef<HTMLDivElement>(null);
  // The bowl stays only while the chit jumps out and opens, then sinks away.
  const [bowlOut, setBowlOut] = useState(!drew.current);
  useEffect(() => {
    if (bowlOut) return;
    const t = setTimeout(() => setBowlOut(true), CHIT_OPEN_MS);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const doneRef = useRef<HTMLButtonElement>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // The draw's timeline. Skipping jumps straight to 'done'.
  useEffect(() => {
    if (phase === 'done') return;
    vibrate(tickPattern(TEAM_LANDS_MS));
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
  const firstName = name.split(' ')[0];
  const seatLetter = assignment.seatLabel ?? '—';
  const teamNo = assignment.teamNumber === null ? '—' : String(assignment.teamNumber);

  return (
    <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col items-center pb-4 pt-1 text-center sm:py-6">
      <div className="aurora" aria-hidden />
      {stage >= 1 && drew.current && <ConfettiCannons anchor={chitRef} />}

      {/* Headline: what's happening now. */}
      <div className="relative z-10 w-full" aria-live="polite">
        {returning ? (
          <>
            <div className="eyebrow animate-fade-up">Your seat is safe</div>
            <h1 className="mt-1.5 animate-fade-up text-[28px] font-extrabold leading-tight tracking-tight sm:text-5xl">Welcome back, {firstName} 👋</h1>
          </>
        ) : done ? (
          <>
            <div className="eyebrow animate-fade-up">You’re in, {firstName}!</div>
            <h1 key="won" className="mt-1.5 animate-seat-pop text-[28px] font-extrabold leading-tight tracking-tight sm:text-5xl">
              Welcome to {assignment.teamName ?? 'your team'} 🎉
            </h1>
          </>
        ) : (
          <>
            <div className="eyebrow">The team draw</div>
            <h1 key={phase === 'spinning' ? (bowlOut ? 'open' : 'shake') : 'team'}
              className="headline-swap mt-1.5 text-[28px] font-extrabold leading-tight tracking-tight sm:text-5xl">
              {phase === 'spinning' ? (bowlOut ? 'Opening your chit…' : 'Shaking the bowl…') : <>Team {teamNo}! And seat…</>}
            </h1>
          </>
        )}
        {done && <p className="sr-only">{`Go to ${assignment.room}, find the ${assignment.teamName} table, and sit in seat ${seatLetter}.`}</p>}
      </div>

      {/* The chit: drawn from the bowl, unfolds, and the code lands on it. Tap to skip the draw. */}
      <div onClick={() => !done && setPhase('done')}
        className={`relative z-10 mt-5 w-full ${done ? '' : 'cursor-pointer'}`}>
        {done && !calm && <div className="chit-halo" aria-hidden />}
        {done && !calm && <FloatingSparks />}
        {drew.current && <Bowl leaving={bowlOut || done} />}
        <div ref={chitRef} className={`chit relative mx-auto w-[88%] max-w-[340px] ${drew.current ? 'chit-draw' : ''} ${done && drew.current ? 'chit-shine chit-impact' : ''}`}>
          {done && !calm && (
            <>
              <div className="seat-rays" aria-hidden />
              <Sparkles />
              {drew.current && <div className="win-flash" aria-hidden />}
            </>
          )}
          <div className="relative px-5 pb-4 pt-3.5">
            <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-niat-muted">Your seat code</div>
            <div className="mt-1.5 flex items-start justify-center gap-2" aria-hidden={!done}>
              <div className="w-[44%]">
                <Reel final={teamNo} values={teamValues(assignment.teamNumber)}
                  spinning={phase === 'spinning'} durationMs={TEAM_LANDS_MS} landed={phase !== 'spinning'} />
                <div className="mt-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-niat-muted">Team</div>
              </div>
              <div className="w-[44%]">
                <Reel final={seatLetter} values={seatValues(assignment)}
                  spinning={phase !== 'done'} durationMs={SEAT_LANDS_MS} landed={done} />
                <div className="mt-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-niat-muted">Seat</div>
              </div>
            </div>
            <div className="mt-2.5 flex min-h-7 items-center justify-center gap-2 text-xs font-semibold text-niat-muted">
              {done ? (
                <>
                  <span className={`${drew.current ? 'code-stamp' : ''} inline-flex -rotate-6 flex-col items-center rounded-md border-2 border-niat-maroon px-2 py-0.5 leading-none text-niat-maroon`}>
                    {assignment.room && <span className="max-w-[9rem] truncate text-[9px] font-extrabold uppercase tracking-[0.18em]">{assignment.room}</span>}
                    <span className="text-[16px] font-black tracking-wide">{assignment.seatCode ?? `${teamNo}${seatLetter}`}</span>
                  </span>
                  <span>means Team {teamNo}, seat {seatLetter}</span>
                </>
              ) : 'Tap to skip'}
            </div>
          </div>
        </div>
      </div>

      {/* Where to go, in walking order: room, then the team's table, then the seat. */}
      {stage >= 2 && <WalkPath assignment={assignment} teamNo={teamNo} seatLetter={seatLetter} interactive={mode === 'personal'} />}

      {stage >= 3 && <YourTable assignment={assignment} />}

      {stage >= 3 && (
        <p className="relative z-10 mt-4 animate-fade-in text-sm font-semibold text-niat-maroon" style={{ animationDelay: '300ms' }}>
          {mode === 'personal' ? '📸 Take a screenshot of this. See you inside ✨' : 'See you inside ✨'}
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
      ) : stage >= 3 && (
        // Secondary action, at the end of the page so it never covers the seat or the team.
        <button onClick={onDone}
          className="relative z-10 mt-3 cursor-pointer rounded-lg px-4 py-3 text-sm font-bold text-niat-muted underline-offset-4 transition-colors hover:text-niat-maroon hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-niat-gold/50">
          Check in someone else
        </button>
      )}
    </div>
  );
}

// Icons (Lucide, ISC licence): an open door for the room, a group for the team's table, a chair for the seat.
const ICONS = {
  room: <><path d="M13 4h3a2 2 0 0 1 2 2v14" /><path d="M2 20h3" /><path d="M13 20h9" /><path d="M10 12v.01" /><path d="M13 4.562v16.157a1 1 0 0 1-1.242.97L5 20V5.562a2 2 0 0 1 1.515-1.94l4-1A2 2 0 0 1 13 4.561Z" /></>,
  team: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  seat: <><path d="M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3" /><path d="M3 16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V11a2 2 0 0 0-4 0z" /><path d="M5 18v2" /><path d="M19 18v2" /></>,
};

/**
 * The way to the seat as a walking checklist: room → team → seat. The step to do now is the maroon strip;
 * on the student's phone they tap it once they're there and the next one lights up, until "You're in your
 * seat!". Progress is kept on the phone, so reopening the page picks up where they were.
 * On the gate laptop (kiosk) it is a plain list with the room highlighted.
 */
function WalkPath({ assignment, teamNo, seatLetter, interactive }: {
  assignment: SeatAssignment; teamNo: string; seatLetter: string; interactive: boolean;
}) {
  const key = `aibootcamp.walk.${assignment.eventParticipantId}`;
  const [reached, setReached] = useState(() => {
    if (!interactive) return 0;
    try { return Math.min(3, Number(localStorage.getItem(key)) || 0); } catch { return 0; }
  });
  const steps = [
    { label: 'Go to', value: assignment.room ?? '—', icon: ICONS.room },
    { label: 'Find your team', value: assignment.teamName ?? `Team ${teamNo}`, icon: ICONS.team },
    { label: 'Sit in seat', value: seatLetter, icon: ICONS.seat },
  ];
  const all = reached >= steps.length;

  const advance = (i: number) => {
    if (!interactive || i !== reached) return;
    vibrate(i === steps.length - 1 ? [20, 40, 60] : 15);
    setReached(i + 1);
    try { localStorage.setItem(key, String(i + 1)); } catch { /* storage unavailable */ }
  };

  return (
    <section className="relative z-10 mt-5 w-full rounded-[var(--radius-card)] border border-niat-line bg-white/95 p-3 text-left shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-3 px-1.5 pb-1 pt-1">
        <h2 className="text-[15px] font-extrabold tracking-tight">Your way to your seat</h2>
        {interactive && (
          <span className="shrink-0 rounded-full bg-niat-pink px-2.5 py-0.5 text-xs font-bold tabular-nums text-niat-maroon">
            {Math.min(reached + (all ? 0 : 1), 3)} of 3
          </span>
        )}
      </div>
      {interactive && !all && (
        <p className="px-1.5 text-[13px] text-niat-muted">Tap each step when you’re there.</p>
      )}
      {interactive && (
        <div className="mx-1.5 mb-3 mt-2 h-1.5 overflow-hidden rounded-full bg-niat-line/70" aria-hidden>
          <div className="h-full rounded-full bg-gradient-to-r from-niat-gold to-niat-maroon transition-[width] duration-500 ease-out"
            style={{ width: `${(reached / steps.length) * 100}%` }} />
        </div>
      )}

      <ol className={interactive ? '' : 'mt-2'}>
        {steps.map((s, i) => {
          const state = i < reached ? 'done' : i === reached ? 'now' : 'next';
          const now = state === 'now';
          const Tag = interactive && now ? 'button' : 'div';
          return (
            <li key={s.label} className="walk-step" style={{ '--i': i } as React.CSSProperties}>
              {i > 0 && (
                <div aria-hidden className="flex h-5 w-[60px] items-center justify-center">
                  <svg viewBox="0 0 12 20" className={`h-5 w-3 ${i <= reached ? 'text-niat-maroon' : 'text-niat-line'}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 1v12" strokeDasharray="2 3" /><path d="M2.5 11.5 6 15l3.5-3.5" />
                  </svg>
                </div>
              )}
              <Tag {...(Tag === 'button' ? { type: 'button' as const, onClick: () => advance(i) } : {})}
                aria-current={now ? 'step' : undefined}
                aria-label={interactive && now ? `Step ${i + 1}: ${s.label} ${s.value}. Tap when you’re there.` : undefined}
                className={`relative flex w-full items-center gap-3 rounded-2xl py-2.5 pl-2.5 pr-4 text-left transition-all duration-300 ${
                  now ? `bg-gradient-to-r from-niat-maroon to-niat-maroon-dark text-white shadow-[var(--shadow-soft)] ${interactive ? 'walk-now active:scale-[0.98]' : ''}`
                    : state === 'done' ? 'bg-emerald-50 ring-1 ring-emerald-200'
                      : 'bg-niat-warm-white ring-1 ring-niat-line/80'}`}>
                <span className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
                  now ? 'bg-white/15 text-white' : state === 'done' ? 'bg-emerald-500 text-white' : 'bg-white text-niat-maroon ring-1 ring-niat-line'}`}>
                  {state === 'done' ? (
                    <svg aria-hidden viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                  ) : (
                    <svg aria-hidden viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{s.icon}</svg>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[10.5px] font-bold uppercase tracking-[0.12em] ${now ? 'text-niat-gold-light' : state === 'done' ? 'text-emerald-600' : 'text-niat-muted/80'}`}>
                    Step {i + 1}{interactive && now ? ' · Now' : state === 'done' ? ' · Done' : ''}
                  </span>
                  <span className={`block text-[15px] font-bold ${now ? 'text-white' : state === 'done' ? 'text-emerald-800' : 'text-niat-text'}`}>{s.label}</span>
                </span>
                <span className={`max-w-[50%] truncate text-right font-extrabold leading-none ${
                  now ? 'text-[24px]' : state === 'done' ? 'text-[20px] text-emerald-800' : 'text-[22px] text-niat-text'}`}>{s.value}</span>
              </Tag>
            </li>
          );
        })}
      </ol>

      {interactive && all && (
        <div className="walk-done mt-3 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-niat-cream to-white px-4 py-3 ring-1 ring-niat-gold/40">
          <span aria-hidden className="text-2xl">🎉</span>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-extrabold">You’re in your seat!</div>
            <div className="text-sm text-niat-muted">Say hi to your team 👋</div>
          </div>
          <button type="button" onClick={() => { setReached(0); try { localStorage.removeItem(key); } catch { /* ignore */ } }}
            className="shrink-0 text-xs font-bold text-niat-muted underline-offset-4 hover:underline">Reset</button>
        </div>
      )}
    </section>
  );
}

/** A few gold sparks drifting up behind the chit once it has landed. */
function FloatingSparks() {
  const sparks = [
    { left: '6%', delay: '0s', size: 6, dur: '5.5s' }, { left: '18%', delay: '1.8s', size: 4, dur: '6.5s' },
    { left: '82%', delay: '0.9s', size: 5, dur: '6s' }, { left: '94%', delay: '2.6s', size: 4, dur: '7s' },
    { left: '50%', delay: '3.4s', size: 3, dur: '6.2s' },
  ];
  return (
    <>
      {sparks.map((p, k) => (
        <span key={k} aria-hidden className="spark-float"
          style={{ left: p.left, width: p.size, height: p.size, animationDelay: p.delay, animationDuration: p.dur }} />
      ))}
    </>
  );
}

/** The bowl of folded chits the student's chit is drawn from. Sinks away once the chit is out. */
function Bowl({ leaving }: { leaving: boolean }) {
  return (
    <div aria-hidden className={`bowl pointer-events-none absolute inset-x-0 top-[58%] z-20 mx-auto h-24 w-[80%] max-w-[300px] ${leaving ? 'bowl-leave' : ''}`}>
      <svg viewBox="0 0 300 96" className="h-full w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="bowl-body" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#A7191E" /><stop offset="1" stopColor="#6E0518" />
          </linearGradient>
        </defs>
        {/* Folded chits peeking over the rim. */}
        {[[60, -8], [95, 6], [130, -14], [170, 8], [205, -6], [238, 10]].map(([x, r], k) => (
          <g key={k} transform={`rotate(${r} ${x + 17} 14)`}>
            <rect className="bowl-slip" style={{ animationDelay: `${k * 70}ms` }}
              x={x} y={k % 2 ? 6 : 2} width="34" height="16" rx="3" fill="#FFF8D6" stroke="#E9D9A6" strokeWidth="1.2" />
          </g>
        ))}
        <path d="M6 18 H294 C294 66 230 94 150 94 C70 94 6 66 6 18 Z" fill="url(#bowl-body)" />
        <rect x="2" y="12" width="296" height="12" rx="6" fill="#FFB719" />
        <path d="M40 40 C70 70 120 80 150 80" stroke="#fff" strokeOpacity="0.18" strokeWidth="6" strokeLinecap="round" fill="none" />
      </svg>
    </div>
  );
}

/** Shuffle strip for the TEAM reel: a run of team numbers that ends on the real one. */
function teamValues(team: number | null) {
  const top = Math.max(9, (team ?? 1) + 6);
  return Array.from({ length: 16 }, () => String(1 + Math.floor(Math.random() * top)));
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

  const stripStyle = {
    transform: `translateY(calc(var(--h) * -${offset}))`,
    transition: started && !landed ? `transform ${durationMs - 80}ms cubic-bezier(0.12, 0.72, 0.18, 1.04)` : 'none',
  };
  const cells = items.map((v, i) => (
    <div key={i} className="reel-item text-[64px] font-extrabold leading-none tracking-tight text-niat-maroon tabular-nums sm:text-[84px]">{v}</div>
  ));

  return (
    <div className={`relative ${landed ? 'reel-locked' : ''}`}>
      <div className={`reel ${animate ? 'reel-spinning' : ''}`}>
        <div className="reel-strip" style={stripStyle}>{cells}</div>
        {/* A faint copy half a row behind reads as motion blur, without a filter (cheap on weak phones). */}
        {animate && <div className="reel-strip reel-ghost" aria-hidden style={stripStyle}>{cells}</div>}
      </div>
      {landed && <span className="reel-ring" aria-hidden />}
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

/**
 * Two confetti cannons, one in each lower corner, fire up and in; the pieces arc over and flutter down.
 * Sideways motion and the rise-and-fall run on separate layers, so the fall has real gravity. Gone in ~2.6 s.
 * The burst is aimed at the chit, wherever it sits on this screen. Small or weak phones get fewer pieces
 * and no flutter layer.
 */
function ConfettiCannons({ anchor }: { anchor: React.RefObject<HTMLDivElement | null> }) {
  const [alive, setAlive] = useState(true);
  const pieces = useMemo(() => {
    const light = window.innerWidth < 420 || (navigator.hardwareConcurrency ?? 8) <= 4;
    const rect = anchor.current?.getBoundingClientRect();
    const reach = rect ? window.innerHeight - (rect.top + rect.height / 2) : window.innerHeight * 0.6;
    const r = Math.random;
    return Array.from({ length: light ? 32 : 56 }, (_, i) => ({
      left: i % 2 === 0,
      dx: `${(i % 2 === 0 ? 1 : -1) * (60 + r() * 170)}px`,
      up: `${-(reach * 0.8 + r() * reach * 0.45)}px`,
      down: `${120 + r() * 220}px`,
      rot: `${Math.round(360 + r() * 720) * (r() < 0.5 ? -1 : 1)}deg`,
      flip: light ? null : `${500 + Math.round(r() * 500)}ms`,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: `${Math.round(r() * 160)}ms`,
      dur: `${1700 + Math.round(r() * 700)}ms`,
      shape: i % 5 === 0 ? 'dot' : i % 3 === 0 ? 'strip' : 'square',
    }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setTimeout(() => setAlive(false), 2700);
    return () => clearTimeout(t);
  }, []);
  if (!alive) return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-30 overflow-hidden">
      {pieces.map((p, i) => (
        <span key={i} className="cannon-x" style={{
          [p.left ? 'left' : 'right']: '-6px', '--dx': p.dx, '--dur': p.dur, '--delay': p.delay,
        } as React.CSSProperties}>
          <span className="cannon-y" style={{ '--up': p.up, '--down': p.down, '--dur': p.dur, '--delay': p.delay } as React.CSSProperties}>
            <span className={`cannon-piece cannon-${p.shape} ${p.flip ? '' : 'cannon-noflip'}`}
              style={{ background: p.color, '--rot': p.rot, '--flip': p.flip ?? '1s', '--dur': p.dur, '--delay': p.delay } as React.CSSProperties} />
          </span>
        </span>
      ))}
    </div>
  );
}
