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

export class EnhancedLinkSuggester extends EditorSuggest<MySuggestion> {
	private recentFiles: TFile[] = [];
	private readonly MAX_RECENT_FILES = 20;
	private readonly CHARS_BEFORE_MATCH = 20;
	private omnisearchApi: typeof window.omnisearch;

	constructor(app: App, omnisearchApi: typeof window.omnisearch) {
		super(app);
		this.omnisearchApi = omnisearchApi;
		this.updateRecentFiles();
		this.app.workspace.on("file-open", () => this.updateRecentFiles());
	}

	private updateRecentFiles(): void {
		const recentFilePaths = this.app.workspace
			.getLastOpenFiles()
			.slice(0, this.MAX_RECENT_FILES);
		this.recentFiles = recentFilePaths
			.map((path) => this.app.vault.getFileByPath(path))
			.filter((file): file is TFile => file instanceof TFile);
	}

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
				// Get first line of content
				const content = await this.app.vault.cachedRead(file);
				const firstLine = content.split("\n")[0].trim();

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
						// Get first line of content for aliases too
						const content = await this.app.vault.read(file);
						const firstLine = content.split("\n")[0].trim();

						recentMatches.push({
							type: "alias",
							displayText: alias.original,
							insertText: `${file.basename}|${alias}`,
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
					// Get content up to first <br>
					const excerpt = result.excerpt.split("<br>")[0];

					// Find all matches in the excerpt
					const newMatches: { match: string; offset: number }[] = [];
					const regex = new RegExp(query, "gi");
					let matchResult;
					while ((matchResult = regex.exec(excerpt)) !== null) {
						newMatches.push({
							match: matchResult[0],
							offset: matchResult.index,
						});
					}

					// Find earliest match to determine truncation
					const earliestMatch = newMatches.reduce(
						(earliest, current) =>
							!earliest || current.offset < earliest.offset
								? current
								: earliest,
						null as { offset: number } | null
					);

					// Truncate content before the first match
					let truncatedExcerpt = excerpt;
					let startIndex = 0;

					if (earliestMatch) {
						startIndex = Math.max(
							0,
							earliestMatch.offset - this.CHARS_BEFORE_MATCH
						);
						if (startIndex > 0) {
							truncatedExcerpt =
								"..." + excerpt.slice(startIndex);
							// Adjust match offsets for the truncation
							newMatches.forEach((match) => {
								match.offset = match.offset - startIndex + 3; // Add 3 for '...'
							});
						} else {
							truncatedExcerpt = excerpt.slice(startIndex);
							// Adjust match offsets for the truncation
							newMatches.forEach((match) => {
								match.offset = match.offset - startIndex;
							});
						}
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
						content: truncatedExcerpt,
						matches: newMatches,
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

	// --- Part 4: Rendering and Selection ---
	renderSuggestion(suggestion: MySuggestion, el: HTMLElement): void {
		el.empty();
		const container = el.createDiv("enhanced-link-suggestion-container");

		// Main text (title/alias/heading)
		container.createEl("div", {
			text: suggestion.displayText,
			cls: "enhanced-link-suggestion-text",
		});

		// Content preview for Omnisearch results
		if (suggestion.content) {
			const contentDiv = container.createDiv(
				"enhanced-link-suggestion-content"
			);

			if (suggestion.matches && suggestion.matches.length > 0) {
				// Sort matches by start position to handle overlapping matches
				const sortedMatches = [...suggestion.matches].sort(
					(a, b) => a.offset - b.offset
				);
				let lastIndex = 0;

				// Create text nodes and highlight spans for each match
				for (const match of sortedMatches) {
					// Add text before the match
					if (match.offset > lastIndex) {
						contentDiv.appendChild(
							document.createTextNode(
								suggestion.content.slice(
									lastIndex,
									match.offset
								)
							)
						);
					}

					// Add highlighted match
					contentDiv.createEl("span", {
						text: match.match,
						cls: "highlight",
					});

					lastIndex = match.offset + match.match.length;
				}

				// Add any remaining text after the last match
				if (lastIndex < suggestion.content.length) {
					contentDiv.appendChild(
						document.createTextNode(
							suggestion.content.slice(lastIndex)
						)
					);
				}
			} else {
				// If no matches, just show the content as is
				contentDiv.appendChild(
					document.createTextNode(suggestion.content)
				);
			}
		}
	}

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
