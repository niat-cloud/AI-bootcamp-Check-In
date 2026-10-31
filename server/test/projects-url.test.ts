import { describe, expect, it } from 'vitest';
import { normalizeProjectUrl } from '../src/lib/projectPage.js';

describe('normalizeProjectUrl', () => {
  it('normalizes valid urls and adds https if missing', () => {
    expect(normalizeProjectUrl('my-cool-app.lovable.app')).toBe('https://my-cool-app.lovable.app/');
    expect(normalizeProjectUrl('https://my-cool-app.lovable.app')).toBe('https://my-cool-app.lovable.app/');
    expect(normalizeProjectUrl('  http://student-project.vercel.app/home  ')).toBe('http://student-project.vercel.app/home');
  });

  it('strips hash fragments and whitespace', () => {
    expect(normalizeProjectUrl('https://my-app.lovable.app/#about')).toBe('https://my-app.lovable.app/');
    expect(normalizeProjectUrl('https:// my-app .lovable.app/ demo ')).toBe('https://my-app.lovable.app/demo');
  });

  it('rejects empty or blank input', () => {
    expect(() => normalizeProjectUrl('')).toThrow('Paste your project link');
    expect(() => normalizeProjectUrl('   ')).toThrow('Paste your project link');
  });

  it('rejects invalid or non-public hosts', () => {
    expect(() => normalizeProjectUrl('localhost')).toThrow('That doesn’t look like a public website link');
    expect(() => normalizeProjectUrl('http://localhost:3000')).toThrow('That doesn’t look like a public website link');
    expect(() => normalizeProjectUrl('http://192.168.1.1')).toThrow('That doesn’t look like a public website link');
    expect(() => normalizeProjectUrl('http://test.local')).toThrow('That doesn’t look like a public website link');
    expect(() => normalizeProjectUrl('http://intranet.internal')).toThrow('That doesn’t look like a public website link');
    expect(() => normalizeProjectUrl('not-a-link')).toThrow('That doesn’t look like a public website link');
  });

  it('specifically catches Lovable editor links and tells students to publish', () => {
    expect(() => normalizeProjectUrl('https://lovable.dev/projects/abc-123')).toThrow(
      'This is your Lovable editor link, which only you can open. In Lovable, click Publish and paste the link that ends in .lovable.app.'
    );
    expect(() => normalizeProjectUrl('https://app.lovable.dev/projects/xyz')).toThrow(
      'This is your Lovable editor link, which only you can open. In Lovable, click Publish and paste the link that ends in .lovable.app.'
    );
  });

  it('specifically catches Lovable preview links and tells students to publish', () => {
    expect(() => normalizeProjectUrl('https://preview--app-id.lovable.app')).toThrow(
      'This is a preview link, which only you can open. In Lovable, click Publish and paste the published link that ends in .lovable.app.'
    );
    expect(() => normalizeProjectUrl('https://myproject-preview--123.lovable.app')).toThrow(
      'This is a preview link, which only you can open. In Lovable, click Publish and paste the published link that ends in .lovable.app.'
    );
  });
});

