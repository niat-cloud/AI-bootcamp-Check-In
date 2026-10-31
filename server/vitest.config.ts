import { defineConfig } from 'vitest/config';

if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile('../.env');
  } catch {
    // Ignore if .env doesn't exist (e.g. CI)
  }
}

export default defineConfig({
  test: {
    testTimeout: 30000,
  },
});

