export interface TeamState {
  id: number;
  teamNumber: number;
  capacity: number;
  assigned: number;
}

/**
 * Controlled random team selection for one room.
 *
 * Teams are opened in batches of `poolSize` (lowest team numbers first). The next batch opens only
 * once the already-open teams are filled to `threshold` (0–1), so early arrivals stay concentrated.
 * Among open teams with a free seat, the least-occupied ones are preferred and one is chosen at random,
 * so every open table gets its 1st student before any gets its 2nd, in an unpredictable order.
 *
 * Returns null when no team in the list has a free seat.
 */
export function pickTeam(
  teams: TeamState[],
  poolSize: number,
  threshold: number,
  rng: () => number = Math.random,
): TeamState | null {
  const ordered = [...teams].sort((a, b) => a.teamNumber - b.teamNumber);
  const n = ordered.length;
  if (n === 0) return null;
  const step = Math.max(1, Math.floor(poolSize));

  let opened = Math.min(step, n);
  for (;;) {
    const open = ordered.slice(0, opened);
    const capacity = open.reduce((s, t) => s + t.capacity, 0);
    const assigned = open.reduce((s, t) => s + t.assigned, 0);
    const candidates = open.filter((t) => t.assigned < t.capacity);
    const poolFilled = assigned >= threshold * capacity - 1e-9;

    if (opened < n && (poolFilled || candidates.length === 0)) {
      opened = Math.min(opened + step, n);
      continue;
    }
    if (candidates.length === 0) return null;

    const minAssigned = Math.min(...candidates.map((t) => t.assigned));
    const leastFilled = candidates.filter((t) => t.assigned === minAssigned);
    const index = Math.min(leastFilled.length - 1, Math.floor(rng() * leastFilled.length));
    return leastFilled[index];
  }
}

/**
 * Tables for one room: full tables plus one smaller table for any remainder.
 * Numbering is room-local: every room starts at Team 1.
 */
export function planRoomTeams(capacity: number, teamSize: number): { teamNumber: number; capacity: number }[] {
  const full = Math.floor(capacity / teamSize);
  const remainder = capacity % teamSize;
  const plan = Array.from({ length: full }, (_, i) => ({ teamNumber: i + 1, capacity: teamSize }));
  if (remainder > 0) plan.push({ teamNumber: full + 1, capacity: remainder });
  return plan;
}

/** Plan the physical tables for every room of an event (room-local numbering). */
export function planTeams(
  rooms: { id: number; capacity: number; priority: number; teamSize?: number | null }[],
  teamSize: number,
): { roomId: number; teamNumber: number; capacity: number }[] {
  return [...rooms]
    .sort((a, b) => a.priority - b.priority)
    .flatMap((room) => planRoomTeams(room.capacity, room.teamSize ?? teamSize).map((t) => ({ roomId: room.id, ...t })));
}

const LETTERS = 'ABCDEFGH'.split('');

/** Seat labels for a table of `size`: the event's labels when they cover it, otherwise A, B, C… */
export function seatLabelsFor(size: number, eventLabels: string[]): string[] {
  return eventLabels.length >= size ? eventLabels.slice(0, size) : LETTERS.slice(0, size);
}
