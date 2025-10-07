import {
	App,
	Editor,
	EditorPosition,
	EditorSuggest,
	EditorSuggestContext,
	EditorSuggestTriggerInfo,
	TFile,
	FrontMatterCache,
	HeadingCache,
} from "obsidian";
import * as fuzzy from "fuzzy";

/**
 * Represents a suggestion item in the link suggester. This interface defines the structure
 * for each suggestion that will be displayed to the user.
 * @interface MySuggestion
 * @property {"note" | "alias" | "heading" | "block" | "content"} type - The type of the suggestion, used for potential styling or logic.
 * @property {string} displayText - The text to display in the suggestion list (e.g., a note's basename or an alias).
 * @property {string} insertText - The text to insert into the editor when the suggestion is selected (e.g., `basename#heading`).
 * @property {string} filePath - The file path of the suggestion, used for filtering and identification.
 * @property {number} score - The score of the suggestion, used for sorting results. Higher is better.
 * @property {boolean} [isRecent] - A flag indicating if the suggestion is from a recently opened file.
 * @property {string} [content] - A content preview for the suggestion, such as the first line of a note.
 * @property {Array<{match: string, offset: number}>} [matches] - The matches of the query within the suggestion text, for highlighting (currently unused).
 */
interface MySuggestion {
	type: "note" | "alias" | "heading" | "block" | "content";
	displayText: string;
	insertText: string;
	filePath: string;
	score: number;
	isRecent?: boolean;
	content?: string;
	matches?: { match: string; offset: number }[];
}

/**
 * Provides an enhanced link suggestion experience for Obsidian.
 * It extends the EditorSuggest class to provide context-aware link suggestions,
 * leveraging the Omnisearch plugin for content-based search.
 * @extends EditorSuggest<MySuggestion>
 */
export class EnhancedLinkSuggester extends EditorSuggest<MySuggestion> {
	/**
	 * A list of recently opened files, kept in memory for quick access.
	 * @private
	 */
	private recentFiles: TFile[] = [];
	/**
	 * The maximum number of recent files to keep track of.
	 * @private
	 * @readonly
	 */
	private readonly MAX_RECENT_FILES = 20;
	/**
	 * The number of characters to show before a match in the content preview.
	 * @private
	 * @readonly
	 */
	private readonly CHARS_BEFORE_MATCH = 20;
	/**
	 * The Omnisearch API instance, passed in during initialization.
	 * @private
	 */
	private omnisearchApi: typeof window.omnisearch;

	/**
	 * Creates an instance of EnhancedLinkSuggester.
	 * @param {App} app - The Obsidian App instance, used for accessing vault and workspace data.
	 * @param {typeof window.omnisearch} omnisearchApi - The Omnisearch API instance for content-based searching.
	 */
	constructor(app: App, omnisearchApi: typeof window.omnisearch) {
		super(app);
		this.omnisearchApi = omnisearchApi;
		this.updateRecentFiles();
		this.app.workspace.on("file-open", () => this.updateRecentFiles());
	}

	/**
	 * Gets the first non-empty line of a file's content, excluding the frontmatter.
	 * This is used to provide a content preview in the suggestion list.
	 * @private
	 * @param {TFile} file - The file to read.
	 * @returns {Promise<string>} The first line of the file's content after the frontmatter.
	 */
	private async getFirstLineWithoutFrontmatter(file: TFile): Promise<string> {
		const content = await this.app.vault.cachedRead(file);
		const cache = this.app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter;

		const lines = content.split("\n");
		let startLine = 0;

		if (frontmatter && frontmatter.position) {
			startLine = frontmatter.position.end.line + 1;
		}

		for (let i = startLine; i < lines.length; i++) {
			const trimmedLine = lines[i].trim();
			if (trimmedLine) {
				return trimmedLine;
			}
		}
		return ""; // Return empty string if no content is found after the frontmatter
	}

	/**
	 * Updates the list of recent files by fetching the latest from the workspace.
	 * @private
	 * @returns {void}
	 */
	private updateRecentFiles(): void {
		const recentFilePaths = this.app.workspace
			.getLastOpenFiles()
			.slice(0, this.MAX_RECENT_FILES);
		this.recentFiles = recentFilePaths
			.map((path) => this.app.vault.getFileByPath(path))
			.filter((file): file is TFile => file instanceof TFile);
	}

	/**
	 * This method is called by Obsidian to determine if the suggester should be triggered.
	 * It triggers when the user types `[[` followed by some text.
	 * @param {EditorPosition} cursor - The current cursor position in the editor.
	 * @param {Editor} editor - The editor instance.
	 * @param {TFile | null} file - The file the editor is currently in.
	 * @returns {EditorSuggestTriggerInfo | null} Information about the trigger, or `null` if it shouldn't trigger.
	 */
	onTrigger(
		cursor: EditorPosition,
		editor: Editor,
		file: TFile | null
	): EditorSuggestTriggerInfo | null {
		const line = editor.getLine(cursor.line);
		const match = line.substring(0, cursor.ch).match(/\[([^\]]*)$/);
		if (match) {
			return {
				start: {
					line: cursor.line,
					ch: match.index!,
				},
				end: {
					line: cursor.line,
					ch: cursor.ch + 1,
				},
				query: match[1],
			};
		}
		return null;
	}

	/**
	 * This method is called by Obsidian to get the suggestions for the current query.
	 * It combines results from recent files and an Omnisearch query.
	 * @param {EditorSuggestContext} context - The context for the suggestions, including the query.
	 * @returns {Promise<MySuggestion[]>} A promise that resolves to a sorted list of suggestions.
	 */
	async getSuggestions(
		context: EditorSuggestContext
	): Promise<MySuggestion[]> {
		const query = context.query.toLowerCase();
		const uniqueSuggestions = new Map<string, MySuggestion>();
		const recentMatches: MySuggestion[] = [];
		const currentFilePath = context.file?.path;

		// Stage 1: Search within recent files for matches in title, aliases, and headings.
		for (const file of this.recentFiles) {
			const cache = this.app.metadataCache.getFileCache(file);
			if (!cache) continue;

			// Match against file title
			const titleMatchResult = fuzzy.filter(query, [
				file.basename.toLowerCase(),
			]);
			if (titleMatchResult.length > 0) {
				const firstLine = await this.getFirstLineWithoutFrontmatter(file);
				recentMatches.push({
					type: "note",
					displayText: file.basename,
					insertText: file.basename,
					filePath: file.path,
					score: 1000,
					isRecent: true,
					content: firstLine,
				});
			}

			if (query !== "") {
				// Match against aliases
				const frontmatter = cache.frontmatter as FrontMatterCache;
				if (frontmatter && frontmatter.aliases) {
					const aliases = fuzzy.filter<string>(
						query,
						frontmatter.aliases
					);
					for (const alias of aliases) {
						const firstLine = await this.getFirstLineWithoutFrontmatter(file);
						recentMatches.push({
							type: "alias",
							displayText: alias.original,
							insertText: `${file.basename}|${alias.original}`,
							filePath: file.path,
							score: 500,
							isRecent: true,
							content: firstLine,
						});
					}
				}

				// Match against headings
				if (cache.headings) {
					const headings = fuzzy.filter<HeadingCache>(
						query,
						cache.headings,
						{
							extract: (heading) => heading.heading.toLowerCase(),
						}
					);
					for (const heading of headings) {
						recentMatches.push({
							type: "heading",
							displayText: heading.original.heading,
							insertText: `${file.basename}#${heading.original.heading}`,
							filePath: file.path,
							score: 100,
							isRecent: true,
						});
					}
				}
			}
		}

		for (const sug of recentMatches) {
			if (
				!uniqueSuggestions.has(sug.insertText) ||
				uniqueSuggestions.get(sug.insertText)!.score < sug.score
			) {
				uniqueSuggestions.set(sug.insertText, sug);
			}
		}

		// Stage 2: If there's a query, use Omnisearch to find content-based matches.
		if (query.length > 0 && this.omnisearchApi) {
			try {
				const omniResults = await this.omnisearchApi.search(query);
				for (const result of omniResults) {
					let firstLineContent = "";
					const file = this.app.vault.getFileByPath(result.path);
					if (file) {
						firstLineContent = await this.getFirstLineWithoutFrontmatter(file);
					}

					const omniSug: MySuggestion = {
						type: "content",
						displayText: result.basename,
						insertText: result.basename,
						filePath: result.path,
						score: result.score,
						isRecent: this.recentFiles.some(
							(rf) => rf.path === result.path
						),
						content: firstLineContent,
						matches: [],
					};

					const existingSug = uniqueSuggestions.get(
						omniSug.insertText
					);
					if (!existingSug || omniSug.score > existingSug.score) {
						uniqueSuggestions.set(omniSug.insertText, omniSug);
					}
				}
			} catch (e) {
				console.error("Error using Omnisearch:", e);
			}
		}

		// Combine, filter, and sort the suggestions.
		const suggestions = Array.from(uniqueSuggestions.values());
		const filteredSuggestions = suggestions.filter(
			(sug) => sug.filePath !== currentFilePath
		);

		filteredSuggestions.sort((a, b) => {
			if (a.isRecent && !b.isRecent) return -1;
			if (!a.isRecent && b.isRecent) return 1;
			return b.score - a.score;
		});

		return filteredSuggestions;
	}

	/**
	 * Renders a single suggestion item in the suggestion list.
	 * @param {MySuggestion} suggestion - The suggestion to render.
	 * @param {HTMLElement} el - The HTML element to render the suggestion into.
	 * @returns {void}
	 */
	renderSuggestion(suggestion: MySuggestion, el: HTMLElement): void {
		el.empty();
		const container = el.createDiv("enhanced-link-suggestion-container");

		container.createEl("div", {
			text: suggestion.displayText,
			cls: "enhanced-link-suggestion-text",
		});

		if (suggestion.content) {
			const contentDiv = container.createDiv(
				"enhanced-link-suggestion-content"
			);
			contentDiv.setText(suggestion.content);
		}
	}

	/**
	 * This method is called when a suggestion is selected by the user.
	 * It replaces the trigger text with the selected link.
	 * @param {MySuggestion} suggestion - The selected suggestion.
	 * @param {KeyboardEvent | MouseEvent} event - The keyboard or mouse event that triggered the selection.
	 * @returns {void}
	 */
	selectSuggestion(
		suggestion: MySuggestion,
		event: KeyboardEvent | MouseEvent
	): void {
		if (!this.context || !this.context.editor) {
			return;
		}

		this.context.editor.replaceRange(
			`[[${suggestion.insertText}]]`,
			this.context.start,
			this.context.end
		);
	}
}
