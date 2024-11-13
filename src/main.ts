import { Editor, Notice, Plugin, TFile, requestUrl, RequestUrlResponse, Vault } from 'obsidian';
import { DEFAULT_SETTINGS, ANTHROPIC_API_CONSTANTS, UI_MESSAGES } from './constants';
import { CostTracker } from './costTracker';
import { 
    DeepInsightAISettings,
    DeepInsightAISettingTab,
    AnthropicModel
} from './settings';

type ErrorType = 'API' | 'File' | 'Settings' | 'Processing' | 'Network';

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
                    url: ANTHROPIC_API_CONSTANTS.BASE_URL,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': this.apiKey,
                        'anthropic-version': ANTHROPIC_API_CONSTANTS.API_VERSION,
                        'accept': 'application/json'
                    },
                    body: JSON.stringify({
                        model: this.model,
                        max_tokens: ANTHROPIC_API_CONSTANTS.DEFAULT_MAX_TOKENS,
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


class AnthropicContentFormatter {
    private documentIndex = 1;

    format(files: { path: string; content: string }[]): string {
        const documents = files.map(file => this.createDocumentXML(file.path, file.content)).join('\n');
        return `<documents>\n${documents}\n</documents>`;
    }

    // Follow best practices from: 
    //  https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/long-context-tips
    private createDocumentXML(path: string, content: string): string {
        return `<document index="${this.documentIndex++}">
    <source>${path}</source>
    <document_content>
${content}
    </document_content>
</document>`;
    }

    reset(): void {
        this.documentIndex = 1;
    }
}

class ContentChunker {
    private static readonly TOKEN_OVERHEAD = {
        SYSTEM_PROMPT: 1000,
        USER_PROMPT: 500,
        RESPONSE: 10000,
        XML_TAGS: 200
    } as const;

    constructor(
        private readonly maxTokensPerRequest: number,
        private readonly charsPerToken: number = ANTHROPIC_API_CONSTANTS.CHARS_PER_TOKEN
    ) {}

    private calculateMaxContentTokens(): number {
        const overheadTokens = Object.values(ContentChunker.TOKEN_OVERHEAD).reduce((a, b) => a + b, 0);
        return Math.max(1000, this.maxTokensPerRequest - overheadTokens);
    }

    private estimateTokens(text: string): number {
        return Math.ceil(text.length / this.charsPerToken);
    }

    async createChunks(files: TFile[], vault: Vault): Promise<Array<{ content: string; size: number }>> {
        const formatter = new AnthropicContentFormatter();
        const maxContentTokens = this.calculateMaxContentTokens();
        const chunks: Array<{ content: string; size: number }> = [];
        let currentFiles: Array<{ path: string; content: string }> = [];
        let currentTokens = 0;

        for (const file of files) {
            try {
                const content = await vault.read(file);
                const noteContent = content.trim();
                const noteTokens = this.estimateTokens(noteContent);

                if (currentTokens > 0 && (currentTokens + noteTokens > maxContentTokens)) {
                    chunks.push(this.createChunk(formatter, currentFiles));
                    currentFiles = [];
                    currentTokens = 0;
                    formatter.reset();
                }

                if (noteTokens > maxContentTokens) {
                    if (currentFiles.length > 0) {
                        chunks.push(this.createChunk(formatter, currentFiles));
                        currentFiles = [];
                        currentTokens = 0;
                        formatter.reset();
                    }
                    chunks.push(...this.splitLargeNote(file.path, noteContent, maxContentTokens));
                    formatter.reset();
                    continue;
                }

                currentFiles.push({ path: file.path, content: noteContent });
                currentTokens += noteTokens;
            } catch (error) {
                console.error(`Error processing file ${file.path}:`, error);
            }
        }

        if (currentFiles.length > 0) {
            chunks.push(this.createChunk(formatter, currentFiles));
        }

        return chunks;
    }

    private createChunk(formatter: AnthropicContentFormatter, files: Array<{ path: string; content: string }>): { content: string; size: number } {
        const content = formatter.format(files);
        return {
            content: content,
            size: this.estimateTokens(content)
        };
    }

    private splitLargeNote(path: string, content: string, maxTokens: number): Array<{ content: string; size: number }> {
        const chunks: Array<{ content: string; size: number }> = [];
        let remainingContent = content;
        const maxCharsPerChunk = maxTokens * this.charsPerToken;
        const formatter = new AnthropicContentFormatter();
        
        while (remainingContent.length > 0) {
            const splitIndex = this.findOptimalSplitPoint(remainingContent, maxCharsPerChunk);
            const chunkContent = remainingContent.slice(0, splitIndex).trim();
            
            if (chunkContent.length > 0) {
                const content = formatter.format([{ path, content: chunkContent }]);
                chunks.push({
                    content: content,
                    size: this.estimateTokens(content)
                });
            }
            
            remainingContent = remainingContent.slice(splitIndex).trim();
            formatter.reset();
        }

        return chunks;
    }

    private findOptimalSplitPoint(text: string, maxChars: number): number {
        const breakPoints = [
            text.lastIndexOf('\n\n', maxChars),
            text.lastIndexOf('. ', maxChars),
            text.lastIndexOf(' ', maxChars)
        ];

        const validBreakPoint = breakPoints.find(point => point !== -1 && point > maxChars * 0.5);
        return validBreakPoint !== undefined ? validBreakPoint + 1 : maxChars;
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

        const estimatedCurrentTokens = Math.ceil(content.length / ANTHROPIC_API_CONSTANTS.CHARS_PER_TOKEN);
        if (estimatedCurrentTokens <= settings.testMode.maxTokens) {
            return content;
        }

        const charLimit = settings.testMode.maxTokens * ANTHROPIC_API_CONSTANTS.CHARS_PER_TOKEN;
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

