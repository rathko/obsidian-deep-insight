import { App, Editor, Notice, Plugin, PluginSettingTab, Setting, TFile, SuggestModal, requestUrl, RequestUrlResponse, Vault } from 'obsidian';
import { DEFAULT_PROMPTS } from './defaultPrompts';
import { DEFAULT_SETTINGS } from './constants';
import { CostTracker } from './costTracker';

// Constants
const API_CONSTANTS = {
    BASE_URL: 'https://api.anthropic.com/v1/messages',
    API_VERSION: '2023-06-01',
    DEFAULT_MAX_TOKENS: 8192,
    RESPONSE_TOKENS: 10000,
    CHARS_PER_TOKEN: 4
} as const;

const UI_MESSAGES = {
    PROCESSING: [
        '🧠 Diving deep into your notes...',
        '💫 Extracting pearls of wisdom...',
        '🎯 Connecting the dots in your notes...',
        '✨ Uncovering insights...',
        '🔮 Crystallizing your thoughts...'
    ],
    SUCCESS: '✨ Deep insights successfully crystallized.',
    COMBINING: '🎭 Harmonizing multiple perspectives...',
    NETWORK_ERROR: '📡 Network error: Please check your connection'
} as const;

const InsertPositionEnum = {
    top: 'top',
    bottom: 'bottom',
    cursor: 'cursor'
} as const;

const AnthropicModelEnum = {
    sonnet: 'claude-3-5-sonnet-latest',
    haiku: 'claude-3-5-haiku-latest'
} as const;

// Derive types from the enum values
type InsertPosition = typeof InsertPositionEnum[keyof typeof InsertPositionEnum];
type AnthropicModel = typeof AnthropicModelEnum[keyof typeof AnthropicModelEnum];

type ErrorType = 'API' | 'File' | 'Settings' | 'Processing' | 'Network';

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
    showCostSummary: boolean;
    testMode: {
        enabled: boolean;
        maxFiles?: number;
        maxTokens?: number;
    };
    showAdvancedSettings: boolean;
}

// Utility Classes
class DeepInsightAIError extends Error {
    constructor(message: string, public type: ErrorType, public originalError?: Error) {
        super(message);
        this.name = 'DeepInsightAIError';
    }
}

class AnthropicAPIClient {
    constructor(
        private apiKey: string,
        private model: AnthropicModel,
        private costTracker?: CostTracker,
        private maxRetries: number = DEFAULT_SETTINGS.retryAttempts
    ) {}

    private async retry<T>(
        operation: () => Promise<T>, 
        retries: number = this.maxRetries
    ): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            if (retries > 0 && error instanceof DeepInsightAIError) {
                // Only retry on API errors, not on validation or settings errors
                if (error.type === 'API' || error.type === 'Network') {
                    console.log(`Retrying operation, ${retries} attempts remaining`);
                    new Notice(`🔄 Retrying... (${retries} attempts remaining)`);
                    // Exponential backoff: wait longer between each retry
                    await new Promise(resolve => setTimeout(resolve, (this.maxRetries - retries + 1) * 1000));
                    return this.retry(operation, retries - 1);
                }
            }
            throw error;
        }
    }

    private async createProgressNotice(message: string): Promise<{ notice: Notice; clearInterval: () => void }> {
        const notice = new Notice(message, 0);
        const startTime = Date.now();
        const interval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            notice.setMessage(`${message} (${elapsed}s)`);
        }, 1000);

        return {
            notice,
            clearInterval: () => clearInterval(interval)
        };
    }

    async makeRequest(content: string, systemPrompt: string, userPrompt: string): Promise<string> {
        if (!this.apiKey) {
            throw new DeepInsightAIError('API key not set', 'Settings');
        }

        const { notice, clearInterval } = await this.createProgressNotice('🤔 Waiting for AI response...');

        try {
            return await this.retry(async () => {
                if (this.costTracker) {
                    this.costTracker.addInputTokens(
                        CostTracker.estimateTokens(systemPrompt) +
                        CostTracker.estimateTokens(userPrompt) +
                        CostTracker.estimateTokens(content)
                    );
                }

                const response = await requestUrl({
                    url: API_CONSTANTS.BASE_URL,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': this.apiKey,
                        'anthropic-version': API_CONSTANTS.API_VERSION,
                        'accept': 'application/json'
                    },
                    body: JSON.stringify({
                        model: this.model,
                        max_tokens: API_CONSTANTS.DEFAULT_MAX_TOKENS,
                        system: systemPrompt,
                        messages: [{
                            role: 'user',
                            content: `${userPrompt}\n\nNotes Content:\n${content}`
                        }]
                    }),
                    throw: false
                });

                const responseData = await this.parseResponse(response);

                if (this.costTracker) {
                    this.costTracker.addOutputTokens(CostTracker.estimateTokens(responseData));
                }

                return responseData;
            });
        } finally {
            clearInterval();
            notice.hide();
        }
    }

    private async parseResponse(response: RequestUrlResponse): Promise<string> {
        if (response.status !== 200) {
            let errorMessage: string;
            try {
                const data = JSON.parse(response.text);
                errorMessage = data.error?.message || `API request failed with status ${response.status}`;
            } catch {
                errorMessage = `API request failed with status ${response.status}`;
            }
            throw new DeepInsightAIError(errorMessage, 'API');
        }

        try {
            const data = JSON.parse(response.text);
            if (!data.content?.[0]?.text) {
                throw new DeepInsightAIError('Invalid API response format', 'API');
            }
            return data.content[0].text;
        } catch {
            throw new DeepInsightAIError('Failed to parse API response', 'API');
        }
    }
}

class ContentChunker {
    private static readonly TOKEN_OVERHEAD = {
        SYSTEM_PROMPT: 1000,
        USER_PROMPT: 500,
        RESPONSE: 10000,
        NOTE_METADATA: 100
    } as const;

    constructor(
        private readonly maxTokensPerRequest: number,
        private readonly charsPerToken: number = API_CONSTANTS.CHARS_PER_TOKEN
    ) {}

    private calculateMaxContentTokens(): number {
        const overheadTokens = 
            ContentChunker.TOKEN_OVERHEAD.SYSTEM_PROMPT +
            ContentChunker.TOKEN_OVERHEAD.USER_PROMPT +
            ContentChunker.TOKEN_OVERHEAD.RESPONSE;
        
        return Math.max(1000, this.maxTokensPerRequest - overheadTokens);
    }

    private estimateTokens(text: string): number {
        return Math.ceil(text.length / this.charsPerToken);
    }

    async createChunks(files: TFile[], vault: Vault): Promise<Array<{ content: string; size: number }>> {
        const chunks: Array<{ content: string; size: number }> = [];
        const maxContentTokens = this.calculateMaxContentTokens();
        let currentChunk = '';
        let currentTokens = 0;

        console.log('Chunking configuration:', {
            maxTokensPerRequest: this.maxTokensPerRequest,
            maxContentTokens,
            totalFiles: files.length
        });
        
        for (const file of files) {
            try {
                const content = await vault.read(file);
                const formattedNote = this.formatNote(file, content);
                const noteTokens = this.estimateTokens(formattedNote);

                // Log individual note sizes for debugging
                console.log(`Note size for ${file.path}:`, {
                    tokens: noteTokens,
                    chars: formattedNote.length
                });

                if (currentTokens > 0 && (currentTokens + noteTokens > maxContentTokens)) {
                    chunks.push({ 
                        content: currentChunk, 
                        size: this.estimateTokens(currentChunk)
                    });
                    currentChunk = '';
                    currentTokens = 0;
                }

                // Handle large individual notes
                if (noteTokens > maxContentTokens) {
                    if (currentTokens > 0) {
                        chunks.push({ 
                            content: currentChunk, 
                            size: this.estimateTokens(currentChunk)
                        });
                        currentChunk = '';
                        currentTokens = 0;
                    }
                    
                    const noteChunks = this.splitLargeNote(formattedNote, maxContentTokens);
                    chunks.push(...noteChunks);
                    continue;
                }

                currentChunk += formattedNote;
                currentTokens += noteTokens;
            } catch (error) {
                console.error(`Error processing file ${file.path}:`, error);
            }
        }

        if (currentTokens > 0) {
            chunks.push({ 
                content: currentChunk, 
                size: this.estimateTokens(currentChunk)
            });
        }

        // Log final chunking results
        console.log('Chunking results:', {
            totalChunks: chunks.length,
            chunkSizes: chunks.map(chunk => this.estimateTokens(chunk.content)),
            averageChunkSize: chunks.reduce((acc, chunk) => acc + this.estimateTokens(chunk.content), 0) / chunks.length
        });

        return chunks;
    }

    private formatNote(file: TFile, content: string): string {
        const folderPath = file.path.substring(0, file.path.lastIndexOf('/'));
        return `=== Note Path: ${file.path} ===
Folder: ${folderPath || 'root'}

Content:
${content}

=== End Note ===

`;
    }

    private splitLargeNote(note: string, maxTokens: number): Array<{ content: string; size: number }> {
        const chunks: Array<{ content: string; size: number }> = [];
        let remainingContent = note;
        const maxCharsPerChunk = maxTokens * this.charsPerToken;
        
        while (remainingContent.length > 0) {
            if (this.estimateTokens(remainingContent) <= maxTokens) {
                chunks.push({ 
                    content: remainingContent, 
                    size: this.estimateTokens(remainingContent)
                });
                break;
            }

            const splitIndex = this.findOptimalSplitPoint(remainingContent, maxCharsPerChunk);
            const chunk = remainingContent.slice(0, splitIndex);
            
            chunks.push({ 
                content: chunk, 
                size: this.estimateTokens(chunk)
            });
            
            remainingContent = remainingContent.slice(splitIndex).trim();
        }

        return chunks;
    }

    private findOptimalSplitPoint(text: string, maxChars: number): number {
        // Try to split at paragraph breaks first
        let splitIndex = text.lastIndexOf('\n\n', maxChars);
        
        // If no paragraph break found, try sentence breaks
        if (splitIndex === -1 || splitIndex < maxChars * 0.5) {
            splitIndex = text.lastIndexOf('. ', maxChars);
        }
        
        // If no good natural break point found, split at word boundary
        if (splitIndex === -1 || splitIndex < maxChars * 0.5) {
            splitIndex = text.lastIndexOf(' ', maxChars);
        }
        
        // If all else fails, split at exact char limit
        if (splitIndex === -1) {
            splitIndex = maxChars;
        }
        
        return splitIndex + 1;
    }
}

class ContentProcessor {
    constructor(
        private vault: Vault,
        private settings: DeepInsightAISettings,
        private testManager: TestModeManager
    ) {}

    async processContent(): Promise<{ content: string; size: number }[]> {
        const files = this.testManager.applyTestLimits(
            this.getFilteredFiles(),
            this.settings
        );

        const chunker = new ContentChunker(this.settings.maxTokensPerRequest);
        return chunker.createChunks(files, this.vault);
    }

    private getFilteredFiles(): TFile[] {
        return this.vault.getMarkdownFiles()
            .filter((file: TFile) => !this.settings.excludeFolders
                .some(folder => file.path.toLowerCase().startsWith(folder.toLowerCase())));
    }

}

export default class DeepInsightAI extends Plugin {
    settings!: DeepInsightAISettings;
    private networkStatus!: NetworkStatusChecker;
    private isProcessing = false;
    private costTracker?: CostTracker;
    private apiClient?: AnthropicAPIClient;

    async onload(): Promise<void> {
        await this.loadSettings();
        this.networkStatus = NetworkStatusChecker.getInstance();
        if (this.settings.showCostSummary) {
            this.costTracker = new CostTracker(this.settings.model);
        }
        this.initializeAPIClient();
        
        this.addCommand({
            id: 'generate-insights',
            name: 'Generate Insights from Notes',
            editorCallback: (editor: Editor) => this.generateTasks(editor)
        });
    
        this.addSettingTab(new DeepInsightAISettingTab(this.app, this));
        this.networkStatus.addListener(this.handleNetworkChange.bind(this));
    }

    private initializeAPIClient(): void {
        this.apiClient = new AnthropicAPIClient(
            this.settings.apiKey,
            this.settings.model,
            this.costTracker,
            this.settings.retryAttempts
        );
    }

    async generateTasks(editor: Editor): Promise<void> {
        if (!this.settings.apiKey) {
            new Notice('Please set your Anthropic API key in the plugin settings');
            return;
        }
    
        try {
            // Initialize cost tracker for the session
            if (this.settings.showCostSummary) {
                this.costTracker = new CostTracker(this.settings.model);
                this.initializeAPIClient();
            }
    
            new Notice('🔍 Starting your knowledge journey...');

            if (this.settings.testMode.enabled) {
                new Notice(`⚠️ Running in test mode. Results will be limited.`, 5000);
            }
                
            const contentProcessor = new ContentProcessor(
                this.app.vault,
                this.settings,
                TestModeManager.getInstance()
            );
            
            const chunks = await contentProcessor.processContent();
    
            // Show initial cost estimate if enabled
            if (this.settings.showCostSummary && this.costTracker) {
                const costMessage = this.costTracker.generateInitialCostEstimate(chunks.length);
                new Notice(costMessage, 10000);
            }
    
            if (chunks.length === 1) {
                try {
                    const result = await this.apiClient!.makeRequest(
                        chunks[0].content,
                        await this.getPromptFromNote(this.settings.systemPromptPath),
                        await this.getPromptFromNote(this.settings.userPromptPath)
                    );
                    await this.insertTasks(editor, result);
                    this.showSuccessMessage();
                    return;
                } catch (error) {
                    if (error instanceof DeepInsightAIError && error.type === 'Network') {
                        new Notice(UI_MESSAGES.NETWORK_ERROR, 5000);
                        return;
                    }
                    throw error;
                }
            }
    
            // Process multiple chunks
            const results = await this.processMultipleChunks(chunks);
            
            // Combine results
            new Notice('🧩 Merging insights together into a cohesive narrative...');
            const combinedResult = await this.combineResults(results);
            await this.insertTasks(editor, combinedResult);
            this.showSuccessMessage();
    
        } catch (error) {
            this.handleError(error instanceof Error ? error : new Error(String(error)));
        }
    }

    private async processMultipleChunks(chunks: { content: string; size: number }[]): Promise<string[]> {
        const results: string[] = [];
        for (let i = 0; i < chunks.length; i++) {
            const randomMessage = UI_MESSAGES.PROCESSING[
                Math.floor(Math.random() * UI_MESSAGES.PROCESSING.length)
            ];
            new Notice(`${randomMessage} (Processing chunk ${i + 1} of ${chunks.length})`);
    
            try {
                const result = await this.apiClient!.makeRequest(
                    chunks[i].content,
                    await this.getPromptFromNote(this.settings.systemPromptPath),
                    await this.getPromptFromNote(this.settings.userPromptPath)
                );
                results.push(result);
                new Notice(`🎉 Chunk ${i + 1} successfully processed! Moving forward...`, 3000);
            } catch (error) {
                if (error instanceof DeepInsightAIError && error.type === 'Network') {
                    new Notice(UI_MESSAGES.NETWORK_ERROR, 5000);
                    throw error;
                }
                throw error;
            }
        }
        return results;
    }

    private async combineResults(results: string[]): Promise<string> {
        if (results.length === 1) {
            return results[0];
        }
    
        new Notice(UI_MESSAGES.COMBINING);
        const combinedContent = results.join('\n\n=== Next Chunk ===\n\n');
        
        return await this.apiClient!.makeRequest(
            combinedContent,
            await this.getPromptFromNote(this.settings.systemPromptPath),
            await this.getPromptFromNote(this.settings.combinationPromptPath)
        );
    }

    private showSuccessMessage(): void {
        let message = UI_MESSAGES.SUCCESS;
        if (this.settings.showCostSummary && this.costTracker) {
            const { details } = this.costTracker.calculateCost();
            message += `\n\n${details}`;
        }
        new Notice(message, 7000);
    }

    private handleError(error: Error): void {
        const message = error instanceof DeepInsightAIError 
            ? `${error.type} Error: ${error.message}`
            : `Error: ${error.message}`;
        
        new Notice(message, 5000);
        console.error('Deep Insight AI Error:', error);
    }

    private handleNetworkChange(online: boolean): void {
        if (this.isProcessing && !online) {
            new Notice('📡 Network connection lost. Don\'t worry - we\'ll resume processing when connection is restored.', 5000);
        }
    }

    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
        if (this.settings.showCostSummary && !this.costTracker) {
            this.costTracker = new CostTracker(this.settings.model);
        } else if (!this.settings.showCostSummary) {
            this.costTracker = undefined;
        }
        this.initializeAPIClient();
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

class TestModeManager {
    private static instance: TestModeManager;
    private constructor() {}

    static getInstance(): TestModeManager {
        if (!TestModeManager.instance) {
            TestModeManager.instance = new TestModeManager();
        }
        return TestModeManager.instance;
    }

    isTestModeEnabled(settings: DeepInsightAISettings): boolean {
        return settings.testMode.enabled;
    }

    applyTestLimits(files: TFile[], settings: DeepInsightAISettings): TFile[] {
        if (!this.isTestModeEnabled(settings)) {
            return files;
        }

        console.log('Deep Insight AI: Test Mode Active');
        
        if (settings.testMode.maxFiles) {
            const limitedFiles = files.slice(0, settings.testMode.maxFiles);
            console.log(`Deep Insight AI: Limited to ${limitedFiles.length} files for testing`);
            return limitedFiles;
        }

        return files;
    }

    applyTokenLimit(content: string, settings: DeepInsightAISettings): string {
        if (!this.isTestModeEnabled(settings) || !settings.testMode.maxTokens) {
            return content;
        }

        const estimatedCurrentTokens = Math.ceil(content.length / API_CONSTANTS.CHARS_PER_TOKEN);
        if (estimatedCurrentTokens <= settings.testMode.maxTokens) {
            return content;
        }

        const charLimit = settings.testMode.maxTokens * API_CONSTANTS.CHARS_PER_TOKEN;
        const truncatedContent = content.slice(0, charLimit);
        
        console.log('Deep Insight AI: Content truncated for testing', {
            originalTokens: estimatedCurrentTokens,
            truncatedTokens: settings.testMode.maxTokens,
            reduction: `${Math.round((1 - settings.testMode.maxTokens / estimatedCurrentTokens) * 100)}%`
        });

        return truncatedContent + '\n\n[Content truncated for testing]';
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
        private promptType: 'systemPromptPath' | 'userPromptPath' | 'combinationPromptPath',
        private onSelect?: () => void
    ) {
        super(app);
        this.setPlaceholder('Type to search notes by title or path...');
    }

    getSuggestions(query: string): TFile[] {
        const files = this.app.vault.getMarkdownFiles();
        const excludedFolders = this.plugin.settings.excludeFolders;
        
        return files
            .filter(file => !excludedFolders
                .some(folder => file.path.toLowerCase().startsWith(folder.toLowerCase())))
            .filter(file => {
                if (!query) {
                    return true;
                }
                
                const searchString = `${file.basename} ${file.path}`.toLowerCase();
                return query.toLowerCase().split(' ')
                    .every(term => searchString.contains(term));
            })
            .sort((a, b) => a.path.localeCompare(b.path));
    }

    renderSuggestion(file: TFile, el: HTMLElement): void {
        const container = el.createDiv({ cls: 'deep-insight-ai-file-suggestion' });
        
        container.createEl('span', {
            cls: 'nav-file-title-content',
            text: '📄 '
        });
        
        container.createEl('span', { 
            cls: 'deep-insight-ai-file-name',
            text: file.basename,
            attr: { style: 'font-weight: bold;' }
        });
        
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
            this.plugin.settings[this.promptType] = file.path;
            await this.plugin.saveSettings();
            
            const promptTypes = {
                systemPromptPath: 'System',
                userPromptPath: 'User',
                combinationPromptPath: 'Combination'
            };
            new Notice(`${promptTypes[this.promptType]} prompt set to: ${file.basename}`);
            this.onSelect?.();
            
        } catch (error) {
            this.onError(new DeepInsightAIError(
                'Failed to set prompt file',
                'Settings',
                error instanceof Error ? error : undefined
            ));
        }
    }
}

class DeepInsightAISettingTab extends PluginSettingTab {
    private advancedSettingsEl: HTMLElement | null = null;

    constructor(
        app: App,
        private plugin: DeepInsightAI
    ) {
        super(app, plugin);
    }

    display(): void {
        const {containerEl} = this;
        containerEl.empty();
    
        this.displayBasicSettings(containerEl);
        this.displayPromptSettings(containerEl);
        this.displayAdvancedSettingsHeader(containerEl);
        
        if (this.plugin.settings.showAdvancedSettings && this.advancedSettingsEl) {
            this.advancedSettingsEl.style.display = 'block';
            this.displayAdvancedSettings(this.advancedSettingsEl);
        }
    }

    private displayBasicSettings(containerEl: HTMLElement): void {
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
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'claude-3-5-sonnet-latest': 'Claude 3.5 Sonnet (Balanced)',
                    'claude-3-5-haiku-latest': 'Claude 3.5 Haiku (Less Expensive)'
                })
                .setValue(this.plugin.settings.model)
                .onChange(async (value) => {
                    if (isAnthropicModel(value)) {
                        this.plugin.settings.model = value;
                        await this.plugin.saveSettings();
                    }
                }));
        
        this.addSettingOption(containerEl, 'Show Cost Summary', 
            'Display estimated cost after generating insights', 'showCostSummary');

        this.addInsertPositionSetting(containerEl);
        this.addExcludedFoldersSetting(containerEl);
    }

    private addSettingOption(
        containerEl: HTMLElement, 
        name: string, 
        desc: string, 
        settingKey: keyof DeepInsightAISettings,
        type: 'toggle' | 'text' = 'toggle'
    ): void {
        const setting = new Setting(containerEl)
            .setName(name)
            .setDesc(desc);

        if (type === 'toggle') {
            setting.addToggle(toggle => toggle
                .setValue(this.plugin.settings[settingKey] as boolean)
                .onChange(async (value) => {
                    (this.plugin.settings[settingKey] as boolean) = value;
                    await this.plugin.saveSettings();
                }));
        } else {
            setting.addText(text => text
                .setValue(String(this.plugin.settings[settingKey]))
                .onChange(async (value) => {
                    (this.plugin.settings[settingKey] as string) = value;
                    await this.plugin.saveSettings();
                }));
        }
    }

    private addInsertPositionSetting(containerEl: HTMLElement): void {
        new Setting(containerEl)
            .setName('Insert Position')
            .setDesc('Where to insert generated insights in the note')
            .addDropdown(dropdown => dropdown
                .addOptions({
                    'top': 'At the top of the note',
                    'bottom': 'At the bottom of the note',
                    'cursor': 'At current cursor position'
                })
                .setValue(this.plugin.settings.insertPosition)
                .onChange(async (value) => {
                    if (isInsertPosition(value)) {
                        this.plugin.settings.insertPosition = value;
                        await this.plugin.saveSettings();
                    }
                }));
    }

    private addExcludedFoldersSetting(containerEl: HTMLElement): void {
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
    }

    private displayAdvancedSettingsHeader(containerEl: HTMLElement): void {
        const advancedHeader = containerEl.createEl('div', { 
            cls: 'deep-insight-ai-advanced-header'
        });
    
        advancedHeader.createEl('h3', { 
            text: 'Advanced Settings',
            cls: 'deep-insight-ai-advanced-title'
        });
    
        const chevron = advancedHeader.createEl('span', {
            cls: `deep-insight-ai-advanced-chevron ${this.plugin.settings.showAdvancedSettings ? 'open' : ''}`
        });
    
        this.advancedSettingsEl = containerEl.createDiv({
            cls: 'deep-insight-ai-advanced-section',
            attr: {
                style: this.plugin.settings.showAdvancedSettings ? 'display: block' : 'display: none'
            }
        });
    
        advancedHeader.addEventListener('click', () => this.toggleAdvancedSettings(chevron));
    }

    private async toggleAdvancedSettings(chevron: HTMLElement): Promise<void> {
        this.plugin.settings.showAdvancedSettings = !this.plugin.settings.showAdvancedSettings;
        await this.plugin.saveSettings();
        
        chevron.classList.toggle('open');
        if (this.advancedSettingsEl) {
            if (this.plugin.settings.showAdvancedSettings) {
                this.advancedSettingsEl.style.display = 'block';
                this.displayAdvancedSettings(this.advancedSettingsEl);
            } else {
                this.advancedSettingsEl.style.display = 'none';
            }
        }
    }

    private displayAdvancedSettings(containerEl: HTMLElement): void {
        containerEl.empty();

        containerEl.createEl('p', {
            text: 'Advanced settings are for development and testing purposes. Use with caution.',
            cls: 'deep-insight-ai-advanced-description'
        });

        const testModeContainer = containerEl.createDiv('test-mode-settings');
        
        new Setting(testModeContainer)
            .setName('Test Mode')
            .setDesc('Limit processing for testing and development purposes to a single chunk')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.testMode.enabled)
                .onChange(async (value) => {
                    this.plugin.settings.testMode.enabled = value;
                    await this.plugin.saveSettings();
                    
                    const testModeOptions = testModeContainer.querySelector('.test-mode-options') as HTMLElement;
                    if (testModeOptions) {
                        testModeOptions.style.display = value ? 'block' : 'none';
                    }
                }));

        const testModeOptions = testModeContainer.createDiv({
            cls: 'test-mode-options',
            attr: {
                style: this.plugin.settings.testMode.enabled ? 'display: block' : 'display: none'
            }
        });

        new Setting(testModeOptions)
            .setName('Maximum Files')
            .setDesc('Maximum number of files to process in test mode (0 for no limit)')
            .addText(text => text
                .setPlaceholder('5')
                .setValue(String(this.plugin.settings.testMode.maxFiles || ''))
                .onChange(async (value) => {
                    const numValue = parseInt(value);
                    this.plugin.settings.testMode.maxFiles = isNaN(numValue) ? undefined : numValue;
                    await this.plugin.saveSettings();
                }));

        new Setting(testModeOptions)
            .setName('Maximum Tokens')
            .setDesc('Maximum tokens per request in test mode (0 for no limit)')
            .addText(text => text
                .setPlaceholder('1000')
                .setValue(String(this.plugin.settings.testMode.maxTokens || ''))
                .onChange(async (value) => {
                    const numValue = parseInt(value);
                    this.plugin.settings.testMode.maxTokens = isNaN(numValue) ? undefined : numValue;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Retry Attempts')
            .setDesc('Number of times to retry failed API requests')
            .addText(text => text
                .setPlaceholder('2')
                .setValue(String(this.plugin.settings.retryAttempts))
                .onChange(async (value) => {
                    const numValue = parseInt(value);
                    if (!isNaN(numValue) && numValue >= 0) {
                        this.plugin.settings.retryAttempts = numValue;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('Maximum Tokens Per Request')
            .setDesc('Maximum tokens to process in a single API request')
            .addText(text => text
                .setPlaceholder('90000')
                .setValue(String(this.plugin.settings.maxTokensPerRequest))
                .onChange(async (value) => {
                    const numValue = parseInt(value);
                    if (!isNaN(numValue) && numValue > 0) {
                        this.plugin.settings.maxTokensPerRequest = numValue;
                        await this.plugin.saveSettings();
                    }
                }));
    }

    private async createPromptSection(
        containerEl: HTMLElement,
        title: string,
        description: string,
        pathSetting: 'systemPromptPath' | 'userPromptPath' | 'combinationPromptPath',
        defaultSetting: 'defaultSystemPrompt' | 'defaultUserPrompt' | 'defaultCombinationPrompt'
    ): Promise<void> {
        const container = containerEl.createDiv({
            cls: 'deep-insight-ai-prompt-container'
        });
    
        container.createEl('h4', { text: title });
        container.createEl('p', { 
            text: description,
            cls: 'setting-item-description'
        });
    
        const notePath = this.plugin.settings[pathSetting];
        let noteContent = '';
    
        if (notePath) {
            try {
                const file = this.app.vault.getAbstractFileByPath(notePath);
                if (file instanceof TFile) {
                    noteContent = await this.app.vault.read(file);
                }
            } catch (error) {
                console.error(`Failed to read prompt note: ${error}`);
                new Notice(`Failed to read prompt note: ${error}`);
            }
        }
    
        if (notePath) {
            const linkContainer = container.createDiv({
                cls: 'deep-insight-ai-note-link'
            });
    
            linkContainer.createEl('span', {
                cls: 'setting-editor-extra-setting-button',
                text: '📝'
            });
    
            const link = linkContainer.createEl('a');
            link.textContent = notePath;
            link.addEventListener('click', async (e) => {
                e.preventDefault();
                const file = this.app.vault.getAbstractFileByPath(notePath);
                if (file instanceof TFile) {
                    const leaf = this.app.workspace.getLeaf();
                    if (leaf) {
                        await leaf.openFile(file);
                        new Notice('📝 Prompt opened in the background');
                    }
                }
            });
    
            const removeButton = linkContainer.createEl('span', {
                cls: 'deep-insight-ai-note-link-remove',
                text: '×'
            });
            removeButton.addEventListener('click', async () => {
                this.plugin.settings[pathSetting] = '';
                await this.plugin.saveSettings();
                this.display();
                new Notice(`${title} note removed`);
            });
    
            const resetButton = linkContainer.createEl('button', {
                cls: 'deep-insight-ai-reset-button',
                text: 'Reset to Default'
            });
            resetButton.addEventListener('click', async () => {
                this.plugin.settings[pathSetting] = '';
                this.plugin.settings[defaultSetting] = DEFAULT_PROMPTS[defaultSetting === 'defaultSystemPrompt' ? 'system' : 
                                                                     defaultSetting === 'defaultUserPrompt' ? 'user' : 'combination'];
                await this.plugin.saveSettings();
                this.display();
                new Notice(`${title} reset to default`);
            });
    
            container.createEl('div', {
                cls: 'deep-insight-ai-prompt-source',
                text: 'Using custom prompt from the linked note'
            });
        } else {
            container.createEl('div', {
                cls: 'deep-insight-ai-prompt-source',
                text: 'Using default prompt (no note selected)'
            });
        }
    
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
                        pathSetting,
                        () => this.display()
                    ).open();
                }));
    
        const promptContainer = container.createDiv({
            cls: 'deep-insight-ai-prompt-textarea-container'
        });
    
        if (notePath) {
            promptContainer.createEl('div', {
                cls: 'deep-insight-ai-prompt-message',
                text: '💡 This prompt is managed through the linked note above. Click the note link to edit.'
            });
        }
    
        const textarea = promptContainer.createEl('textarea', {
            cls: 'deep-insight-ai-prompt-textarea'
        });
    
        textarea.value = notePath ? noteContent : this.plugin.settings[defaultSetting];
        textarea.disabled = !!notePath;
        textarea.placeholder = notePath 
            ? 'This prompt is managed through the linked note. Click the note link above to edit.'
            : 'Enter default prompt';
    
        textarea.addEventListener('change', async (e) => {
            if (!notePath) {
                const target = e.target as HTMLTextAreaElement;
                this.plugin.settings[defaultSetting] = target.value;
                await this.plugin.saveSettings();
            }
        });
    }

    private async displayPromptSettings(containerEl: HTMLElement): Promise<void> {
        containerEl.createEl('h3', { text: 'Prompts Configuration' });

        await Promise.all([
            this.createPromptSection(
                containerEl,
                'System Prompt',
                'Defines how the AI should process notes',
                'systemPromptPath',
                'defaultSystemPrompt'
            ),
            this.createPromptSection(
                containerEl,
                'User Prompt',
                'Defines what specific insight to generate',
                'userPromptPath',
                'defaultUserPrompt'
            ),
            this.createPromptSection(
                containerEl,
                'Combination Prompt',
                'Defines how to merge and organize tasks from multiple chunks',
                'combinationPromptPath',
                'defaultCombinationPrompt'
            )
        ]);
    }
}

function isAnthropicModel(value: string): value is AnthropicModel {
    const VALID_MODELS = Object.values(AnthropicModelEnum);
    return VALID_MODELS.includes(value as AnthropicModel);
}

function isInsertPosition(value: string): value is InsertPosition {
    const VALID_POSITIONS = Object.values(InsertPositionEnum);
    return VALID_POSITIONS.includes(value as InsertPosition);
}