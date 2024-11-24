import { Editor, Notice, Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, UI_MESSAGES } from './constants';
import { CostTracker } from './costTracker';
import { DeepInsightAISettingTab } from './settings';
import { DeepInsightAISettings } from './types';
import { AIProviderFactory } from './services/ai/factory';
import { AIMessage, AIProvider } from './services/ai/types';
import { ContentProcessor } from './services/content/processor';
import { TestModeManager } from './services/test/testManager';
import { NetworkManager } from './services/network/networkManager';
import { ErrorHandler } from './services/error/handler';
import { DeepInsightError } from './services/error/types';
import { InputValidator } from './utils/validation';
import { PromptManager } from './utils/prompts';

export default class DeepInsightAI extends Plugin {
    settings!: DeepInsightAISettings;
    private networkManager!: NetworkManager;
    private costTracker?: CostTracker;
    private provider?: AIProvider;
    private isProcessing = false;

    async onload(): Promise<void> {
        await this.loadSettings();
        
        this.networkManager = NetworkManager.getInstance();
        this.networkManager.initialize(this.settings);
        this.initializeProvider();
        
        this.addCommand({
            id: 'generate-insights',
            name: 'Generate Insights and Tasks from Notes',
            editorCallback: (editor: Editor) => this.generateTasks(editor)
        });
    
        this.addSettingTab(new DeepInsightAISettingTab(this.app, this));
    }

    private initializeProvider(): void {
        try {
            this.provider = AIProviderFactory.getProvider(this.settings.provider.type);
            this.provider.initialize({
                apiKey: this.settings.provider.apiKey,
                model: this.settings.provider.model,
            });

            if (this.settings.showCostSummary) {
                this.costTracker = new CostTracker(this.provider);
            }
        } catch (error) {
            ErrorHandler.handle(error);
        }
    }

    async generateTasks(editor: Editor): Promise<void> {
        if (this.isProcessing) {
            new Notice('Already processing notes. Please wait...');
            return;
        }

        if (!InputValidator.validateApiKey(
            this.settings.provider.apiKey, 
            this.settings.provider.type
        )) {
            new Notice(`Please set a valid ${this.settings.provider.type} API key in settings`);
            return;
        }

        this.isProcessing = true;

        try {
            await this.processNotes(editor);
        } catch (error) {
            ErrorHandler.handle(error);
        } finally {
            this.isProcessing = false;
        }
    }

    private async processNotes(editor: Editor): Promise<void> {
        new Notice('🔍 Starting analysis...');

        if (this.settings.testMode.enabled) {
            new Notice('⚠️ Running in test mode. Results will be limited.', 5000);
        }

        const contentProcessor = new ContentProcessor(
            this.app.vault,
            this.settings,
            TestModeManager.getInstance()
        );

        const chunks = await contentProcessor.processContent();

        if (this.settings.showCostSummary && this.costTracker) {
            const costEstimate = this.costTracker.generateInitialCostEstimate(chunks.length);
            new Notice(costEstimate, 10000);
        }

        if (chunks.length === 1) {
            const result = await this.processChunk(chunks[0].content);
            await this.insertTasks(editor, result);
            this.showSuccessMessage();
            return;
        }

        const results = await this.processMultipleChunks(chunks);
        const combinedResult = await this.combineResults(results);
        await this.insertTasks(editor, combinedResult);
        this.showSuccessMessage();
    }

    private async processChunk(content: string): Promise<string> {
        if (!this.provider) {
            throw new DeepInsightError({
                type: 'PROCESSING_ERROR',
                message: 'AI provider not initialized'
            });
        }

        const systemPrompt = await PromptManager.loadPromptTemplate(
            this.app.vault,
            this.settings.systemPromptPath,
            this.settings.defaultSystemPrompt
        );

        const userPrompt = await PromptManager.loadPromptTemplate(
            this.app.vault,
            this.settings.userPromptPath,
            this.settings.defaultUserPrompt
        );

        const messages: AIMessage[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `${userPrompt}\n\nNotes Content:\n${content}` }
        ];

        const response = await this.provider.generateResponse(messages);
        
        if (this.costTracker && response.usage) {
            this.costTracker.addUsage(response.usage);
        }

        return response.content;
    }

    private async processMultipleChunks(
        chunks: { content: string; size: number }[]
    ): Promise<string[]> {
        const results: string[] = [];

        for (let i = 0; i < chunks.length; i++) {
            const randomMessage = UI_MESSAGES.PROCESSING[
                Math.floor(Math.random() * UI_MESSAGES.PROCESSING.length)
            ];
            
            new Notice(`${randomMessage} (${i + 1}/${chunks.length})`);

            const result = await this.processChunk(chunks[i].content);
            results.push(result);
        }

        return results;
    }

    private async combineResults(results: string[]): Promise<string> {
        if (results.length === 1) {
            return results[0];
        }

        if (!this.provider) {
            throw new DeepInsightError({
                type: 'PROCESSING_ERROR',
                message: 'AI provider not initialized'
            });
        }

        new Notice(UI_MESSAGES.COMBINING);

        const combinationPrompt = await PromptManager.loadPromptTemplate(
            this.app.vault,
            this.settings.combinationPromptPath,
            this.settings.defaultCombinationPrompt
        );

        const messages: AIMessage[] = [
            { role: 'system', content: combinationPrompt },
            { 
                role: 'user', 
                content: results.join('\n\n=== Next Section ===\n\n')
            }
        ];

        const response = await this.provider.generateResponse(messages);
        
        if (this.costTracker && response.usage) {
            this.costTracker.addUsage(response.usage);
        }

        return response.content;
    }

    private async insertTasks(editor: Editor, content: string): Promise<void> {
        const formattedDate = window.moment().format('YYYY-MM-DD');
        const header = `## Generated Tasks (${formattedDate})\n\n`;
        
        const cursor = editor.getCursor();
        editor.replaceRange('\n\n' + header + content + '\n', cursor);
    }

    private showSuccessMessage(): void {
        let message = UI_MESSAGES.SUCCESS;

        if (this.settings.showCostSummary && this.costTracker) {
            const { details } = this.costTracker.calculateCost();
            message += `\n\n${details}`;
        }

        new Notice(message, 7000);
    }

    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
        this.initializeProvider();
    }
}