import { vi } from 'vitest';
import { App, Editor, EditorSuggestContext, TFile, FrontMatterCache, HeadingCache } from 'obsidian';

// Mock TFile
export const createMockTFile = (path: string, basename:string, content: string = ''): TFile => ({
    path,
    basename,
    vault: {
        cachedRead: vi.fn().mockResolvedValue(content),
    },
} as unknown as TFile);

// Mock App
export const createMockApp = () => ({
    workspace: {
        getLastOpenFiles: vi.fn().mockReturnValue([]),
    },
    vault: {
        getFileByPath: vi.fn().mockImplementation((path: string) => {
            return createMockTFile(path, path.split('/').pop() || '');
        }),
        cachedRead: vi.fn().mockResolvedValue(''),
    },
    metadataCache: {
        getFileCache: vi.fn().mockReturnValue({
            frontmatter: {} as FrontMatterCache,
            headings: [] as HeadingCache[],
        }),
    },
} as unknown as App);

// Mock Editor
export const createMockEditor = (line: string, ch: number) => ({
    getLine: vi.fn().mockReturnValue(line),
    getCursor: vi.fn().mockReturnValue({ line: 0, ch }),
    replaceRange: vi.fn(),
} as unknown as Editor);

// Mock EditorSuggestContext
export const createMockEditorSuggestContext = (editor: Editor, query: string, startCh: number, endCh: number): EditorSuggestContext => ({
    editor,
    query,
    start: { line: 0, ch: startCh },
    end: { line: 0, ch: endCh },
    file: createMockTFile('currentFile.md', 'currentFile'),
});

// Mock Omnisearch API
export const createMockOmnisearch = () => ({
    search: vi.fn().mockResolvedValue([]),
});
