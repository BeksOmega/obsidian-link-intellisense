/**
 * @file This file contains the EnhancedLinkSuggester class, which provides an
 * enhanced link suggestion experience in Obsidian.
 * @author Beka
 * @license MIT
 */
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
 * @interface MySuggestion
 * @description Represents a suggestion item in the link suggester. This interface
 * defines the structure for each suggestion that will be displayed to the user.
 */
interface MySuggestion {
	/** @property {"note" | "alias" | "heading" | "block" | "content"} type - The type of the suggestion. */
	type: "note" | "alias" | "heading" | "block" | "content";
	/** @property {string} displayText - The text to display in the suggestion list. */
	displayText: string;
	/** @property {string} insertText - The text to insert into the editor when selected. */
	insertText: string;
	/** @property {string} filePath - The file path of the suggestion. */
	filePath: string;
	/** @property {number} score - The score used for sorting results. */
	score: number;
	/** @property {boolean} [isRecent] - Flag indicating if the suggestion is from a recent file. */
	isRecent?: boolean;
	/** @property {string} [content] - A content preview for the suggestion. */
	content?: string;
	/** @property {Array<{match: string, offset: number}>} [matches] - Matches for highlighting (currently unused). */
	matches?: { match: string; offset: number }[];
}

/**
 * @class EnhancedLinkSuggester
 * @extends EditorSuggest<MySuggestion>
 * @description Provides an enhanced link suggestion experience for Obsidian,
 * leveraging the Omnisearch plugin for content-based search.
 */
export class EnhancedLinkSuggester extends EditorSuggest<MySuggestion> {
	/**
	 * @private
	 * @property {TFile[]} recentFiles - A list of recently opened files.
	 */
	private recentFiles: TFile[] = [];
	/**
	 * @private
	 * @readonly
	 * @property {number} MAX_RECENT_FILES - The maximum number of recent files to track.
	 */
	private readonly MAX_RECENT_FILES = 20;
	/**
	 * @private
	 * @readonly
	 * @property {number} CHARS_BEFORE_MATCH - The number of characters to show before a match in the content preview.
	 */
	private readonly CHARS_BEFORE_MATCH = 20;
	/**
	 * @private
	 * @property {typeof window.omnisearch} omnisearchApi - The Omnisearch API instance.
	 */
	private omnisearchApi: typeof window.omnisearch;

	/**
	 * @constructor
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
	 * @private
	 * @method getFirstLineWithoutFrontmatter
	 * @description Gets the first non-empty line of a file's content, excluding frontmatter.
	 * @param {TFile} file - The file to read.
	 * @returns {Promise<string>} The first non-empty line of content.
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
		return "";
	}

	/**
	 * @private
	 * @method updateRecentFiles
	 * @description Updates the list of recent files from the workspace.
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
	 * @public
	 * @method onTrigger
	 * @description Called by Obsidian to determine if the suggester should be triggered.
	 * Triggers on `[[` followed by some text.
	 * @param {EditorPosition} cursor - The current cursor position.
	 * @param {Editor} editor - The editor instance.
	 * @param {TFile | null} file - The current file.
	 * @returns {EditorSuggestTriggerInfo | null} Trigger info or `null`.
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
	 * @public
	 * @method getSuggestions
	 * @description Called by Obsidian to get suggestions for the current query.
	 * Combines results from recent files and an Omnisearch query.
	 * @param {EditorSuggestContext} context - The suggestion context.
	 * @returns {Promise<MySuggestion[]>} A promise resolving to a list of suggestions.
	 */
	async getSuggestions(
		context: EditorSuggestContext
	): Promise<MySuggestion[]> {
		const query = context.query.toLowerCase();
		const uniqueSuggestions = new Map<string, MySuggestion>();
		const recentMatches: MySuggestion[] = [];
		const currentFilePath = context.file?.path;

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
							insertText: `${file.basename}|${alias.original}`,
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
	 * @public
	 * @method renderSuggestion
	 * @description Renders a single suggestion item in the suggestion list.
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
	 * @public
	 * @method selectSuggestion
	 * @description Called when a suggestion is selected by the user. Replaces the
	 * trigger text with the selected link.
	 * @param {MySuggestion} suggestion - The selected suggestion.
	 * @param {KeyboardEvent | MouseEvent} event - The event that triggered the selection.
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
