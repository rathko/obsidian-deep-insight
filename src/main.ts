import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, SuggestModal, requestUrl } from 'obsidian';

type InsertPosition = 'top' | 'bottom' | 'cursor';
type PromptType = 'system' | 'user';
type AnthropicModel = 'claude-3-5-sonnet-latest' | 'claude-3-5-haiku-latest';

interface TaskMindSettings {
    apiKey: string;
    model: AnthropicModel;
    systemPromptPath: string;
    userPromptPath: string;
    excludeFolders: string[];
    chunkSize: number;
    maxTokensPerRequest: number;
    insertPosition: InsertPosition;
    defaultSystemPrompt: string;
    defaultUserPrompt: string;
    retryAttempts: number;
    offlineModeEnabled: boolean;
}

const DEFAULT_SETTINGS: TaskMindSettings = {
    apiKey: '',
    model: 'claude-3-5-sonnet-latest',
    systemPromptPath: '',
    userPromptPath: '',
    excludeFolders: ['templates', 'archive'],
    chunkSize: 50,
    maxTokensPerRequest: 100000,
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
    retryAttempts: 3,
    offlineModeEnabled: false
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

class TaskMindError extends Error {
    constructor(
        message: string,
        public type: 'API' | 'File' | 'Settings' | 'Processing' | 'Network',
        public originalError?: Error
    ) {
        super(message);
        this.name = 'TaskMindError';
    }
}

class NetworkStatusChecker {
    private static instance: NetworkStatusChecker;
    private isOnline: boolean = navigator.onLine;
    private listeners: Set<(online: boolean) => void> = new Set();

    private constructor() {
        // Use browser's built-in online/offline events
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
        // Immediately notify the new listener of current status
        listener(this.isOnline);
    }

    removeListener(listener: (online: boolean) => void): void {
        this.listeners.delete(listener);
    }

    checkOnlineStatus(): boolean {
        return navigator.onLine;
    }
}

class ConfirmationModal extends Modal {
    constructor(
        app: App,
        private title: string,
        private message: string,
        private onConfirm: () => void
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: this.title });
        contentEl.createEl('p', { text: this.message });

        const buttonContainer = contentEl.createDiv({ cls: 'task-mind-button-container' });

        buttonContainer.createEl('button', { text: 'Confirm' })
            .addEventListener('click', () => {
                this.onConfirm();
                this.close();
            });

        buttonContainer.createEl('button', { text: 'Cancel' })
            .addEventListener('click', () => this.close());
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}

class PromptTypeModal extends SuggestModal<PromptType> {
    constructor(
        app: App,
        private callback: (choice: PromptType) => void
    ) {
        super(app);
    }

    getSuggestions(): PromptType[] {
        return ['system', 'user'];
    }

    renderSuggestion(value: PromptType, el: HTMLElement): void {
        el.createEl('div', { 
            cls: 'task-mind-suggestion',
            text: `Set as ${value} prompt` 
        });

        el.createEl('small', { 
            cls: 'task-mind-suggestion-desc',
            text: value === 'system' 
                ? 'Define how the AI should process notes' 
                : 'Define what specific tasks to generate'
        });
    }

    onChooseSuggestion(value: PromptType): void {
        this.callback(value);
    }
}

class PromptNotesModal extends SuggestModal<TFile> {
    constructor(
        app: App,
        private plugin: TaskMind,
        private onError: (error: Error) => void
    ) {
        super(app);
    }

    getSuggestions(): TFile[] {
        return this.app.vault.getMarkdownFiles()
            .filter(file => !this.plugin.settings.excludeFolders
                .some(folder => file.path.toLowerCase().startsWith(folder.toLowerCase())));
    }

    renderSuggestion(file: TFile, el: HTMLElement): void {
        const container = el.createDiv({ cls: 'task-mind-file-suggestion' });
        container.createEl('div', { 
            cls: 'task-mind-file-name',
            text: file.basename 
        });
        container.createEl('small', { 
            cls: 'task-mind-file-path',
            text: file.path 
        });
    }

    async onChooseSuggestion(file: TFile): Promise<void> {
        try {
            const choice = await new Promise<PromptType>((resolve) => {
                new PromptTypeModal(this.app, (value) => resolve(value)).open();
            });

            if (choice === 'system') {
                this.plugin.settings.systemPromptPath = file.path;
            } else {
                this.plugin.settings.userPromptPath = file.path;
            }
            await this.plugin.saveSettings();
            new Notice(`${choice} prompt set to: ${file.basename}`);
        } catch (error) {
            this.onError(new TaskMindError(
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
        private plugin: TaskMind
    ) {
        super(app);
    }

    getSuggestions(): InsertPosition[] {
        return ['top', 'bottom', 'cursor'];
    }

    renderSuggestion(position: InsertPosition, el: HTMLElement): void {
        const container = el.createDiv({ cls: 'task-mind-position-suggestion' });
        
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

export default class TaskMind extends Plugin {
    settings: TaskMindSettings;
    private networkStatus: NetworkStatusChecker;

    async onload(): Promise<void> {
        await this.loadSettings();
        this.networkStatus = NetworkStatusChecker.getInstance();
        this.networkStatus.addListener(this.handleNetworkChange.bind(this));

        this.addCommand({
            id: 'generate-tasks',
            name: 'Generate Tasks from Notes',
            editorCallback: (editor: Editor, view: MarkdownView) => 
                this.generateTasks(editor).catch(this.handleError.bind(this))
        });

        this.addCommand({
            id: 'set-insert-position',
            name: 'Set Task Insertion Position',
            callback: () => this.showInsertPositionModal()
        });

        this.addCommand({
            id: 'select-prompt-notes',
            name: 'Select Prompt Notes',
            callback: () => new PromptNotesModal(
                this.app, 
                this, 
                this.handleError.bind(this)
            ).open()
        });

        this.addCommand({
            id: 'toggle-offline-mode',
            name: 'Toggle Offline Mode',
            callback: () => {
                this.settings.offlineModeEnabled = !this.settings.offlineModeEnabled;
                this.saveSettings();
                new Notice(`Offline mode ${this.settings.offlineModeEnabled ? 'enabled' : 'disabled'}`);
            }
        });

        this.addSettingTab(new TaskMindSettingTab(this.app, this));
    }

    onunload(): void {
        this.networkStatus.removeListener(this.handleNetworkChange.bind(this));
    }

    private handleNetworkChange(online: boolean): void {
        if (online) {
            new Notice('TaskMind: Network connection restored');
        } else {
            new Notice('TaskMind: Network connection lost', 5000);
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
        if (this.settings.offlineModeEnabled) {
            throw new TaskMindError('Offline mode enabled', 'Network');
        }
    
        try {
            if (!this.settings.apiKey) {
                throw new TaskMindError('API key not set', 'Settings');
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
    
            // Safe logging without sensitive information
            console.log('TaskMind: Making API request:', {
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
    
            // Safe response logging
            console.log('TaskMind: Received API Response:', {
                status: response.status,
                contentLength: response.text?.length || 0
            });
    
            let responseData: AnthropicResponse;
            try {
                responseData = JSON.parse(response.text);
            } catch (e) {
                console.error('TaskMind: Failed to parse response');
                throw new TaskMindError('Failed to parse API response', 'API');
            }
    
            if (response.status !== 200) {
                console.error('TaskMind: API Error:', {
                    status: response.status,
                    error: responseData.error?.message
                });
                
                const errorMessage = responseData.error?.message || 
                                   `API request failed with status ${response.status}`;
                
                throw new TaskMindError(`API Error: ${errorMessage}`, 'API');
            }
    
            // Validate response content
            if (!responseData.content || !Array.isArray(responseData.content) || responseData.content.length === 0) {
                throw new TaskMindError('API response missing content', 'API');
            }
    
            const messageContent = responseData.content[0];
            if (!messageContent || typeof messageContent.text !== 'string') {
                throw new TaskMindError('Invalid API response format', 'API');
            }
    
            return messageContent.text;
    
        } catch (error) {
            console.error('TaskMind: Error Details:', {
                type: error instanceof TaskMindError ? error.type : 'Unknown',
                message: error instanceof Error ? error.message : 'Unknown error',
                stack: process.env.NODE_ENV === 'development' ? 
                      (error instanceof Error ? error.stack : undefined) : 
                      undefined
            });
            
            if (error instanceof TaskMindError) {
                throw error;
            }
            
            throw new TaskMindError(
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
    
            new Notice('Analyzing notes...');
            
            const chunks = await this.getAllNotesContent();
            let allTasks = '';
            
            for (let i = 0; i < chunks.length; i++) {
                new Notice(`Processing chunk ${i + 1} of ${chunks.length}...`);
                try {
                    const tasks = await this.callAnthropicAPI(chunks[i].content);
                    allTasks += tasks + '\n\n';
                } catch (error) {
                    if (error instanceof TaskMindError && error.type === 'Network') {
                        new Notice('Network error: Please check your connection or enable offline mode', 5000);
                        return;
                    }
                    throw error;
                }
            }
            
            await this.insertTasks(editor, allTasks);
            new Notice('Tasks generated successfully!', 5000);
            
        } catch (error) {
            this.handleError(error instanceof Error ? error : new Error(String(error)));
        }
    }
    
    private handleError(error: Error): void {
        const message = error instanceof TaskMindError 
            ? `${error.type} Error: ${error.message}`
            : `Error: ${error.message}`;
        
        new Notice(message, 5000);
        console.error('TaskMind Error:', error);
    }

    async getAllNotesContent(): Promise<{ content: string, size: number }[]> {
        const files = this.app.vault.getMarkdownFiles()
            .filter(file => !this.settings.excludeFolders
                .some(folder => file.path.toLowerCase().startsWith(folder.toLowerCase())));
    
        const chunks: { content: string, size: number }[] = [];
        let currentChunk = '';
        let currentSize = 0;
        let noteCount = 0;
    
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
                currentChunk += noteContent;
                currentSize += noteContent.length;
                noteCount++;
    
                if (noteCount >= this.settings.chunkSize || 
                    currentSize >= this.settings.maxTokensPerRequest) {
                    chunks.push({ content: currentChunk, size: currentSize });
                    currentChunk = '';
                    currentSize = 0;
                    noteCount = 0;
                }
            } catch (error) {
                new Notice(`Failed to read file ${file.path}`);
                console.error(`Error reading file ${file.path}:`, error);
            }
        }
    
        if (currentChunk) {
            chunks.push({ content: currentChunk, size: currentSize });
        }
    
        if (chunks.length === 0) {
            throw new TaskMindError('No valid notes found to process', 'Processing');
        }
    
        return chunks;
    }

    async insertTasks(editor: Editor, tasks: string): Promise<void> {
        const cursor = editor.getCursor();
        
        switch (this.settings.insertPosition) {
            case 'top':
                editor.replaceRange(`## Generated Tasks\n${tasks}\n\n`, { line: 0, ch: 0 });
                break;
            case 'bottom':
                const lastLine = editor.lastLine();
                editor.replaceRange(
                    `\n\n## Generated Tasks\n${tasks}`, 
                    { line: lastLine, ch: editor.getLine(lastLine).length }
                );
                break;
            case 'cursor':
                editor.replaceRange(`\n\n## Generated Tasks\n${tasks}\n`, cursor);
                break;
        }
    }
}

class TaskMindSettingTab extends PluginSettingTab {
    plugin: TaskMind;

    constructor(app: App, plugin: TaskMind) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;
        containerEl.empty();

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
                        
                        const modelInfo = {
                            'claude-3-5-sonnet-latest': 'Recommended for detailed analysis',
                            'claude-3-5-haiku-latest': 'Best for quick tasks'
                        };
                        new Notice(modelInfo[value], 3000);
                    });
            });

        new Setting(containerEl)
            .setName('Chunk Size')
            .setDesc('Number of notes to process at once (lower for larger notes)')
            .addSlider(slider => slider
                .setLimits(10, 500, 10)
                .setValue(this.plugin.settings.chunkSize)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.chunkSize = value;
                    await this.plugin.saveSettings();
                }));

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

        new Setting(containerEl)
            .setName('Offline Mode')
            .setDesc('Enable to prevent API calls when working offline')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.offlineModeEnabled)
                .onChange(async (value) => {
                    this.plugin.settings.offlineModeEnabled = value;
                    await this.plugin.saveSettings();
                    new Notice(`Offline mode ${value ? 'enabled' : 'disabled'}`);
                }));

        containerEl.createEl('h3', { text: 'Default Prompts' });
        
        new Setting(containerEl)
            .setName('Default System Prompt')
            .setDesc('Used when no system prompt note is selected')
            .addTextArea(text => text
                .setPlaceholder('Enter default system prompt')
                .setValue(this.plugin.settings.defaultSystemPrompt)
                .onChange(async (value) => {
                    this.plugin.settings.defaultSystemPrompt = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Default User Prompt')
            .setDesc('Used when no user prompt note is selected')
            .addTextArea(text => text
                .setPlaceholder('Enter default user prompt')
                .setValue(this.plugin.settings.defaultUserPrompt)
                .onChange(async (value) => {
                    this.plugin.settings.defaultUserPrompt = value;
                    await this.plugin.saveSettings();
                }));
    }
}
