import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom', // or 'node'
    setupFiles: './tests/setup.ts', // optional setup file
  },
});
