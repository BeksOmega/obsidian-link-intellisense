import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EnhancedLinkSuggester } from '../EnhancedLinkSuggester';
import { createMockApp, createMockEditor, createMockOmnisearch, createMockTFile, createMockEditorSuggestContext } from './mocks';
import { App, Editor } from 'obsidian';

describe('EnhancedLinkSuggester', () => {
    let app: App;
    let suggester: EnhancedLinkSuggester;
    let mockOmnisearch: ReturnType<typeof createMockOmnisearch>;

    beforeEach(async () => {
        app = createMockApp();
        mockOmnisearch = createMockOmnisearch();
        suggester = new EnhancedLinkSuggester(app, mockOmnisearch as any);

        // Mock recent files
        const recentFiles = [
            createMockTFile('recent1.md', 'Recent Note 1', 'First line of recent 1'),
            createMockTFile('recent2.md', 'Recent Note 2', 'First line of recent 2'),
        ];
        (app.workspace.getLastOpenFiles as vi.Mock).mockReturnValue(recentFiles.map(f => f.path));
		(app.vault.getFileByPath as vi.Mock).mockImplementation((path: string) => {
			return recentFiles.find(f => f.path === path);
		});
        (suggester as any).updateRecentFiles(); // Manually trigger update
    });

    describe('onTrigger', () => {
        it('should trigger when "[[" is typed', () => {
            const editor = createMockEditor('Hello [[', 8);
            const triggerInfo = suggester.onTrigger({ line: 0, ch: 8 }, editor, null);
            expect(triggerInfo).not.toBeNull();
            expect(triggerInfo?.query).toBe('');
        });

        it('should trigger with a query when text follows "[["', () => {
            const editor = createMockEditor('Link to [[some note', 18);
            const triggerInfo = suggester.onTrigger({ line: 0, ch: 18 }, editor, null);
            expect(triggerInfo).not.toBeNull();
            expect(triggerInfo?.query).toBe('some note');
        });

        it('should not trigger if "[[" is not present', () => {
            const editor = createMockEditor('Just some text', 14);
            const triggerInfo = suggester.onTrigger({ line: 0, ch: 14 }, editor, null);
            expect(triggerInfo).toBeNull();
        });
    });

    describe('getSuggestions', () => {
        it('should return recent files when query is empty', async () => {
            const editor = createMockEditor('[[', 2);
            const context = createMockEditorSuggestContext(editor, '', 2, 2);

            const suggestions = await suggester.getSuggestions(context);

            expect(suggestions.length).toBe(2);
            expect(suggestions[0].displayText).toBe('Recent Note 1');
            expect(suggestions[1].displayText).toBe('Recent Note 2');
            expect(mockOmnisearch.search).not.toHaveBeenCalled();
        });

        it('should filter recent files by query', async () => {
            const editor = createMockEditor('[[note 1', 8);
            const context = createMockEditorSuggestContext(editor, 'note 1', 2, 8);

            const suggestions = await suggester.getSuggestions(context);

            expect(suggestions.length).toBe(1);
            expect(suggestions[0].displayText).toBe('Recent Note 1');
        });

        it('should call omnisearch and combine results', async () => {
            const editor = createMockEditor('[[omni', 6);
            const context = createMockEditorSuggestContext(editor, 'omni', 2, 6);

            mockOmnisearch.search.mockResolvedValue([
                { basename: 'Omni Result 1', path: 'omni1.md', score: 10, matches: [] },
                { basename: 'Omni Result 2', path: 'omni2.md', score: 5, matches: [] },
            ]);

            const suggestions = await suggester.getSuggestions(context);

            expect(suggestions.length).toBe(2);
            expect(suggestions[0].displayText).toBe('Omni Result 1');
            expect(suggestions[1].displayText).toBe('Omni Result 2');
            expect(mockOmnisearch.search).toHaveBeenCalledWith('omni');
        });

        it('should filter out the current file from suggestions', async () => {
            const editor = createMockEditor('[[recent', 8);
            const context = createMockEditorSuggestContext(editor, 'recent', 2, 8);
            context.file = createMockTFile('recent1.md', 'Recent Note 1'); // Set current file

            const suggestions = await suggester.getSuggestions(context);

            expect(suggestions.length).toBe(1);
            expect(suggestions[0].displayText).toBe('Recent Note 2');
        });
    });
});
