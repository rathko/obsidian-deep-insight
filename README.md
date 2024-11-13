# Obsidian Deep Insight AI

An Obsidian plugin that leverages AI to analyze **all your Markdown notes** and generate actionable insights and tasks.

Have hundreds of notes with scattered tasks, commitments, and ideas? Deep Insight AI acts as your personal assistant to ensure nothing falls through the cracks.

![Deep Insight AI Demo](docs/deep-insight-ai-demo.gif)

## Why Deep Insight AI?

Your vault might contain:
- Commitments scattered across daily notes
- Project deadlines in various folders
- Ideas waiting to be rediscovered
- Patterns and themes you've never noticed
- Follow-ups that need attention

Instead of manually reviewing hundreds of notes, this plugin:
- Analyzes all your Markdown notes using AI
- Extracts actionable items using your custom prompts
- Identifies patterns and recurring themes
- Brings forgotten tasks back to attention
- Maintains context from your folder structure
- Generates insights exactly the way you want them

Think of it as having a personal assistant who reads through your entire vault, understands how you think, and surfaces what matters - all based on your own prompts and preferences.

## Features

- 🤖 Powered by Claude 3.5 AI models (Sonnet and Haiku)
- 📝 Analyzes all Markdown files in your vault (you can exclude folders in settings)
- ✅ Generates actionable tasks and insights from your notes
- 📁 Maintains folder context and organization
- 🎯 Smart task prioritization / insights based on note context
- ⚡ Process notes in chunks for large vaults
- 💰 Provides cost estimates of the used AI model

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
   - Customize insertion position for generated tasks (text will be inserted in currently selected notes)
   - Set custom system, user and combination prompts
   - Enable costs to see AI model cost estimates
5. Configure advanced settings:
   - Test mode helps to reduce the experimentation costs. Useful when you experiment with prompts or local development
   - Maximum tokens per request - 100k in Claude. You might want to reduce it slighlty it in case your prompts are very long and Anthopic API complains.
   - Retry attempts - might be useful for larger vaults to avoid reprocessing entire vault 

## Usage

1. Open any note where you want to insert generated tasks (for example: your current daily note)
2. Open Command Palette (Cmd/Ctrl + P)
3. Search for "Deep Insight AI: Generate Insights from Notes"
4. Tasks / insights will be generated and inserted at your preferred position

Note: The plugin processes only Markdown (.md) files in your vault. Other file types (images, PDFs, etc.) are not analyzed.

## Customization

### Custom Prompts

The plugin uses three types of prompts that you can customize through your own Obsidian notes:

#### System Prompt
The system prompt defines HOW the AI should analyze your notes. Think of it as giving instructions to your personal assistant about their role and methodology. It sets the overall behavior, style, and approach to processing your notes.

You can customize this to:
- Change the task format and structure
- Add specific categorization rules
- Include additional context or metadata
- Modify the output organization
- Change the analysis style (e.g., more formal or casual)
- Define custom task priorities and labeling
- Set specific formatting rules

#### User Prompt
The user prompt defines WHAT specific insights or tasks you want to generate. It's like asking your assistant a specific question about your notes.

Example use cases:
- Extract learning points and create a study plan
- Find all project deadlines and create a timeline
- Identify key decisions and their rationale
- Summarize main ideas and create action items
- Find all meeting notes and extract commitments
- Generate a weekly progress report
- Create a knowledge summary
- Extract research findings
- Identify resource requirements

#### Combination Prompt
Used when processing large vaults in more than 1 chunk, this prompt defines how to merge insights from multiple sets of notes. This helps maintain consistency and avoid duplication when analyzing large amounts of content.

### How to Set Up Custom Prompts

1. Create separate notes in your vault for each prompt type
2. Open plugin settings
3. Select your prompt notes using the "Select Note" buttons
4. Edit your prompt notes directly in Obsidian as needed

Tips for working with prompts:
- Keep prompts in a dedicated "Prompts" or "Templates" folder
- Test different prompts to find what works best for your notes
- Review the generated output and adjust prompts accordingly
- You can use Markdown formatting in your prompts
- Consider creating different prompt notes for different use cases (e.g., one for project management, another for study notes)

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

### Q: What types of files does the plugin process?
A: The plugin only processes Markdown (.md) files. Other file types (images, PDFs, etc.) are not analyzed. This ensures focused and reliable task extraction from your written notes while reducing costs.

### Q: How does the chunking system work?
A: The plugin processes notes in chunks to:
1. Handle large vaults efficiently
2. Stay within API limits
3. Maintain context across related notes

### Q: Can I use this with other AI models?
A: Currently, the plugin supports Claude 3.5 models only. Pull requests are welcomed.

### Q: How is my data handled?
A: The plugin operates with complete privacy. Your notes are processed directly between your local Obsidian vault and Anthropic (Claude AI). No data is collected, stored, or transmitted anywhere else.

## Local development

1. Checkout the repo into the Obsidian plugins folder
2. Build the plugin
```
# Install nvm, or make sure you do have node v20.18.0
# This plugins aims to follow latest Obsidian Node version
# Other Node versions might work but are not supported
nvm use

# Build the plugin
npm install
npm run build
```
3. Go to "Community Plugins" and enable "Community Plugins"
4. Enable "Deep Insight AI"
5. Click "Configure" icon, provide your Anthropic API key


## Credits

Created by Radek Maciaszek  