# Enhanced Link Suggestions for Obsidian

This plugin supercharges the note-linking experience in Obsidian by providing more relevant and context-aware autocomplete suggestions. It prioritizes recently accessed files and leverages the power of the Omnisearch plugin for comprehensive content search, helping you find the right note quickly.

## Table of Contents

- [Enhanced Link Suggestions for Obsidian](#enhanced-link-suggestions-for-obsidian)
  - [Table of Contents](#table-of-contents)
  - [Requirements](#requirements)
  - [Installation](#installation)
    - [From the Community Plugins Browser](#from-the-community-plugins-browser)
    - [Manual Installation](#manual-installation)
  - [Features](#features)
  - [How to Use](#how-to-use)
  - [For Developers](#for-developers)
    - [Building the Plugin](#building-the-plugin)
    - [Contributing](#contributing)
  - [License](#license)

## Requirements

- **Obsidian**: Version 0.15.0 or higher.
- **Omnisearch Plugin**: This plugin **will not work** without the [Omnisearch plugin](https://github.com/scambier/obsidian-omnisearch) installed and enabled. Omnisearch is used for all content-based search suggestions. If Omnisearch is not detected, this plugin will display a notification and its core suggestion features will be disabled.

## Installation

### From the Community Plugins Browser

1. Open the **Settings** in Obsidian.
2. Go to the **Community plugins** tab.
3. Click on **Browse** to open the community plugins browser.
4. Search for "Enhanced Link Suggestions" and click **Install**.
5. Once installed, go back to the **Community plugins** tab and enable the plugin.

### Manual Installation

1. Download the latest release from the [GitHub releases page](https://github.com/obsidian-enhanced-link-suggestions/releases).
2. Unzip the downloaded file and copy the `enhanced-link-suggestions` folder to your Obsidian vault's plugins folder: `<YourVault>/.obsidian/plugins/`.
3. Reload Obsidian.
4. Go to **Settings** > **Community plugins**, and enable "Enhanced Link Suggestions".

## Features

- **Intelligent Suggestions**: Activates automatically when you type `[[`.
- **Recent Files First**:
  - If you haven't typed anything after `[[`, a list of your most recently accessed notes is shown.
  - As you type, recent files are filtered by title, alias, and headings.
- **Omnisearch Integration**: Simultaneously searches your entire vault's content using Omnisearch for the typed query.
- **Prioritized Results**: Suggestions are intelligently ranked, with matches from recent files generally appearing higher, followed by content matches from Omnisearch.
- **Clean and Readable Display**: The suggestion list is designed to be easy to scan, showing only the most relevant information.
- **Accurate Link Insertion**: Correctly inserts the selected link for notes, aliases, or headings.

## How to Use

1. **Install and enable** the plugin (and its dependency, Omnisearch).
2. Start typing `[[` in any note to trigger the link suggester.
3. If the query is empty, a list of recent files will be displayed.
4. As you type, the suggestions will update in real-time based on your query, showing results from recent files and Omnisearch.
5. Use the arrow keys to navigate the suggestions and press `Enter` to insert the selected link.

## For Developers

### Building the Plugin

To set up a local development environment and build the plugin from the source:

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/obsidian-enhanced-link-suggestions.git
   cd enhanced-link-suggestions
   ```
2.  **Install Dependencies**:
    ```bash
    npm install
    ```
3.  **Build the Plugin**:
    ```bash
    npm run build
    ```
This will create a `main.js` file in the project root. You can copy this file, along with `manifest.json` and `styles.css`, to your Obsidian vault's plugin directory (`<YourVault>/.obsidian/plugins/your-plugin-id/`) to test it.

### Contributing

Contributions are welcome! If you have any ideas, suggestions, or bug reports, please open an issue or submit a pull request on the [GitHub repository](https://github.com/obsidian-enhanced-link-suggestions).

## License

This plugin is licensed under the [MIT License](LICENSE).

---

Developed by AI Developer with assistance from human guidance.
