import { vi } from 'vitest';

// Mocking the global 'app' object if it's used in your code
// For example, if your plugin uses 'this.app.vault...'
// You might want to provide a default mock for it.
// This is a very basic example. You'll likely need to expand it.
// @ts-ignore
global.app = {
  workspace: {
    // Add any workspace properties your code uses
  },
  vault: {
    // Add any vault properties your code uses
  },
  metadataCache: {
    // Add any metadataCache properties your code uses
  },
};

// You can also mock other global things here if needed
// For example, mocking the 'Notice' class
vi.mock('obsidian', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    Notice: vi.fn(),
  };
});
