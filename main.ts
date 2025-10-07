import { Plugin, Notice, App } from "obsidian";
import { EnhancedLinkSuggester } from "./EnhancedLinkSuggester";

// Type declaration for Omnisearch global object
/**
 * Extends the global Window interface for the Omnisearch plugin.
 * @global
 * @interface Window
 * @property {object} [omnisearch] - The Omnisearch global object, available if the plugin is active.
 * @property {function(string): Promise<Array<object>>} [omnisearch.search] - The search function of the Omnisearch plugin.
 */
declare global {
	interface Window {
		omnisearch?: {
			search: (query: string) => Promise<
				{
					basename: string;
					excerpt: string;
					path: string;
					score: number;
					matches: { match: string; offset: number }[];
				}[]
			>;
			// Add other Omnisearch API methods you might use in the future
		};
	}
}

/**
 * EnhancedLinkPlugin is the main class for the Enhanced Link Suggestions plugin.
 * It handles the plugin's lifecycle, including loading and unloading, and integrates
 * with the Omnisearch plugin to provide enhanced link suggestions.
 * @extends Plugin
 */
export default class EnhancedLinkPlugin extends Plugin {
	/**
	 * Creates an instance of EnhancedLinkPlugin.
	 * @param {App} app - The Obsidian App instance, provided by Obsidian.
	 * @param {any} manifest - The plugin manifest, containing metadata about the plugin.
	 */
	constructor(app: App, manifest: any) {
		super(app, manifest);
	}

	/**
	 * This method is called when the plugin is loaded.
	 * It checks for the presence of the Omnisearch plugin and registers the
	 * EnhancedLinkSuggester if it's available. If Omnisearch is not found,
	 * it displays a notice to the user.
	 * @returns {Promise<void>}
	 */
	async onload() {
		console.log("Loading Enhanced Link Plugin test");

		if (
			typeof window.omnisearch === "undefined" ||
			typeof window.omnisearch.search !== "function"
		) {
			new Notice(
				"Enhanced Link Suggestions: Omnisearch plugin is **required** and not found/active. This plugin will not function.",
				10000
			); // Increased duration
			console.error(
				"Omnisearch plugin is required but not loaded or its search function is unavailable."
			);
			console.log(window);
			console.log(window.omnisearch);
			// Do not register the suggester and effectively disable the plugin's core feature
			return;
		} else {
			console.log("Omnisearch detected and will be used.");
			// Pass the omnisearch API directly to the suggester
			this.registerEditorSuggest(
				new EnhancedLinkSuggester(this.app, window.omnisearch)
			);
		}
	}

	/**
	 * This method is called when the plugin is unloaded.
	 * It logs a message to the console for debugging purposes. Any resources
	 * registered in `onload` are automatically cleaned up by Obsidian.
	 * @returns {void}
	 */
	onunload() {
		console.log("Unloading Enhanced Link Plugin");
		// Obsidian automatically handles unregistering editor suggesters.
		// If other event listeners or resources were added, they would be cleaned up here.
	}
}
