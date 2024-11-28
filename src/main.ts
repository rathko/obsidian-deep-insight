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
        if (!this.validatePrerequisites()) {
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

    private validatePrerequisites(): boolean {
        if (this.isProcessing) {
            new Notice('Already processing notes. Please wait...');
            return false;
        }

        if (!InputValidator.validateApiKey(
            this.settings.provider.apiKey, 
            this.settings.provider.type
        )) {
            new Notice(`Please set a valid ${this.settings.provider.type} API key in settings`);
            return false;
        }

        return true;
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
        await this.handleCostEstimate(chunks.length);
        
        const result = chunks.length === 1 
            ? await this.processChunk(chunks[0].content) 
            : await this.processChunks(chunks);

        await this.insertTasks(editor, result);
        this.showSuccessMessage();
    }

    private async handleCostEstimate(chunkCount: number): Promise<void> {
        if (this.settings.showCostSummary && this.costTracker) {
            const costEstimate = this.costTracker.generateInitialCostEstimate(chunkCount);
            new Notice(costEstimate, 10000);
        }
    }

    private async getPrompts(): Promise<{ systemPrompt: string; userPrompt: string }> {
        const [systemPrompt, userPrompt] = await Promise.all([
            PromptManager.loadPromptTemplate(
                this.app.vault,
                this.settings.systemPromptPath,
                this.settings.defaultSystemPrompt
            ),
            PromptManager.loadPromptTemplate(
                this.app.vault,
                this.settings.userPromptPath,
                this.settings.defaultUserPrompt
            )
        ]);

        return { systemPrompt, userPrompt };
    }

    private async processChunk(content: string, isCombining = false): Promise<string> {
        if (!this.provider) {
            throw new DeepInsightError({
                type: 'PROCESSING_ERROR',
                message: 'AI provider not initialized'
            });
        }

        const { systemPrompt, userPrompt } = await this.getPrompts();
        const promptContent = isCombining 
            ? content 
            : `Notes Content:\n${content}`;

        const messages: AIMessage[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `${userPrompt}\n\n${promptContent}` }
        ];

        const response = await this.provider.generateResponse(messages);
        
        if (this.costTracker && response.usage) {
            this.costTracker.addUsage(response.usage);
        }

        return response.content;
    }

    private async processChunks(
        chunks: { content: string; size: number }[]
    ): Promise<string> {
        const results: string[] = [];

        for (let i = 0; i < chunks.length; i++) {
            const randomMessage = UI_MESSAGES.PROCESSING[
                Math.floor(Math.random() * UI_MESSAGES.PROCESSING.length)
            ];
            
            new Notice(`${randomMessage} (${i + 1}/${chunks.length})`);
            const result = await this.processChunk(chunks[i].content);
            results.push(result);
        }

        new Notice(UI_MESSAGES.COMBINING);
        const combinedContent = results.join('\n\n=== Next Section ===\n\n');
        
        return this.processChunk(combinedContent, true);
    }

    private async insertTasks(editor: Editor, content: string): Promise<void> {
        // const formattedDate = window.moment().format('YYYY-MM-DD');
        // const contentToInsert = `\n\n${content}\n`;
        
        const cursor = editor.getCursor();
        
        if (cursor && typeof cursor.line === 'number' && typeof cursor.ch === 'number') {
            editor.replaceRange(content, cursor);
            return;
        }

        const lastLine = editor.lastLine();
        const lastLineContent = editor.getLine(lastLine);
        const extraNewline = lastLineContent.trim() ? '\n' : '';
        
        editor.replaceRange(extraNewline + content, {
            line: lastLine,
            ch: lastLineContent.length
        });
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