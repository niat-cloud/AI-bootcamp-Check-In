import { describe, expect, it } from 'vitest';
import { normalizeProjectUrl } from '../src/lib/projectPage.js';

describe('project links', () => {
  it('accepts published Lovable links, with or without https', () => {
    expect(normalizeProjectUrl('https://krishi-mitra.lovable.app')).toBe('https://krishi-mitra.lovable.app/');
    expect(normalizeProjectUrl('  krishi-mitra.lovable.app/map#top ')).toBe('https://krishi-mitra.lovable.app/map');
  });

  it('explains the editor and preview links students paste by mistake', () => {
    expect(() => normalizeProjectUrl('https://lovable.dev/projects/123e4567')).toThrow(/editor link/);
    expect(() => normalizeProjectUrl('https://id-preview--123e4567.lovable.app')).toThrow(/preview link/);
  });

  it('rejects things that are not public websites', () => {
    expect(() => normalizeProjectUrl('')).toThrow(/Paste your project link/);
    expect(() => normalizeProjectUrl('Temple run')).toThrow();
    expect(() => normalizeProjectUrl('Lovbel')).toThrow();
    expect(() => normalizeProjectUrl('http://localhost:3000')).toThrow();
    expect(() => normalizeProjectUrl('http://169.254.169.254/latest')).toThrow();
  });
});
