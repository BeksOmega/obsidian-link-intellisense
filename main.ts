/**
 * @file This file is the main entry point for the Enhanced Link Suggestions plugin.
 * @author Beka
 * @license MIT
 */
import { Plugin, Notice, App } from "obsidian";
import { EnhancedLinkSuggester } from "./EnhancedLinkSuggester";

/**
 * @global
 * @interface Window
 * @description Extends the global Window interface to include the Omnisearch API.
 * This allows for checking the presence of the Omnisearch plugin and accessing its
 * functionalities throughout the plugin.
 */
declare global {
	interface Window {
		/**
		 * @property {object} [omnisearch]
		 * @description The Omnisearch global object, available if the plugin is active.
		 * It provides access to the Omnisearch API, primarily the `search` method.
		 */
		omnisearch?: {
			/**
			 * @function search
			 * @description Performs a search using the Omnisearch plugin.
			 * @param {string} query The search query.
			 * @returns {Promise<Array<object>>} A promise that resolves to an array of search results.
			 */
			search: (query: string) => Promise<
				{
					basename: string;
					excerpt: string;
					path: string;
					score: number;
					matches: { match: string; offset: number }[];
				}[]
			>;
		};
	}
}

/**
 * @class EnhancedLinkPlugin
 * @extends Plugin
 * @description The main class for the Enhanced Link Suggestions plugin. It handles
 * the plugin's lifecycle, including loading and unloading. It also integrates with
 * the Omnisearch plugin to provide context-aware link suggestions.
 */
export default class EnhancedLinkPlugin extends Plugin {
	/**
	 * @constructor
	 * @param {App} app The Obsidian App instance.
	 * @param {any} manifest The plugin manifest, containing metadata.
	 */
	constructor(app: App, manifest: any) {
		super(app, manifest);
	}

	/**
	 * @method onload
	 * @description This method is called when the plugin is loaded. It checks for the
	 * presence of the Omnisearch plugin and registers the EnhancedLinkSuggester if
	 * Omnisearch is available. If not, it displays a notice to the user.
	 * @returns {Promise<void>}
	 */
	async onload() {
		console.log("Loading Enhanced Link Plugin");

		if (
			typeof window.omnisearch === "undefined" ||
			typeof window.omnisearch.search !== "function"
		) {
			new Notice(
				"Enhanced Link Suggestions: Omnisearch plugin is **required** and not found/active. This plugin will not function.",
				10000
			);
			console.error(
				"Omnisearch plugin is required but not loaded or its search function is unavailable."
			);
			return;
		}

		console.log("Omnisearch detected and will be used.");
		this.registerEditorSuggest(
			new EnhancedLinkSuggester(this.app, window.omnisearch)
		);
	}

	/**
	 * @method onunload
	 * @description This method is called when the plugin is unloaded. It logs a
	 * message to the console for debugging purposes. Any resources registered in
	 * `onload` are automatically cleaned up by Obsidian.
	 * @returns {void}
	 */
	onunload() {
		console.log("Unloading Enhanced Link Plugin");
	}
}
