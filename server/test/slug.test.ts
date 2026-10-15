import { describe, expect, it } from 'vitest';
import { dateSlug, RESERVED_LOCATION_SLUGS, SLUG_PATTERN, slugify } from '../src/lib/slug.js';

describe('event and location links', () => {
  it('builds readable location slugs', () => {
    expect(slugify('Hyderabad')).toBe('hyderabad');
    expect(slugify('  Bengaluru – HSR Layout! ')).toBe('bengaluru-hsr-layout');
    expect(slugify('Vijayawada (AP)')).toBe('vijayawada-ap');
    expect(SLUG_PATTERN.test(slugify('Chennai / T. Nagar'))).toBe(true);
  });

  it('turns dates into day-month-year', () => {
    expect(dateSlug('2026-10-18')).toBe('18-oct-2026');
    expect(dateSlug('2026-01-05')).toBe('5-jan-2026');
  });

  it('keeps app paths free', () => {
    expect(RESERVED_LOCATION_SLUGS.has('admin')).toBe(true);
    expect(RESERVED_LOCATION_SLUGS.has('hyderabad')).toBe(false);
  });
});
