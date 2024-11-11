# Obsidian Deep Insight AI

A powerful Obsidian plugin that leverages Claude AI to analyze all your notes and generate actionable insights and tasks.

## Features

- 🤖 Powered by Claude 3.5 AI models (Sonnet and Haiku)
- 📝 Analyzes your entire vault or selected notes
- ✅ Generates actionable tasks from your notes
- 📁 Maintains folder context and organization
- 🎯 Smart task prioritization based on note context
- ⚡ Process notes in chunks for better performance

## Installation

1. Open Obsidian Settings
2. Go to "Community Plugins" and enable "Community Plugins"
3. Click "Browse" and search for "Deep Insight AI"
4. Click "Install"
5. Enable the plugin

## Configuration

1. Get your API key from [Anthropic](https://console.anthropic.com/settings/keys)
2. Open plugin settings in Obsidian
3. Enter your Anthropic API key
4. Configure optional settings:
   - Choose preferred Claude model (Sonnet or Haiku)
   - Set excluded folders
   - Adjust chunk size for processing
   - Customize insertion position for generated tasks
   - Set custom system and user prompts

## Usage

1. Open any note where you want to insert generated tasks
2. Open Command Palette (Cmd/Ctrl + P)
3. Search for "Deep Insight AI: Generate Tasks from Notes"
4. Tasks will be generated and inserted at your preferred position

### Additional Commands

- `Set Task Insertion Position`: Choose where tasks should be inserted (top/bottom/cursor)
- `Select Prompt Notes`: Use custom notes as system/user prompts

## Customization

### Custom Prompts

You can create custom prompt notes in your vault:
1. Create a note for system prompt (how the AI should process notes)
2. Create a note for user prompt (what specific tasks to generate)
3. Use "Select Prompt Notes" command to set these notes

### Models

- **Claude 3.5 Sonnet**: Recommended for detailed analysis and complex task extraction
- **Claude 3.5 Haiku**: Best for quick task generation and smaller note sets
- **OpenAI models**: In development

## Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

## License

[MIT](LICENSE)

## Support

If you encounter any issues or have questions:
1. Check the [FAQ](#faq) section below
2. Open an issue on GitHub
3. Try the plugin's error handling features:
   - Check console logs for detailed error messages

## FAQ

### Q: Why aren't my tasks being generated?
A: Check:
1. API key is correctly set
2. You have an active internet connection
3. Selected folders aren't in the excluded list

### Q: How does the chunking system work?
A: The plugin processes notes in chunks to:
1. Handle large vaults efficiently
2. Stay within API limits
3. Maintain context across related notes

### Q: Can I use this with other AI models?
A: Currently, the plugin supports Claude 3.5 models only.

## Local development

1. Checkout the repo into the Obsidian plugins folder
2. Build the plugin
```
# Install nvm, or make sure you do have node v16.19.1
nvm use
npm install
npm run build
```
3. Go to "Community Plugins" and enable "Community Plugins"
4. Enable "Deep Insight AI"
5. Click "Configure" icon, provide your Anthropic API key


## Credits

Created by Radek Maciaszek  
Powered by [Anthropic's Claude](https://www.anthropic.com/claude)