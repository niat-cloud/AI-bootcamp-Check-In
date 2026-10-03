import { describe, expect, it } from 'vitest';
import { pickTeam, planTeams, type TeamState } from '../src/lib/allocation.js';
import { maskPhone, normalizePhone } from '../src/lib/phone.js';

function seededRng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return seed / 2 ** 32;
  };
}

function makeTeams(n: number, size = 3): TeamState[] {
  return Array.from({ length: n }, (_, i) => ({ id: i + 1, teamNumber: i + 1, capacity: size, assigned: 0 }));
}

/** Simulate `count` arrivals and return the team number each one got. */
function simulate(teams: TeamState[], count: number, pool = 5, threshold = 0.6, rng = seededRng(42)) {
  const picks: number[] = [];
  for (let i = 0; i < count; i++) {
    const team = pickTeam(teams, pool, threshold, rng);
    if (!team) break;
    team.assigned++;
    picks.push(team.teamNumber);
  }
  return picks;
}

describe('pickTeam', () => {
  it('seats the first 5 arrivals in teams 1–5, one each, in random order', () => {
    const picks = simulate(makeTeams(30), 5);
    expect([...picks].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    expect(picks).not.toEqual([1, 2, 3, 4, 5]);
  });

  it('never gives an open team a 2nd student while another open team has fewer', () => {
    const teams = makeTeams(30);
    const rng = seededRng(7);
    for (let i = 0; i < 90; i++) {
      const team = pickTeam(teams, 5, 0.6, rng)!;
      // Every lower-numbered team is open too, so none of them may be emptier than the chosen one.
      const lowerFree = teams.filter((t) => t.teamNumber < team.teamNumber && t.assigned < t.capacity);
      for (const t of lowerFree) expect(t.assigned).toBeGreaterThanOrEqual(team.assigned);
      team.assigned++;
    }
    expect(teams.every((t) => t.assigned === 3)).toBe(true);
  });

  it('opens teams 6–10 only after the first pool reaches the threshold', () => {
    const teams = makeTeams(30);
    // 0.6 of 15 seats = 9 students before the next batch opens.
    const first9 = simulate(teams, 9);
    expect(Math.max(...first9)).toBeLessThanOrEqual(5);
    const next = simulate(teams, 1, 5, 0.6, seededRng(1));
    expect(next[0]).toBeGreaterThanOrEqual(6);
    expect(next[0]).toBeLessThanOrEqual(10);
  });

  it('does not spread 10 arrivals across 30 teams', () => {
    const picks = simulate(makeTeams(30), 10);
    expect(Math.max(...picks)).toBeLessThanOrEqual(10);
  });

  it('fills every seat exactly once and then returns null', () => {
    const teams = makeTeams(7, 3);
    teams.push({ id: 8, teamNumber: 8, capacity: 1, assigned: 0 });
    const picks = simulate(teams, 100);
    expect(picks).toHaveLength(22);
    expect(pickTeam(teams, 5, 0.6)).toBeNull();
  });

  it('is reproducible with a seeded rng', () => {
    expect(simulate(makeTeams(20), 30, 5, 0.6, seededRng(3))).toEqual(simulate(makeTeams(20), 30, 5, 0.6, seededRng(3)));
  });
});

describe('planTeams', () => {
  it('builds 33 full tables + one 1-seat table for a 100-seat room, numbering continues across rooms', () => {
    const plan = planTeams(
      [{ id: 2, capacity: 50, priority: 2 }, { id: 1, capacity: 100, priority: 1 }],
      3,
    );
    const room1 = plan.filter((t) => t.roomId === 1);
    expect(room1).toHaveLength(34);
    expect(room1.at(-1)).toEqual({ roomId: 1, teamNumber: 34, capacity: 1 });
    expect(room1.reduce((s, t) => s + t.capacity, 0)).toBe(100);
    const room2 = plan.filter((t) => t.roomId === 2);
    expect(room2[0].teamNumber).toBe(35);
    expect(room2.reduce((s, t) => s + t.capacity, 0)).toBe(50);
  });
});

describe('phone helpers', () => {
  it('normalizes common Indian formats', () => {
    expect(normalizePhone('98765 43210')).toBe('9876543210');
    expect(normalizePhone('+91-98765-43210')).toBe('9876543210');
    expect(normalizePhone('09876543210')).toBe('9876543210');
    expect(normalizePhone(9876543210)).toBe('9876543210');
    expect(normalizePhone('9876543210.0')).toBe('9876543210');
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('')).toBeNull();
  });

  it('shows only the last 4 digits', () => {
    expect(maskPhone('9876543210')).toBe('••••••3210');
  });
});
