import {
    App,
    Editor,
    EditorPosition,
    EditorSuggest,
    EditorSuggestContext,
    EditorSuggestTriggerInfo,
    TFile,
    fuzzySearch, // Ensure this is imported
    FrontMatterCache,
    HeadingCache,
    BlockCache,
} from 'obsidian';
import { debounced } from './utils';

interface MySuggestion {
    type: 'note' | 'alias' | 'heading' | 'block' | 'content';
    displayText: string;
    insertText: string;
    filePath: string;
    score: number;
    isRecent?: boolean;
}

export class EnhancedLinkSuggester extends EditorSuggest<MySuggestion> {
    private debouncedGetSuggestions: (context: EditorSuggestContext) => Promise<MySuggestion[]>;
    private recentFiles: TFile[] = [];
    private readonly MAX_RECENT_FILES = 20;
    private omnisearchApi: typeof window.omnisearch;

    constructor(app: App, omnisearchApi: typeof window.omnisearch) {
        super(app);
        this.omnisearchApi = omnisearchApi;
        this.debouncedGetSuggestions = debounced(this._getSuggestions.bind(this), 300);
        this.updateRecentFiles();
        this.app.workspace.on('file-open', () => this.updateRecentFiles()); // Bind 'this' context correctly
    }

    private updateRecentFiles(): void {
        const recentFilePaths = this.app.workspace.getLastOpenFiles().slice(0, this.MAX_RECENT_FILES);
        this.recentFiles = recentFilePaths
            .map(path => this.app.vault.getFileByPath(path))
            .filter((file): file is TFile => file instanceof TFile);
    }

    onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null): EditorSuggestTriggerInfo | null {
        const line = editor.getLine(cursor.line);
        const match = line.substring(0, cursor.ch).match(/\[\[([^\]]*)$/);
        if (match) {
            return {
                start: { line: cursor.line, ch: match.index! + 2 },
                end: cursor,
                query: match[1],
            };
        }
        return null;
    }

    async getSuggestions(context: EditorSuggestContext): Promise<MySuggestion[]> {
        // Store context for use in _getSuggestions if needed for editor operations
        // this.context is already available in EditorSuggest
        return this.debouncedGetSuggestions(context);
    }

    private async _getSuggestions(context: EditorSuggestContext): Promise<MySuggestion[]> {
        const query = context.query.toLowerCase();
        const uniqueSuggestions = new Map<string, MySuggestion>();
        let recentMatches: MySuggestion[] = [];

        // --- Stage 1: Recent Files (from previous step, ensure it's complete) ---
        for (const file of this.recentFiles) {
            const cache = this.app.metadataCache.getFileCache(file);
            if (!cache) continue;

            const titleMatchResult = query === '' ? null : fuzzySearch(query, file.basename.toLowerCase());
            if (query === '' || titleMatchResult) {
                recentMatches.push({
                    type: 'note',
                    displayText: file.basename,
                    insertText: file.basename,
                    filePath: file.path,
                    score: query === '' ? 10000 : (titleMatchResult?.score || 0) + (query === file.basename.toLowerCase() ? 1000 : 0), // Boost exact recent title
                    isRecent: true,
                });
            }

            if (query !== '') {
                const frontmatter = cache.frontmatter as FrontMatterCache;
                if (frontmatter && frontmatter.aliases) {
                    for (const alias of frontmatter.aliases) {
                        if (typeof alias === 'string') {
                            const aliasMatchResult = fuzzySearch(query, alias.toLowerCase());
                            if (aliasMatchResult) {
                                recentMatches.push({
                                    type: 'alias',
                                    displayText: alias,
                                    insertText: `${file.basename}|${alias}`,
                                    filePath: file.path,
                                    score: aliasMatchResult.score + (query === alias.toLowerCase() ? 500 : 0), // Boost exact alias
                                    isRecent: true,
                                });
                            }
                        }
                    }
                }

                if (cache.headings) {
                    for (const heading of cache.headings) {
                        const headingMatchResult = fuzzySearch(query, heading.heading.toLowerCase());
                        if (headingMatchResult) {
                            recentMatches.push({
                                type: 'heading',
                                displayText: heading.heading,
                                insertText: `${file.basename}#${heading.heading}`,
                                filePath: file.path,
                                score: headingMatchResult.score,
                                isRecent: true,
                            });
                        }
                    }
                }

                if (cache.blocks && this.context?.editor) { // Ensure editor context is available
                    for (const blockId in cache.blocks) {
                        if (Object.prototype.hasOwnProperty.call(cache.blocks, blockId)) {
                            const blockDefinition = cache.blocks[blockId];
                            let blockTextContent = "";
                            try {
                               const fileContent = await this.app.vault.cachedRead(file);
                               const blockPosition = blockDefinition.position;
                               // Need editor instance to convert pos to offset
                               const editor = this.context.editor;
                               const startOffset = editor.posToOffset(blockPosition.start);
                               const endOffset = editor.posToOffset(blockPosition.end);
                               blockTextContent = fileContent.substring(startOffset, endOffset);
                            } catch (e) {
                                console.warn("Could not read block content for recent file search:", e);
                            }

                            if (blockTextContent) {
                                const blockMatchResult = fuzzySearch(query, blockTextContent.toLowerCase().slice(0, 256)); // Search on first 256 chars for perf
                                if (blockMatchResult) {
                                    recentMatches.push({
                                        type: 'block',
                                        displayText: blockTextContent.split('\n')[0].substring(0, 80),
                                        insertText: `${file.basename}#^${blockId}`,
                                        filePath: file.path,
                                        score: blockMatchResult.score,
                                        isRecent: true,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        recentMatches.sort((a, b) => b.score - a.score); // Sort recent matches by their own scores first
        for (const sug of recentMatches) {
            if (!uniqueSuggestions.has(sug.insertText) || (uniqueSuggestions.get(sug.insertText)!.score < sug.score) ) {
                 uniqueSuggestions.set(sug.insertText, sug);
            }
        }

        // --- Stage 2: Omnisearch (if query exists) ---
        if (query.length > 0 && this.omnisearchApi) {
            try {
                const omniResults = await this.omnisearchApi.search(query);
                for (const result of omniResults) {
                    const file = this.app.vault.getFileByPath(result.path);
                    if (file) {
                        const omniSug: MySuggestion = {
                            type: 'content', // Omnisearch results are 'content' type
                            displayText: file.basename, // Display note title
                            insertText: file.basename,  // Insert note title (standard link)
                            filePath: file.path,
                            score: result.score, // Use Omnisearch's score
                            isRecent: this.recentFiles.some(rf => rf.path === file.path) // Mark if it's also a recent file
                        };

                        const existingSug = uniqueSuggestions.get(omniSug.insertText);
                        if (!existingSug) {
                            uniqueSuggestions.set(omniSug.insertText, omniSug);
                        } else {
                            // As per plan: "Add to uniqueSuggestions only if not already present or if Omnisearch score is higher
                            // AND existing suggestion is not 'note' or 'alias'".
                            // This means Omnisearch can replace a 'heading' or 'block' or another 'content' match if its score is better for the same note.
                            // It should not replace a 'note' or 'alias' match from recents for the *same insertText*.
                            // If existing is 'note' or 'alias', we prefer that, unless Omnisearch found it AND it's also recent AND has a higher score.
                            // The current logic for recent files already tries to add note/alias with high scores.
                            // If Omnisearch finds a note that was *also* a recent 'note' or 'alias', and Omnisearch gives it a *higher* score,
                            // we might want to update. But the current structure adds recents first.
                            // Let's refine: if Omnisearch provides a result for the *same note* (insertText)
                            // and the existing one is from recents but only a heading/block match,
                            // and Omnisearch has a better score, it can be replaced.
                            // If the existing one is a note/alias from recents, it's likely preferred.
                            // The provided rule: "if (!existingSug || (existingSug.score < omniSug.score && existingSug.type !== 'note' && existingSug.type !== 'alias'))"
                            // This implies an Omnisearch result (type 'content') could replace a recent 'heading' or 'block' if its score is higher.
                            // This seems reasonable.
                            if (existingSug.type !== 'note' && existingSug.type !== 'alias') {
                                if (omniSug.score > existingSug.score) {
                                    uniqueSuggestions.set(omniSug.insertText, omniSug);
                                }
                            } else if (existingSug.type === 'content' && omniSug.score > existingSug.score) {
                                // If existing is also content, replace if new score is higher
                                uniqueSuggestions.set(omniSug.insertText, omniSug);
                            }
                        }
                    }
                }
            } catch (e) {
                console.error("Error using Omnisearch:", e);
                // Optionally, notify the user that Omnisearch failed for this query
                // new Notice("Omnisearch query failed.", 3000);
            }
        }

        // Convert map to array
        let suggestions = Array.from(uniqueSuggestions.values());

        // Final sorting logic
        suggestions.sort((a, b) => {
            // Prioritize recent items
            if (a.isRecent && !b.isRecent) return -1;
            if (!a.isRecent && b.isRecent) return 1;

            // If both are recent or both are not, sort by score descending
            // Within recents, 'note' and 'alias' types might be boosted by earlier scoring.
            // If types are different but scores are similar, this doesn't differentiate further,
            // but the scores themselves should reflect preference (e.g. exact recent title match has high score).
            return b.score - a.score;
        });

        return suggestions;
    }

    // --- Part 4: Rendering and Selection ---
    renderSuggestion(suggestion: MySuggestion, el: HTMLElement): void {
        el.empty(); // Clear any existing content
        // As per plan: "display only the Note Title" (or alias/heading/block snippet for displayText)
        // "Do not show the file path or indicate the type of link"
        el.createEl('div', { text: suggestion.displayText, cls: 'enhanced-link-suggestion-text' });
    }

    selectSuggestion(suggestion: MySuggestion, event: KeyboardEvent | MouseEvent): void {
        // this.context is provided by EditorSuggest and should be available here
        if (!this.context || !this.context.editor) {
            return;
        }

        this.context.editor.replaceRange(
            `[[${suggestion.insertText}]]`, // Use the pre-formatted insertText
            this.context.start,
            this.context.end
        );

        // No need to close the suggester explicitly, Obsidian handles it.
    }
}
