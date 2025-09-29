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
 * Represents a suggestion item in the link suggester.
 */
interface MySuggestion {
	/** The type of the suggestion. */
	type: "note" | "alias" | "heading" | "block" | "content";
	/** The text to display in the suggestion list. */
	displayText: string;
	/** The text to insert into the editor when the suggestion is selected. */
	insertText: string;
	/** The file path of the suggestion. */
	filePath: string;
	/** The score of the suggestion, used for sorting. */
	score: number;
	/** Whether the suggestion is from a recent file. */
	isRecent?: boolean;
	/** The content of the suggestion, used for preview. */
	content?: string;
	/** The matches of the query in the suggestion. */
	matches?: { match: string; offset: number }[];
}

/**
 * EnhancedLinkSuggester provides an enhanced link suggestion experience for Obsidian.
 * It extends the EditorSuggest class to provide context-aware link suggestions.
 */
export class EnhancedLinkSuggester extends EditorSuggest<MySuggestion> {
	/**
	 * A list of recently opened files.
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
	 * The number of characters to show before a match in the content.
	 * @private
	 * @readonly
	 */
	private readonly CHARS_BEFORE_MATCH = 20;
	/**
	 * The Omnisearch API instance.
	 * @private
	 */
	private omnisearchApi: typeof window.omnisearch;

	/**
	 * Creates an instance of EnhancedLinkSuggester.
	 * @param {App} app - The Obsidian App instance.
	 * @param {typeof window.omnisearch} omnisearchApi - The Omnisearch API instance.
	 */
	constructor(app: App, omnisearchApi: typeof window.omnisearch) {
		super(app);
		this.omnisearchApi = omnisearchApi;
		this.updateRecentFiles();
		this.app.workspace.on("file-open", () => this.updateRecentFiles());
	}

	/**
	 * Gets the first line of a file, excluding frontmatter.
	 * @private
	 * @param {TFile} file - The file to read.
	 * @returns {Promise<string>} The first line of the file without frontmatter.
	 */
	private async getFirstLineWithoutFrontmatter(file: TFile): Promise<string> {
		const content = await this.app.vault.cachedRead(file);
		const cache = this.app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter;

		const lines = content.split("\n");
		let startLine = 0;

		if (frontmatter && frontmatter.position) {
			// frontmatter.position.end.line is the line number of the closing '---'
			// So, the actual content starts from the line after it.
			startLine = frontmatter.position.end.line + 1;
		}

		for (let i = startLine; i < lines.length; i++) {
			const trimmedLine = lines[i].trim();
			if (trimmedLine) {
				return trimmedLine;
			}
		}
		return ""; // Return empty string if no content found after frontmatter
	}

	/**
	 * Updates the list of recent files.
	 * @private
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
	 * @param {EditorPosition} cursor - The current cursor position.
	 * @param {Editor} editor - The editor instance.
	 * @param {TFile | null} file - The file the editor is in.
	 * @returns {EditorSuggestTriggerInfo | null} The trigger info if the suggester should be triggered, otherwise null.
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
					// This assumes that you have matching brackets turned on.
					ch: cursor.ch + 1,
				},
				query: match[1],
			};
		}
		return null;
	}

	/**
	 * This method is called by Obsidian to get the suggestions.
	 * @param {EditorSuggestContext} context - The context for the suggestions.
	 * @returns {Promise<MySuggestion[]>} A promise that resolves to a list of suggestions.
	 */
	async getSuggestions(
		context: EditorSuggestContext
	): Promise<MySuggestion[]> {
		const query = context.query.toLowerCase();
		const uniqueSuggestions = new Map<string, MySuggestion>();
		const recentMatches: MySuggestion[] = [];
		const currentFilePath = context.file?.path;

		// --- Stage 1: Recent Files (from previous step, ensure it's complete) ---
		for (const file of this.recentFiles) {
			const cache = this.app.metadataCache.getFileCache(file);
			if (!cache) continue;

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
							insertText: `${file.basename}|${alias.original}`, // Use alias.original for insertText
							filePath: file.path,
							score: 500,
							isRecent: true,
							content: firstLine,
						});
					}
				}

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

		// --- Stage 2: Omnisearch (if query exists) ---
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
						type: "content", // Omnisearch results are 'content' type
						displayText: result.basename, // Display note title
						insertText: result.basename, // Insert note title (standard link)
						filePath: result.path,
						score: result.score, // Use Omnisearch's score
						isRecent: this.recentFiles.some(
							(rf) => rf.path === result.path
						), // Mark if it's also a recent file
						content: firstLineContent, // Use the first line without frontmatter
						matches: [], // Matches are no longer highlighted in preview
					};

					const existingSug = uniqueSuggestions.get(
						omniSug.insertText
					);
					if (!existingSug) {
						uniqueSuggestions.set(omniSug.insertText, omniSug);
					} else {
						if (omniSug.score > existingSug.score) {
							uniqueSuggestions.set(omniSug.insertText, omniSug);
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
		const suggestions = Array.from(uniqueSuggestions.values());

		// Filter out current file
		const filteredSuggestions = suggestions.filter(
			(sug) => sug.filePath !== currentFilePath
		);

		// Final sorting logic
		filteredSuggestions.sort((a, b) => {
			// Prioritize recent items
			if (a.isRecent && !b.isRecent) return -1;
			if (!a.isRecent && b.isRecent) return 1;

			// If both are recent or both are not, sort by score descending
			return b.score - a.score;
		});

		return filteredSuggestions;
	}

	/**
	 * Renders a suggestion item.
	 * @param {MySuggestion} suggestion - The suggestion to render.
	 * @param {HTMLElement} el - The HTML element to render the suggestion in.
	 */
	renderSuggestion(suggestion: MySuggestion, el: HTMLElement): void {
		el.empty();
		const container = el.createDiv("enhanced-link-suggestion-container");

		// Main text (title/alias/heading)
		container.createEl("div", {
			text: suggestion.displayText,
			cls: "enhanced-link-suggestion-text",
		});

		// Content preview
		if (suggestion.content) {
			const contentDiv = container.createDiv(
				"enhanced-link-suggestion-content"
			);
			contentDiv.setText(suggestion.content);
		}
	}

	/**
	 * This method is called when a suggestion is selected.
	 * @param {MySuggestion} suggestion - The selected suggestion.
	 * @param {KeyboardEvent | MouseEvent} event - The keyboard or mouse event.
	 */
	selectSuggestion(
		suggestion: MySuggestion,
		event: KeyboardEvent | MouseEvent
	): void {
		if (!this.context || !this.context.editor) {
			return;
		}

		this.context.editor.replaceRange(
			`[[${suggestion.insertText}]]`, // Use the pre-formatted insertText
			this.context.start,
			this.context.end
		);
	}
}
