const BUCKET_MINUTES = [5, 10, 15, 30, 60, 120, 240];
const MAX_BUCKETS = 36;

/**
 * Arrivals per time slot, from the first arrival to now (live) or the last arrival. The slot size grows
 * with the span so the chart never has more than MAX_BUCKETS columns. Empty slots are included.
 */
export function arrivalTimeline(rows: { bucket: string | number; n: number }[], live: boolean, now = Date.now()) {
  if (rows.length === 0) return { bucketMinutes: 5, buckets: [] as { start: string; count: number }[] };
  const first = Number(rows[0].bucket) * 1000;
  const last = Number(rows[rows.length - 1].bucket) * 1000;
  const end = live ? Math.max(last, now) : last;
  const spanMinutes = (end - first) / 60_000 + 5;
  const size = BUCKET_MINUTES.find((m) => spanMinutes / m <= MAX_BUCKETS) ?? BUCKET_MINUTES[BUCKET_MINUTES.length - 1];
  const step = size * 60_000;
  const start = Math.floor(first / step) * step;
  const buckets = Array.from({ length: Math.floor((end - start) / step) + 1 }, (_, i) => ({
    start: new Date(start + i * step).toISOString(),
    count: 0,
  }));
  for (const r of rows) buckets[Math.floor((Number(r.bucket) * 1000 - start) / step)].count += r.n;
  return { bucketMinutes: size, buckets: buckets.slice(-MAX_BUCKETS) };
}
