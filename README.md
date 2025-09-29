# Enhanced Link Intellisense for Obsidian

This plugin supercharges the note linking experience in Obsidian by providing more relevant and context-aware autocomplete suggestions. It focuses on recently accessed files and leverages the power of the Omnisearch plugin for comprehensive content search.

## !! Hard Dependency: Omnisearch Plugin !!

**This plugin WILL NOT WORK without the [Omnisearch plugin](https://github.com/scambier/obsidian-omnisearch) installed and enabled.**

Omnisearch is used for all content-based search suggestions. If Omnisearch is not detected, this plugin will display a notification and its core suggestion features will be disabled.

## Features

*   **Intelligent Suggestions:** Activates when you type `[[`.
*   **Recent Files First:**
    *   If you haven't typed anything after `[[`, a list of your most recently accessed notes is shown.
    *   When you start typing, recent files are filtered by title, alias, headings, and block content.
*   **Omnisearch Integration:** Simultaneously searches your entire vault's content using Omnisearch for the typed query.
*   **Prioritized Results:** Suggestions from recent files that match your query are generally prioritized, followed by Omnisearch content matches.
*   **Clean Display:** Suggestions only show the note title (or alias/heading/block snippet), keeping the list clean and easy to read.
*   **Accurate Link Insertion:** Correctly inserts links for notes, aliases, headings, or blocks.

## How it Works

When you type `[[` to create a link, this plugin:
1.  Immediately offers suggestions from your recently opened files if your query is empty.
2.  As you type, it filters through your recent files (matching titles, aliases, headings, and even content within blocks).
3.  Simultaneously, it sends your query to the Omnisearch plugin to find matches in the content of any note in your vault.
4.  It then combines and ranks these suggestions, aiming to show you the most relevant links first.

## For Developers

### Building the Plugin

To build the plugin, you need to have Node.js and npm installed.

1.  Clone the repository.
2.  Run `npm install` to install the dependencies.
3.  Run `npm run build` to build the plugin.

This will create a `main.js` file in the project root, which you can then copy to your Obsidian vault's `.obsidian/plugins/enhanced-link-intellisense` directory.

### Contributing

Contributions are welcome! If you have any ideas, suggestions, or bug reports, please open an issue or submit a pull request.

---

Developed by AI Developer with assistance from human guidance.
