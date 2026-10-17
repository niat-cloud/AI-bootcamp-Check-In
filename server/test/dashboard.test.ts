import { describe, expect, it } from 'vitest';
import { arrivalTimeline } from '../src/lib/timeline.js';

// 5-minute buckets as the database returns them: seconds since the epoch, floored to 300.
const at = (iso: string) => Math.floor(Date.parse(iso) / 300_000) * 300;

describe('arrivalTimeline', () => {
  it('is empty before anyone arrives', () => {
    expect(arrivalTimeline([], true)).toEqual({ bucketMinutes: 5, buckets: [] });
  });

  it('fills the gaps between arrivals with empty slots', () => {
    const t = arrivalTimeline([{ bucket: at('2026-10-18T04:30:00Z'), n: 3 }, { bucket: at('2026-10-18T04:40:00Z'), n: 2 }], false);
    expect(t.bucketMinutes).toBe(5);
    expect(t.buckets.map((b) => b.count)).toEqual([3, 0, 2]);
    expect(t.buckets[0].start).toBe('2026-10-18T04:30:00.000Z');
  });

  it('runs up to now while the event is live', () => {
    const t = arrivalTimeline([{ bucket: at('2026-10-18T04:30:00Z'), n: 4 }], true, Date.parse('2026-10-18T04:52:00Z'));
    expect(t.buckets.map((b) => b.count)).toEqual([4, 0, 0, 0, 0]);
  });

  it('uses wider slots for a long day, keeping every arrival', () => {
    const rows = [
      { bucket: at('2026-10-18T03:30:00Z'), n: 1 },
      { bucket: at('2026-10-18T03:35:00Z'), n: 2 },
      { bucket: at('2026-10-18T08:25:00Z'), n: 5 },
    ];
    const t = arrivalTimeline(rows, false);
    expect(t.bucketMinutes).toBe(10);
    expect(t.buckets.length).toBeLessThanOrEqual(36);
    expect(t.buckets[0].count).toBe(3);
    expect(t.buckets.reduce((n, b) => n + b.count, 0)).toBe(8);
  });
});
