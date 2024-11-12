import { App, Editor, Notice, Plugin, PluginSettingTab, Setting, TFile, SuggestModal, requestUrl } from 'obsidian';
import { DEFAULT_PROMPTS } from './defaultPrompts';
import { CostTracker } from './costTracker';

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
    showCostSummary: boolean;
    testMode: {
        enabled: boolean;
        maxFiles?: number;
        maxTokens?: number;
    };
    showAdvancedSettings: boolean;
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
    defaultSystemPrompt: DEFAULT_PROMPTS.system,
    defaultUserPrompt: DEFAULT_PROMPTS.user,
    defaultCombinationPrompt: DEFAULT_PROMPTS.combination,
    retryAttempts: 2,
    showCostSummary: true,
    testMode: {
        enabled: false,
        maxFiles: 5,
        maxTokens: 1000
    },
    showAdvancedSettings: false,
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

function isAnthropicModel(value: string): value is AnthropicModel {
    return value === 'claude-3-5-sonnet-latest' || value === 'claude-3-5-haiku-latest';
}

function isInsertPosition(value: string): value is InsertPosition {
    return value === 'top' || value === 'bottom' || value === 'cursor';
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
        
        // If maxFiles is set, limit the number of files
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

        // Rough estimation: 1 token ≈ 4 characters
        const estimatedCurrentTokens = Math.ceil(content.length / 4);
        if (estimatedCurrentTokens <= settings.testMode.maxTokens) {
            return content;
        }

        // Calculate approximate character limit
        const charLimit = settings.testMode.maxTokens * 4;
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
        private onSelect?: () => void  // Add callback for selection
    ) {
        super(app);
        this.setPlaceholder('Type to search notes by title or path...');
    }

    getSuggestions(query: string): TFile[] {
        const files = this.app.vault.getMarkdownFiles();
        const excludedFolders = this.plugin.settings.excludeFolders;
        
        const filtered = files
            .filter(file => !excludedFolders
                .some(folder => file.path.toLowerCase().startsWith(folder.toLowerCase())))
            .filter(file => {
                if (!query) {
                    return true;
                }
                
                const searchString = `${file.basename} ${file.path}`.toLowerCase();
                const queries = query.toLowerCase().split(' ');
                
                return queries.every(query => searchString.contains(query));
            })
            .sort((a, b) => a.path.localeCompare(b.path));

        return filtered;
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
            const settings = this.plugin.settings as DeepInsightAISettings;
            settings[this.promptType] = file.path;
            
            await this.plugin.saveSettings();
            
            const promptTypes = {
                systemPromptPath: 'System',
                userPromptPath: 'User',
                combinationPromptPath: 'Combination'
            };
            new Notice(`${promptTypes[this.promptType]} prompt set to: ${file.basename}`);

            // Call the onSelect callback if provided
            if (this.onSelect) {
                this.onSelect();
            }
            
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
    settings!: DeepInsightAISettings;
    private networkStatus!: NetworkStatusChecker;
    private isProcessing = false;
    private costTracker: CostTracker | undefined;

    async onload(): Promise<void> {
        await this.loadSettings();
        this.networkStatus = NetworkStatusChecker.getInstance();
        
        // Load styles
        this.loadStyles();
        
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
    
    private loadStyles(): void {
        // Add the styles element
        const styleEl = document.createElement('style');
        styleEl.id = 'deep-insight-ai-styles';
        document.head.appendChild(styleEl);
        
        // Load the CSS file
        const cssFile = this.app.vault.adapter.read(
            this.app.vault.configDir + '/plugins/deep-insight-ai/styles.css'
        ).then(css => {
            styleEl.textContent = css;
        }).catch(error => {
            console.error('Failed to load DeepInsight AI styles:', error);
        });
    }

    onunload(): void {
        // Remove network listener
        this.networkStatus.removeListener(this.handleNetworkChange.bind(this));
        
        // Remove styles
        const styleEl = document.getElementById('deep-insight-ai-styles');
        if (styleEl) {
            styleEl.remove();
        }
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

            // Show waiting notice
            const waitingNotice = new Notice('🤔 Waiting for AI response...', 0);
            const startTime = Date.now();
            
            // Update notice with elapsed time every second
            const updateInterval = setInterval(() => {
                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                waitingNotice.setMessage(`🤔 Processing... (${elapsed}s)`);
            }, 1000);

            // Track input tokens before making request
            if (this.costTracker) {
                const systemPromptTokens = CostTracker.estimateTokens(systemPrompt);
                const userPromptTokens = CostTracker.estimateTokens(userPrompt);
                const contentTokens = CostTracker.estimateTokens(content);
                this.costTracker.addInputTokens(systemPromptTokens + userPromptTokens + contentTokens);
            }
    
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

            // Track output tokens after receiving response
            if (this.costTracker) {
                const responseData: AnthropicResponse = JSON.parse(response.text);
                if (responseData.content?.[0]?.text) {
                    const outputTokens = CostTracker.estimateTokens(responseData.content[0].text);
                    this.costTracker.addOutputTokens(outputTokens);
                }
            }

            // Clear the waiting notice and interval
            clearInterval(updateInterval);
            waitingNotice.hide();
    
            console.log('Deep Insight AI: Received API Response:', {
                status: response.status,
                contentLength: response.text?.length || 0,
                timeElapsed: `${Math.floor((Date.now() - startTime) / 1000)}s`
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
            
            this.costTracker = new CostTracker(this.settings.model);
    
            // Get prompts for size calculations
            const systemPrompt = await this.getPromptFromNote(this.settings.systemPromptPath) || this.settings.defaultSystemPrompt;
            const userPrompt = await this.getPromptFromNote(this.settings.userPromptPath) || this.settings.defaultUserPrompt;
    
            // Calculate reserved tokens
            const systemPromptSize = Math.ceil(systemPrompt.length / 3);
            const userPromptSize = Math.ceil(userPrompt.length / 3);
            const RESPONSE_TOKENS = 10000;
            const RESERVED_TOKENS = systemPromptSize + userPromptSize + RESPONSE_TOKENS;
            const MAX_CHUNK_SIZE = this.settings.maxTokensPerRequest - RESERVED_TOKENS;
            const MAX_CHUNK_CHARS = MAX_CHUNK_SIZE * 3;
    
            // Get filtered files
            const files = this.app.vault.getMarkdownFiles()
                .filter(file => !this.settings.excludeFolders
                    .some(folder => file.path.toLowerCase().startsWith(folder.toLowerCase())));
    
            new Notice('🔍 Starting your knowledge journey...');
            
            const chunks = await this.getAllNotesContent();
    
            // Show initial estimate if cost summary is enabled
            if (this.settings.showCostSummary && this.costTracker) {
                const costMessage = this.costTracker.generateInitialCostEstimate(chunks.length);
                new Notice(costMessage, 10000);
            }
    
            // If there's only one chunk, process it directly without combination
            if (chunks.length === 1) {
                try {
                    const result = await this.callAnthropicAPI(chunks[0].content);
                    await this.insertTasks(editor, result);
    
                    let successMessage = '✨ Deep insights successfully crystallized.';
                    if (this.settings.showCostSummary && this.costTracker) {
                        const { details } = this.costTracker.calculateCost();
                        successMessage += `\n\n${details}`;
                    }
                    new Notice(successMessage, 7000);
                    return;
                } catch (error) {
                    if (error instanceof DeepInsightAIError && error.type === 'Network') {
                        new Notice('📡 Network error: Please check your connection', 5000);
                        return;
                    }
                    throw error;
                }
            }
    
            // Multiple chunks: Process with progress updates and combination
            const chunkResults: string[] = [];
            for (let i = 0; i < chunks.length; i++) {
                const messages = [
                    '🧠 Diving deep into your notes...',
                    '💫 Extracting pearls of wisdom...',
                    '🎯 Connecting the dots in your notes...',
                    '✨ Uncovering insights...',
                    '🔮 Crystallizing your thoughts...'
                ];
                
                new Notice(
                    `${messages[Math.floor(Math.random() * messages.length)]} ` +
                    `(Processing chunk ${i + 1} of ${chunks.length})`
                );
                
                try {
                    const tasks = await this.callAnthropicAPI(chunks[i].content);
                    chunkResults.push(tasks);
                    new Notice(`🎉 Chunk ${i + 1} successfully processed! Moving forward...`);
                } catch (error) {
                    if (error instanceof DeepInsightAIError && error.type === 'Network') {
                        new Notice('📡 Network error: Please check your connection', 5000);
                        return;
                    }
                    throw error;
                }
            }
    
            // Combine results for multiple chunks
            new Notice('🧩 Merging insights together into a cohesive narrative...');
            const finalTasks = await this.combineChunkResults(chunkResults);
            await this.insertTasks(editor, finalTasks);
    
            let successMessage = '✨ Deep insights successfully crystallized.';
            if (this.settings.showCostSummary && this.costTracker) {
                const { details } = this.costTracker.calculateCost();
                successMessage += `\n\n${details}`;
            }
            new Notice(successMessage, 7000);
            
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

        // Show waiting notice for combination phase
        const waitingNotice = new Notice('🔄 Combining insights...', 0);
        const startTime = Date.now();
        
        // Update notice with elapsed time every second
        const updateInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            waitingNotice.setMessage(`🔄 Combining insights... (${elapsed}s)`);
        }, 1000);
        
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

            // Clear the waiting notice and interval
            clearInterval(updateInterval);
            waitingNotice.hide();
    
            if (response.status !== 200) {
                throw new DeepInsightAIError(`Failed to combine results: ${response.status}`, 'API');
            }
    
            const responseData: AnthropicResponse = JSON.parse(response.text);
            if (!responseData.content?.[0]?.text) {
                throw new DeepInsightAIError('Invalid response format when combining results', 'API');
            }
    
            return responseData.content[0].text;
    
        } catch (error) {
            // Clear the waiting notice and interval in case of error
            clearInterval(updateInterval);
            waitingNotice.hide();

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

        const testManager = TestModeManager.getInstance();
    
        const files = testManager.applyTestLimits(
            this.app.vault.getMarkdownFiles()
                .filter(file => !this.settings.excludeFolders
                    .some(folder => file.path.toLowerCase().startsWith(folder.toLowerCase()))),
            this.settings
        );

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

        return chunks.map(chunk => ({
            content: testManager.applyTokenLimit(chunk.content, this.settings),
            size: chunk.size
        }));
    
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
    private advancedSettingsEl: HTMLElement | null = null;

    constructor(app: App, plugin: DeepInsightAI) {
        super(app, plugin);
        this.plugin = plugin;
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
    
        // If a note is selected, try to read its content
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
    
            // Add reset button
            const resetButton = linkContainer.createEl('button', {
                cls: 'deep-insight-ai-reset-button',
                text: 'Reset to Default'
            });
            // Add reset button
            resetButton.addEventListener('click', async () => {
                const settings = this.plugin.settings as DeepInsightAISettings;
                settings[pathSetting] = '';
                
                // Map the settings key to the DEFAULT_PROMPTS key
                const promptTypeMap = {
                    'defaultSystemPrompt': 'system',
                    'defaultUserPrompt': 'user',
                    'defaultCombinationPrompt': 'combination'
                } as const;
                
                const defaultPromptKey = promptTypeMap[defaultSetting as keyof typeof promptTypeMap];
                if (defaultPromptKey) {
                    settings[defaultSetting] = DEFAULT_PROMPTS[defaultPromptKey];
                }
                
                await this.plugin.saveSettings();
                this.display(); // Refresh the settings tab
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
                        pathSetting,
                        () => {
                            // Refresh the settings display after selection
                            this.display();
                        }
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
    
        // Set textarea value based on whether we have a linked note or default
        textarea.value = notePath ? noteContent : this.plugin.settings[defaultSetting];
        textarea.disabled = !!notePath;
        textarea.placeholder = notePath 
            ? 'This prompt is managed through the linked note. Click the note link above to edit.'
            : 'Enter default prompt';
    
        textarea.addEventListener('change', async (e) => {
            if (!notePath) {  // Only allow changes when no note is linked
                const target = e.target as HTMLTextAreaElement;
                const settings = this.plugin.settings as DeepInsightAISettings;
                settings[defaultSetting] = target.value;
                await this.plugin.saveSettings();
            }
        });
    }

    display(): void {
        const {containerEl} = this;
        containerEl.empty();

        // Regular settings...
        this.displayBasicSettings(containerEl);

        // Advanced Settings Section with improved header
        const advancedHeader = containerEl.createEl('div', { 
            cls: 'deep-insight-ai-advanced-header'
        });

        // Create header content
        advancedHeader.createEl('h3', { 
            text: 'Advanced Settings',
            cls: 'deep-insight-ai-advanced-title'
        });

        // Add chevron icon
        const chevron = advancedHeader.createEl('span', {
            cls: `deep-insight-ai-advanced-chevron ${this.plugin.settings.showAdvancedSettings ? 'open' : ''}`
        });

        // Create advanced section container
        this.advancedSettingsEl = containerEl.createDiv({
            cls: 'deep-insight-ai-advanced-section'
        });

        // Make header clickable
        advancedHeader.addEventListener('click', async () => {
            this.plugin.settings.showAdvancedSettings = !this.plugin.settings.showAdvancedSettings;
            await this.plugin.saveSettings();
            
            // Toggle chevron and section visibility without full rebuild
            chevron.classList.toggle('open');
            if (this.advancedSettingsEl) {
                if (this.plugin.settings.showAdvancedSettings) {
                    this.advancedSettingsEl.style.display = 'block';
                    this.displayAdvancedSettings(this.advancedSettingsEl);
                } else {
                    this.advancedSettingsEl.style.display = 'none';
                }
            }
        });

        // Initialize advanced section
        if (this.plugin.settings.showAdvancedSettings) {
            this.displayAdvancedSettings(this.advancedSettingsEl);
        } else {
            this.advancedSettingsEl.style.display = 'none';
        }
    }

    private displayBasicSettings(containerEl: HTMLElement): void {
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
                    'claude-3-5-haiku-latest': 'Claude 3.5 Haiku (Less Expensive)'
                };
                
                dropdown
                    .addOptions(options)
                    .setValue(this.plugin.settings.model)
                    .onChange(async (value) => {
                        if (!isAnthropicModel(value)) {
                            new Notice('Invalid model selection');
                            return;
                        }
                        this.plugin.settings.model = value;
                        await this.plugin.saveSettings();
                    });
            });
        
        // Add cost summary setting
        new Setting(containerEl)
        .setName('Show Cost Summary')
        .setDesc('Display estimated cost after generating insights')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.showCostSummary)
            .onChange(async (value) => {
                this.plugin.settings.showCostSummary = value;
                await this.plugin.saveSettings();
            }));

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
                    .onChange(async (value) => {
                        if (!isInsertPosition(value)) {
                            new Notice('Invalid insert position');
                            return;
                        }
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

    private displayAdvancedSettings(containerEl: HTMLElement): void {
        containerEl.empty();

        // Add description for advanced settings
        containerEl.createEl('p', {
            text: 'Advanced settings are for development and testing purposes. Use with caution.',
            cls: 'deep-insight-ai-advanced-description'
        });

        // Test Mode Settings
        const testModeContainer = containerEl.createDiv('test-mode-settings');
        
        new Setting(testModeContainer)
            .setName('Test Mode')
            .setDesc('Limit processing for testing and development purposes')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.testMode.enabled)
                .onChange(async (value) => {
                    this.plugin.settings.testMode.enabled = value;
                    await this.plugin.saveSettings();
                    
                    // Only update the test mode options visibility
                    const testModeOptions = testModeContainer.querySelector('.test-mode-options') as HTMLElement;
                    if (testModeOptions) {
                        testModeOptions.style.display = value ? 'block' : 'none';
                    }
                }));

        // Create container for test mode options
        const testModeOptions = testModeContainer.createDiv({
            cls: 'test-mode-options',
            attr: {
                style: this.plugin.settings.testMode.enabled ? 'display: block' : 'display: none'
            }
        });

        // Test mode options
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

        // Other advanced settings...
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
}