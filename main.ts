import { Plugin, Notice, App } from "obsidian";
import { EnhancedLinkSuggester } from "./EnhancedLinkSuggester"; // Assuming EnhancedLinkSuggester will be in the same directory

// Type declaration for Omnisearch global object
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
 * It handles the plugin's lifecycle, including loading and unloading.
 */
export default class EnhancedLinkPlugin extends Plugin {
	// No need for isOmnisearchAvailable property as per the latest plan,
	// the check is done directly in onload.

	/**
	 * Creates an instance of EnhancedLinkPlugin.
	 * @param {App} app - The Obsidian App instance.
	 * @param {any} manifest - The plugin manifest.
	 */
	constructor(app: App, manifest: any) {
		super(app, manifest);
	}

	/**
	 * This method is called when the plugin is loaded.
	 * It checks for the presence of the Omnisearch plugin and registers the EnhancedLinkSuggester if it's available.
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
	 * It logs a message to the console.
	 */
	onunload() {
		console.log("Unloading Enhanced Link Plugin");
		// Obsidian automatically handles unregistering editor suggesters.
		// If other event listeners or resources were added, they would be cleaned up here.
	}
}
