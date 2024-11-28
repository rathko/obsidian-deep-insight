# Deep Insight

### Unlock actionable tasks and insights from your Obsidian notes with the power of AI.

**Deep Insight** plugin taps into the power of AI to sift through all your Markdown notes in [Obsidian](https://obsidian.md/), surfacing actionable insights and tasks.

Here's an example:

![Deep Insight Demo](docs/deep-insight-ai-demo.gif)

Overwhelmed by scattered tasks, deadlines, and ideas across your vault? Let Deep Insight become your personal assistant to ensure nothing is overlooked.

## Why Deep Insight?

Your vault likely holds:
- Tasks and commitments lost in daily notes
- Project deadlines scattered across folders
- Ideas buried and waiting to be rediscovered
- Patterns and themes you haven't noticed
- Follow-ups that need your attention

Deep Insight makes manual review a thing of the past:
- Analyzes every Markdown note using customizable AI prompts
- Extracts actionable items based on your queries
- Spots recurring themes and big-picture patterns
- Surfaces forgotten or missed tasks
- Maintains the folder structure you’ve already set up
- Delivers insights exactly the way you want

It's like having a personal assistant that reads your entire vault, understands your workflow, and knows what to highlight based on your preferences.

## Key Features

- 🤖 Powered by Claude 3.5 and OpenAI 4o AI models (Sonnet, Haiku, GPT-4o and GPT-4o mini)
- 📝 Analyzes every Markdown file in your vault (you can exclude folders via settings)
- ✅ Extracts tasks and actionable insights using customisable prompts
- 🎯 Prioritizes tasks based on note context
- ⚡ Processes large vaults in manageable chunks / batches
- 💰 Provides cost estimates for AI usage

## Installation

1. Open Obsidian Settings
2. Navigate to "Community Plugins" and enable it
3. Click "Browse" and search for "Deep Insight"
4. Click "Install" and enable the plugin

Note: Alternatively, see [docs](./docs) on how to install latest version manually.

## Configuration

1. Get your API key from [Anthropic](https://console.anthropic.com/settings/keys) or [OpenAI](https://platform.openai.com/api-keys)
2. Open the plugin settings within Obsidian
3. Enter your API key
4. Configure additional settings:
   - Choose either Claude Sonnet, Haiku models or GPT 4o/mini model
   - Exclude certain folders if needed
   - Customize prompts
      - **User prompt is where you define your mission, goals and beliefs** and any additional instructions. You are encouraged to change this prompt. 
      - System prompt defines how Deep Insight will process the files
   - Enable cost tracking for AI estimates (enabled by default)
5. Access advanced settings:
   - Test mode to reduce costs during experimentation with prompts
   - Max tokens per request (default 100k; reduce if needed)
   - Retry attempts for processing large vaults more smoothly

## How to Use

1. Open any note where you want to insert generated tasks (like your daily note)
2. Select with the cursos the location where generated tasks should be inserted
3. Open the Command Palette (Cmd/Ctrl + P)
4. Search for "Deep Insight: Generate Insights from Notes"
5. The plugin will generate tasks/insights and insert them in your chosen location

*Note: Only markdown files (.md) are analyzed; other file types like PDFs, images, etc., are excluded.*

## Customization

### Custom Prompts

Tailor the behavior of the AI by adjusting the types of prompts used in your workflow:

- **System Prompt:** Defines how the AI approaches analysis—like instructions for a personal assistant. Customize to set task formats, note categorizations, priorities, and style.
- **User Prompt:** Here is where you define **your mission, purpose, goals and beliefs** and any additional instructions

### How to Set Custom Prompts

1. Create notes in your vault for each type of prompt
2. Link them in the plugin settings using "Select Note"
3. Once the prompt note was selected, you can edit it directly in Obsidian as needed

Examples:
- Use specific prompts for different workflows (e.g., one for task management, one for creative brainstorming)
- Test and refine prompts to match your output needs

### AI Models

- **Claude 3.5 Sonnet:** Best for detailed analysis and task extraction
- **Claude 3.5 Haiku:** Quick task generation for smaller note sets
- **OpenAI GPT 4o:** OpenAI Advanced Model, for detailed analysis and task extraction
- **OpenAI GPT 4o mini:** OpenAI Affordable Model, for quick task extraction 

## Contributions

Contributions are welcomed! For major changes, please start by opening an issue to discuss your ideas.
For development notes see [docs](./docs)

## License

[MIT](LICENSE)

## Support 

Encounter an issue? Here’s what you can do:
1. Check the [FAQ](#faq) section
2. Submit an issue through GitHub
3. Troubleshoot using the plugin's error handling features and check console logs

## FAQ

### Q: Is the AI controlling me through my tasks?
A: AI is just a glorified note-reader that reminds you of commitments you already wrote. No mind control here - unless you count being reminded of that project deadline you tried to forget. You're still the one calling the shots... for now.

### Q: Why aren’t tasks being generated?
A: Check if:
1. Your API key is correctly set
2. You have an active internet connection
3. Folders aren’t accidentally excluded in the settings

### Q: What file types does the plugin process?
A: The plugin only processes Markdown (.md) files. Other file types (images, PDFs, etc.) are ignored to keep the analysis focused and efficient.

### Q: How does chunking work?
A: Chunking (batching) helps by processing notes in smaller sections to:
1. Handle large vaults efficiently
2. Stay within API context token limits
3. Maintain context across related notes

It might take a while to process a very large vault. For best results think carefully whether there are more folders you can exclude from processing. Using more affordable model (GPT4o mini or Haiku can also help reduce costs). 

### Q: Can I integrate other AI models?
A: The plugin currently supports Claude 3.5 and OpenAI GPT4o models. Pull requests are gladly accepted!

### Q: Should I use OpenAI or Anthropic?
A: While both AI providers work quite well, OpenAI tends to have more strict API quotas, especially with the GPT4o model. If you see frequent errors related to hitting OpenAI quota limits, you might try GPTo mini or Anthropic.

### Q: How is my data handled?
A: Your notes are only processed between your Obsidian vault and Anthropic (Claude AI) / OpenAI. No data is stored or transmitted elsewhere, ensuring complete privacy.

Both OpenAI and Anthroic do not use data submitted via API for training, unless user specifically opted in.

## Credits

Created by Radek Maciaszek

