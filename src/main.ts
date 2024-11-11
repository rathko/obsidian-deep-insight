import { App, Editor, Notice, Plugin, PluginSettingTab, Setting, TFile, SuggestModal, requestUrl } from 'obsidian';

type InsertPosition = 'top' | 'bottom' | 'cursor';
type AnthropicModel = 'claude-3-5-sonnet-latest' | 'claude-3-5-haiku-latest';

interface DeepInsightAISettings {
    apiKey: string;
    model: AnthropicModel;
    systemPromptPath: string;
    userPromptPath: string;
    combinationPromptPath: string;
    excludeFolders: string[];
    maxTokensPerRequest: number;
    insertPosition: InsertPosition;
    defaultSystemPrompt: string;
    defaultUserPrompt: string;
    defaultCombinationPrompt: string;
    retryAttempts: number;
}

const DEFAULT_SETTINGS: DeepInsightAISettings = {
    apiKey: '',
    model: 'claude-3-5-sonnet-latest',
    systemPromptPath: '',
    userPromptPath: '',
    combinationPromptPath: '',
    excludeFolders: ['templates', 'archive'],
    maxTokensPerRequest: 90000,
    insertPosition: 'cursor',
    defaultSystemPrompt: `You are a task extraction assistant. When analyzing notes:
1. Consider the note's folder path as context for task importance and categorization
2. Extract actionable tasks from the content
3. For each task include:
   - Source file path in parentheses
   - Relevant context based on the folder structure
4. Format tasks as:
   - [ ] Task description (Source: path/to/note) #folder-name

Group tasks by their source folders to maintain organizational context.`,
    defaultUserPrompt: 'Please analyze these notes and create a prioritized list of tasks.',
    defaultCombinationPrompt: `You are receiving multiple sets of extracted tasks from different chunks of notes. Your job is to:

1. Review all tasks across chunks
2. Remove any duplicates
3. Combine similar tasks
4. Organize tasks by their folders/categories
5. Ensure proper formatting is maintained
6. Keep all source file references
7. Maintain any priority indicators or context
8. Create a cohesive, well-structured final output

Here are the tasks from different chunks to combine:`,
    retryAttempts: 2
};

interface AnthropicMessage {
    text: string;
    type: string;
}

interface AnthropicError {
    type: string;
    message: string;
}

interface AnthropicResponse {
    content: AnthropicMessage[];
    error?: AnthropicError;
}

class DeepInsightAIError extends Error {
    constructor(
        message: string,
        public type: 'API' | 'File' | 'Settings' | 'Processing' | 'Network',
        public originalError?: Error
    ) {
        super(message);
        this.name = 'DeepInsightAIError';
    }
}

class NetworkStatusChecker {
    private static instance: NetworkStatusChecker;
    private isOnline: boolean = navigator.onLine;
    private listeners: Set<(online: boolean) => void> = new Set();

    private constructor() {
        window.addEventListener('online', () => this.updateOnlineStatus(true));
        window.addEventListener('offline', () => this.updateOnlineStatus(false));
    }

    static getInstance(): NetworkStatusChecker {
        if (!NetworkStatusChecker.instance) {
            NetworkStatusChecker.instance = new NetworkStatusChecker();
        }
        return NetworkStatusChecker.instance;
    }

    private updateOnlineStatus(online: boolean): void {
        if (this.isOnline !== online) {
            this.isOnline = online;
            this.notifyListeners();
        }
    }

    private notifyListeners(): void {
        this.listeners.forEach(listener => listener(this.isOnline));
    }

    addListener(listener: (online: boolean) => void): void {
        this.listeners.add(listener);
        listener(this.isOnline);
    }

    removeListener(listener: (online: boolean) => void): void {
        this.listeners.delete(listener);
    }

    checkOnlineStatus(): boolean {
        return navigator.onLine;
    }
}

class PromptNotesModal extends SuggestModal<TFile> {
    constructor(
        app: App,
        private plugin: DeepInsightAI,
        private onError: (error: Error) => void,
        private promptType: 'systemPromptPath' | 'userPromptPath' | 'combinationPromptPath'
    ) {
        super(app);
        // Set a more descriptive placeholder for the search input
        this.setPlaceholder('Type to search notes by title or path...');
    }

    getSuggestions(query: string): TFile[] {
        const files = this.app.vault.getMarkdownFiles();
        const excludedFolders = this.plugin.settings.excludeFolders;
        
        const filtered = files
            // Filter out excluded folders
            .filter(file => !excludedFolders
                .some(folder => file.path.toLowerCase().startsWith(folder.toLowerCase())))
            // Filter based on search query
            .filter(file => {
                if (!query) {
                    return true;
                }
                
                const searchString = `${file.basename} ${file.path}`.toLowerCase();
                const queries = query.toLowerCase().split(' ');
                
                // Match all space-separated terms
                return queries.every(query => searchString.contains(query));
            })
            // Sort by path for better organization
            .sort((a, b) => a.path.localeCompare(b.path));

        return filtered;
    }

    renderSuggestion(file: TFile, el: HTMLElement): void {
        const container = el.createDiv({ cls: 'deep-insight-ai-file-suggestion' });
        
        // Add file icon
        container.createEl('span', {
            cls: 'nav-file-title-content',
            text: '📄 '
        });
        
        // File name in bold
        container.createEl('span', { 
            cls: 'deep-insight-ai-file-name',
            text: file.basename,
            attr: { style: 'font-weight: bold;' }
        });
        
        // Show path in muted color
        const pathText = file.parent ? ` (${file.parent.path})` : '';
        if (pathText) {
            container.createEl('span', { 
                cls: 'deep-insight-ai-file-path',
                text: pathText,
                attr: { style: 'color: var(--text-muted);' }
            });
        }
    }

    async onChooseSuggestion(file: TFile): Promise<void> {
        try {
            // Update the appropriate prompt path based on type
            const settings = this.plugin.settings as DeepInsightAISettings;
            settings[this.promptType] = file.path;
            
            await this.plugin.saveSettings();
            
            // Show success notice
            const promptTypes = {
                systemPromptPath: 'System',
                userPromptPath: 'User',
                combinationPromptPath: 'Combination'
            };
            new Notice(`${promptTypes[this.promptType]} prompt set to: ${file.basename}`);
            
        } catch (error) {
            this.onError(new DeepInsightAIError(
                'Failed to set prompt file',
                'Settings',
                error instanceof Error ? error : undefined
            ));
        }
    }
}

class InsertPositionModal extends SuggestModal<InsertPosition> {
    constructor(
        app: App,
        private plugin: DeepInsightAI
    ) {
        super(app);
    }

    getSuggestions(): InsertPosition[] {
        return ['top', 'bottom', 'cursor'];
    }

    renderSuggestion(position: InsertPosition, el: HTMLElement): void {
        const container = el.createDiv({ cls: 'deep-insight-ai-position-suggestion' });
        
        const descriptions: Record<InsertPosition, string> = {
            top: 'Insert at the beginning of the note',
            bottom: 'Insert at the end of the note',
            cursor: 'Insert at the current cursor position'
        };

        container.createEl('div', { text: `Insert at ${position}` });
        container.createEl('small', { text: descriptions[position] });
    }

    async onChooseSuggestion(position: InsertPosition): Promise<void> {
        this.plugin.settings.insertPosition = position;
        await this.plugin.saveSettings();
        new Notice(`Insert position set to: ${position}`);
    }
}

export default class DeepInsightAI extends Plugin {
    settings: DeepInsightAISettings;
    private networkStatus: NetworkStatusChecker;
    private isProcessing = false;

    async onload(): Promise<void> {
        await this.loadSettings();
        this.networkStatus = NetworkStatusChecker.getInstance();
        
        this.addCommand({
            id: 'generate-insights',
            name: 'Generate Insights from Notes',
            editorCallback: (editor: Editor) => {
                this.generateTasks(editor);
            }
        });
    
        this.addSettingTab(new DeepInsightAISettingTab(this.app, this));
    
        this.networkStatus.addListener(this.handleNetworkChange.bind(this));
    }

    onunload(): void {
        this.networkStatus.removeListener(this.handleNetworkChange.bind(this));
    }

    private handleNetworkChange(online: boolean): void {
        // Only show network notifications if we're actively processing
        if (this.isProcessing) {
            if (!online) {
                new Notice('📡 Network connection lost. Don\'t worry - we\'ll resume processing when connection is restored.', 5000);
            }
        }
    }

    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }

    private showInsertPositionModal(): void {
        new InsertPositionModal(this.app, this).open();
    }

    async getPromptFromNote(promptPath: string): Promise<string> {
        try {
            if (!promptPath) {
                throw new Error('Prompt path not set');
            }

            const promptFile = this.app.vault.getAbstractFileByPath(promptPath);
            if (!(promptFile instanceof TFile)) {
                throw new Error('Prompt file not found');
            }

            return await this.app.vault.read(promptFile);
        } catch (error) {
            console.warn('Failed to read prompt, using default:', error);
            return promptPath === this.settings.systemPromptPath
                ? this.settings.defaultSystemPrompt
                : this.settings.defaultUserPrompt;
        }
    }

    async callAnthropicAPI(content: string): Promise<string> {
        try {
            if (!this.settings.apiKey) {
                throw new DeepInsightAIError('API key not set', 'Settings');
            }
    
            const systemPrompt = await this.getPromptFromNote(this.settings.systemPromptPath);
            const userPrompt = await this.getPromptFromNote(this.settings.userPromptPath);
    
            const requestBody = {
                model: this.settings.model,
                max_tokens: 4096,
                system: systemPrompt || this.settings.defaultSystemPrompt,
                messages: [
                    {
                        role: 'user',
                        content: `${userPrompt || this.settings.defaultUserPrompt}\n\nNotes Content:\n${content}`
                    }
                ]
            };
    
            console.log('Deep Insight AI: Making API request:', {
                url: 'https://api.anthropic.com/v1/messages',
                model: this.settings.model,
                contentLength: content.length,
                hasSystemPrompt: !!systemPrompt,
                hasUserPrompt: !!userPrompt
            });
    
            const response = await requestUrl({
                url: 'https://api.anthropic.com/v1/messages',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.settings.apiKey,
                    'anthropic-version': '2023-06-01',
                    'accept': 'application/json'
                },
                body: JSON.stringify(requestBody),
                throw: false
            });
    
            console.log('Deep Insight AI: Received API Response:', {
                status: response.status,
                contentLength: response.text?.length || 0
            });
    
            let responseData: AnthropicResponse;
            try {
                responseData = JSON.parse(response.text);
            } catch (e) {
                console.error('Deep Insight AI: Failed to parse response');
                throw new DeepInsightAIError('Failed to parse API response', 'API');
            }
    
            if (response.status !== 200) {
                console.error('Deep Insight AI: API Error:', {
                    status: response.status,
                    error: responseData.error?.message
                });
                
                const errorMessage = responseData.error?.message || 
                                   `API request failed with status ${response.status}`;
                
                throw new DeepInsightAIError(`API Error: ${errorMessage}`, 'API');
            }
    
            if (!responseData.content || !Array.isArray(responseData.content) || responseData.content.length === 0) {
                throw new DeepInsightAIError('API response missing content', 'API');
            }
    
            const messageContent = responseData.content[0];
            if (!messageContent || typeof messageContent.text !== 'string') {
                throw new DeepInsightAIError('Invalid API response format', 'API');
            }
    
            return messageContent.text;
    
        } catch (error) {
            console.error('Deep Insight AI: Error Details:', {
                type: error instanceof DeepInsightAIError ? error.type : 'Unknown',
                message: error instanceof Error ? error.message : 'Unknown error',
                stack: process.env.NODE_ENV === 'development' ? 
                      (error instanceof Error ? error.stack : undefined) : 
                      undefined
            });
            
            if (error instanceof DeepInsightAIError) {
                throw error;
            }
            
            throw new DeepInsightAIError(
                'API request failed: ' + (error instanceof Error ? error.message : 'Unknown error'),
                'API',
                error instanceof Error ? error : undefined
            );
        }
    }

    async generateTasks(editor: Editor): Promise<void> {
        try {
            if (!this.settings.apiKey) {
                new Notice('Please set your Anthropic API key in the plugin settings');
                return;
            }
    
            new Notice('🔍 Starting your knowledge journey...');
            
            const chunks = await this.getAllNotesContent();
            const chunkResults: string[] = [];
            
            // First pass: Process each chunk with engaging messages
            for (let i = 0; i < chunks.length; i++) {
                const messages = [
                    '🧠 Diving deep into your notes...',
                    '💫 Extracting pearls of wisdom...',
                    '🎯 Connecting the dots in your notes...',
                    '✨ Uncovering insights...',
                    '🔮 Crystallizing your thoughts...'
                ];
                
                // Show a random message for variety
                new Notice(
                    `${messages[Math.floor(Math.random() * messages.length)]} ` +
                    `(Processing chunk ${i + 1} of ${chunks.length})`
                );
                
                try {
                    const tasks = await this.callAnthropicAPI(chunks[i].content);
                    chunkResults.push(tasks);
                    
                    // Show progress confirmation
                    if (chunks.length > 1) {
                        new Notice(`🎉 Chunk ${i + 1} successfully processed! Moving forward...`);
                    }
                } catch (error) {
                    if (error instanceof DeepInsightAIError && error.type === 'Network') {
                        new Notice('📡 Network error: Please check your connection', 5000);
                        return;
                    }
                    throw error;
                }
            }
    
            // Second pass: Combine results with engaging message
            if (chunkResults.length > 0) {
                if (chunkResults.length > 1) {
                    new Notice('🧩 Merging insights together into a cohesive narrative...');
                }
                const finalTasks = await this.combineChunkResults(chunkResults);
                await this.insertTasks(editor, finalTasks);
                new Notice('✨ Deep insights successfully crystallized.', 5000);
            }
            
        } catch (error) {
            this.handleError(error instanceof Error ? error : new Error(String(error)));
        }
    }

    async combineChunkResults(chunkResults: string[]): Promise<string> {
        if (chunkResults.length === 1) {
            return chunkResults[0];
        }
    
        new Notice('🎭 Harmonizing multiple perspectives...');
        const combinedContent = chunkResults.join('\n\n=== Next Chunk ===\n\n');
        const combinationPrompt = await this.getPromptFromNote(this.settings.combinationPromptPath);
        
        try {
            const requestBody = {
                model: this.settings.model,
                max_tokens: 4096,
                system: this.settings.defaultSystemPrompt,
                messages: [
                    {
                        role: 'user',
                        content: `${combinationPrompt}\n\n${combinedContent}`
                    }
                ]
            };
    
            const response = await requestUrl({
                url: 'https://api.anthropic.com/v1/messages',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.settings.apiKey,
                    'anthropic-version': '2023-06-01',
                    'accept': 'application/json'
                },
                body: JSON.stringify(requestBody),
                throw: false
            });
    
            if (response.status !== 200) {
                throw new DeepInsightAIError(`Failed to combine results: ${response.status}`, 'API');
            }
    
            const responseData: AnthropicResponse = JSON.parse(response.text);
            if (!responseData.content?.[0]?.text) {
                throw new DeepInsightAIError('Invalid response format when combining results', 'API');
            }
    
            return responseData.content[0].text;
    
        } catch (error) {
            console.error('Failed to combine chunk results:', error);
            throw new DeepInsightAIError(
                'Failed to combine results: ' + (error instanceof Error ? error.message : 'Unknown error'),
                'Processing',
                error instanceof Error ? error : undefined
            );
        }
    }
    
    private handleError(error: Error): void {
        const message = error instanceof DeepInsightAIError 
            ? `${error.type} Error: ${error.message}`
            : `Error: ${error.message}`;
        
        new Notice(message, 5000);
        console.error('Deep Insight AI Error:', error);
    }

    async getAllNotesContent(): Promise<{ content: string, size: number }[]> {
        // Get actual prompts
        const systemPrompt = await this.getPromptFromNote(this.settings.systemPromptPath) || this.settings.defaultSystemPrompt;
        const userPrompt = await this.getPromptFromNote(this.settings.userPromptPath) || this.settings.defaultUserPrompt;
    
        // Calculate prompt sizes (rough estimate: 3 chars per token)
        const systemPromptSize = systemPrompt.length / 3;
        const userPromptSize = userPrompt.length / 3;
        
        // Reserve tokens for prompts and leave some space for response
        const RESPONSE_TOKENS = 10000; // Reserve ~10K tokens for response
        const RESERVED_TOKENS = Math.ceil(systemPromptSize + userPromptSize + RESPONSE_TOKENS);
        const MAX_CHUNK_SIZE = this.settings.maxTokensPerRequest - RESERVED_TOKENS;
        const MAX_CHUNK_CHARS = MAX_CHUNK_SIZE * 3;
    
        console.log('Deep Insight AI: Token allocation:', {
            totalAvailable: this.settings.maxTokensPerRequest,
            systemPromptTokens: Math.ceil(systemPromptSize),
            userPromptTokens: Math.ceil(userPromptSize),
            responseTokens: RESPONSE_TOKENS,
            availableForContent: MAX_CHUNK_SIZE
        });
    
        const files = this.app.vault.getMarkdownFiles()
            .filter(file => !this.settings.excludeFolders
                .some(folder => file.path.toLowerCase().startsWith(folder.toLowerCase())));
    
        const chunks: { content: string, size: number }[] = [];
        let currentChunk = '';
        let currentSize = 0;
    
        for (const file of files) {
            try {
                const content = await this.app.vault.read(file);
                const folderPath = file.path.substring(0, file.path.lastIndexOf('/'));
                
                const noteContent = `
    === Note Path: ${file.path} ===
    Folder: ${folderPath || 'root'}
    
    Content:
    ${content}
    
    === End Note ===
    
    `;
                const noteSize = noteContent.length;
    
                // If adding this note would exceed the chunk size, start a new chunk
                if (currentSize + noteSize > MAX_CHUNK_CHARS && currentChunk) {
                    chunks.push({ content: currentChunk, size: currentSize });
                    currentChunk = '';
                    currentSize = 0;
                }
    
                currentChunk += noteContent;
                currentSize += noteSize;
    
            } catch (error) {
                new Notice(`Failed to read file ${file.path}`);
                console.error(`Error reading file ${file.path}:`, error);
            }
        }
    
        // Add the last chunk if it contains anything
        if (currentChunk) {
            chunks.push({ content: currentChunk, size: currentSize });
        }
    
        if (chunks.length === 0) {
            throw new DeepInsightAIError('No valid notes found to process', 'Processing');
        }
    
        // Log detailed chunk information
        chunks.forEach((chunk, i) => {
            const estimatedTokens = Math.round(chunk.size / 3);
            const totalEstimatedTokens = Math.round((chunk.size + systemPrompt.length + userPrompt.length) / 3);
            console.log(`Deep Insight AI: Chunk ${i + 1}:`, {
                contentTokens: estimatedTokens,
                totalWithPrompts: totalEstimatedTokens,
                percentOfLimit: Math.round((totalEstimatedTokens / this.settings.maxTokensPerRequest) * 100) + '%'
            });
        });
    
        return chunks;
    }

    async insertTasks(editor: Editor, tasks: string): Promise<void> {
        const cursor = editor.getCursor();
        
        switch (this.settings.insertPosition) {
            case 'top': {
                editor.replaceRange(`## Generated Tasks\n${tasks}\n\n`, { line: 0, ch: 0 });
                break;
            }
            case 'bottom': {
                const lastLine = editor.lastLine();
                editor.replaceRange(
                    `\n\n## Generated Tasks\n${tasks}`, 
                    { line: lastLine, ch: editor.getLine(lastLine).length }
                );
                break;
            }
            case 'cursor': {
                editor.replaceRange(`\n\n## Generated Tasks\n${tasks}\n`, cursor);
                break;
            }
        }
    }
}

class DeepInsightAISettingTab extends PluginSettingTab {
    plugin: DeepInsightAI;

    constructor(app: App, plugin: DeepInsightAI) {
        super(app, plugin);
        this.plugin = plugin;
    }

    private createPromptSection(
        containerEl: HTMLElement,
        title: string,
        description: string,
        pathSetting: 'systemPromptPath' | 'userPromptPath' | 'combinationPromptPath',
        defaultSetting: 'defaultSystemPrompt' | 'defaultUserPrompt' | 'defaultCombinationPrompt'
    ): void {
        const container = containerEl.createDiv({
            cls: 'deep-insight-ai-prompt-container'
        });

        container.createEl('h4', { text: title });
        container.createEl('p', { 
            text: description,
            cls: 'setting-item-description'
        });

        // Create note link section if a note is selected
        const notePath = this.plugin.settings[pathSetting];
        if (notePath) {
            const linkContainer = container.createDiv({
                cls: 'deep-insight-ai-note-link'
            });

            // Add note icon
            linkContainer.createEl('span', {
                cls: 'setting-editor-extra-setting-button',
                text: '📝'
            });

            // Create link to the note
            const link = linkContainer.createEl('a');
            link.textContent = notePath;
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const file = this.app.vault.getAbstractFileByPath(notePath);
                if (file instanceof TFile) {
                    const leaf = this.app.workspace.getLeaf();
                    if (leaf) {
                        leaf.openFile(file);
                    }
                }
            });

            // Add remove button
            const removeButton = linkContainer.createEl('span', {
                cls: 'deep-insight-ai-note-link-remove',
                text: '×'
            });
            removeButton.addEventListener('click', async () => {
                const settings = this.plugin.settings as DeepInsightAISettings;
                settings[pathSetting] = '';
                await this.plugin.saveSettings();
                this.display(); // Refresh the settings tab
                new Notice(`${title} note removed`);
            });

            // Show that we're using the custom note
            container.createEl('div', {
                cls: 'deep-insight-ai-prompt-source',
                text: 'Using custom prompt from the linked note'
            });
        } else {
            // Show that we're using the default prompt
            container.createEl('div', {
                cls: 'deep-insight-ai-prompt-source',
                text: 'Using default prompt (no note selected)'
            });
        }

        // Add button to select a new note
        new Setting(container)
            .addButton(button => button
                .setButtonText(notePath ? 'Change Note' : 'Select Note')
                .onClick(() => {
                    new PromptNotesModal(
                        this.app,
                        this.plugin,
                        (error) => {
                            new Notice(`Failed to set prompt note: ${error.message}`);
                        },
                        pathSetting
                    ).open();
                }));

        // Show default prompt textarea
        const textarea = container.createEl('textarea', {
            cls: 'deep-insight-ai-prompt-textarea'
        });
        
        const defaultValue = this.plugin.settings[defaultSetting];
        if (typeof defaultValue === 'string') {
            textarea.value = defaultValue;
        }
        
        textarea.placeholder = notePath ? 'Default prompt (used as fallback)' : 'Enter default prompt';
        textarea.addEventListener('change', async (e) => {
            const target = e.target as HTMLTextAreaElement;
            const settings = this.plugin.settings as DeepInsightAISettings;
            settings[defaultSetting] = target.value;
            await this.plugin.saveSettings();
        });
    }

    display(): void {
        const {containerEl} = this;
        containerEl.empty();

        // Add CSS for styling
        containerEl.createEl('style', {
            text: `
                .deep-insight-ai-prompt-textarea {
                    min-height: 200px !important;
                    width: 100%;
                    font-family: monospace;
                }
                .deep-insight-ai-prompt-container {
                    margin-bottom: 24px;
                }
                .deep-insight-ai-note-link {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-bottom: 12px;
                    padding: 8px;
                    background: var(--background-secondary);
                    border-radius: 4px;
                }
                .deep-insight-ai-note-link a {
                    color: var(--text-accent);
                    text-decoration: underline;
                }
                .deep-insight-ai-note-link-remove {
                    color: var(--text-error);
                    cursor: pointer;
                    padding: 4px;
                }
                .deep-insight-ai-prompt-source {
                    font-size: 0.9em;
                    color: var(--text-muted);
                    margin-bottom: 8px;
                    font-style: italic;
                }
            `
        });

        // API Key Setting
        new Setting(containerEl)
            .setName('Anthropic API Key')
            .setDesc('Your Anthropic API key')
            .addText(text => text
                .setPlaceholder('Enter your API key')
                .setValue(this.plugin.settings.apiKey)
                .onChange(async (value) => {
                    this.plugin.settings.apiKey = value;
                    await this.plugin.saveSettings();
                }));

        // Model Selection
        new Setting(containerEl)
            .setName('Model')
            .setDesc('Select Claude model to use')
            .addDropdown(dropdown => {
                const options = {
                    'claude-3-5-sonnet-latest': 'Claude 3.5 Sonnet (Balanced)',
                    'claude-3-5-haiku-latest': 'Claude 3.5 Haiku (Fast)'
                };
                
                dropdown
                    .addOptions(options)
                    .setValue(this.plugin.settings.model)
                    .onChange(async (value: AnthropicModel) => {
                        this.plugin.settings.model = value;
                        await this.plugin.saveSettings();
                    });
            });

        // Insert Position Setting
        new Setting(containerEl)
            .setName('Insert Position')
            .setDesc('Where to insert generated insights in the note')
            .addDropdown(dropdown => {
                const options = {
                    'top': 'At the top of the note',
                    'bottom': 'At the bottom of the note',
                    'cursor': 'At current cursor position'
                };
                
                dropdown
                    .addOptions(options)
                    .setValue(this.plugin.settings.insertPosition)
                    .onChange(async (value: InsertPosition) => {
                        this.plugin.settings.insertPosition = value;
                        await this.plugin.saveSettings();
                        new Notice(`Insert position set to: ${value}`);
                    });
            });
        
        new Setting(containerEl)
            .setName('Excluded Folders')
            .setDesc('Comma-separated list of folders to exclude')
            .addText(text => text
                .setPlaceholder('templates,archive')
                .setValue(this.plugin.settings.excludeFolders.join(','))
                .onChange(async (value) => {
                    this.plugin.settings.excludeFolders = value.split(',').map(f => f.trim());
                    await this.plugin.saveSettings();
                }));

        // Prompt Settings Section
        containerEl.createEl('h3', { text: 'Prompts Configuration' });

        // System Prompt
        this.createPromptSection(
            containerEl,
            'System Prompt',
            'Defines how the AI should process notes',
            'systemPromptPath',
            'defaultSystemPrompt'
        );

        // User Prompt
        this.createPromptSection(
            containerEl,
            'User Prompt',
            'Defines what specific insight to generate',
            'userPromptPath',
            'defaultUserPrompt'
        );

        // Combination Prompt
        this.createPromptSection(
            containerEl,
            'Combination Prompt',
            'Defines how to merge and organize tasks from multiple chunks',
            'combinationPromptPath',
            'defaultCombinationPrompt'
        );
    }
}