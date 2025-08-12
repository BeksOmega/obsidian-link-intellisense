import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EnhancedLinkSuggester } from './EnhancedLinkSuggester';
import type { App, Editor, EditorSuggestContext, TFile, FrontMatterCache, HeadingCache } from 'obsidian';

// Mock Obsidian and Omnisearch APIs
const mockApp = {
    workspace: {
        getLastOpenFiles: vi.fn(),
        on: vi.fn(),
    },
    vault: {
        getFileByPath: vi.fn(),
        cachedRead: vi.fn(),
    },
    metadataCache: {
        getFileCache: vi.fn(),
    },
};

const mockOmnisearch = {
    search: vi.fn(),
};

describe('EnhancedLinkSuggester', () => {
    let suggester: EnhancedLinkSuggester;

    beforeEach(() => {
        // Reset mocks before each test
        vi.resetAllMocks();
        suggester = new EnhancedLinkSuggester(mockApp as any, mockOmnisearch as any);
    });

    it('should be defined', () => {
        expect(suggester).toBeDefined();
    });
});
