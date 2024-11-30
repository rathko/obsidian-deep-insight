import { Plugin, TAbstractFile, MarkdownView, Notice, Editor, Menu, EventRef } from 'obsidian';
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
import { PatternSelectionModal } from './services/patterns/patternModal';
import { PatternManager } from './services/patterns/patternManager';
import { Pattern } from './services/patterns/types';
import { ContextMenuManager } from './services/patterns/contextMenuManager';

export default class DeepInsightAI extends Plugin {
    settings!: DeepInsightAISettings;
    private networkManager!: NetworkManager;
    private costTracker?: CostTracker;
    private provider?: AIProvider;
    private isProcessing = false;
    private patternManager!: PatternManager;
    private contextMenuManager!: ContextMenuManager;
    private lastActiveEditor: Editor | null = null;

    async onload(): Promise<void> {
        this.contextMenuManager = new ContextMenuManager(this);
        await this.loadSettings();
    
        this.networkManager = NetworkManager.getInstance();
        this.networkManager.initialize(this.settings);
        this.initializeProvider();
    
        this.addCommand({
            id: 'generate-insights',
            name: 'Generate Insights and Tasks from Notes',
            editorCallback: (editor: Editor) => this.generateTasks(editor),
        });
    
        this.patternManager = PatternManager.getInstance(this.app.vault, {
            enabled: this.settings.patterns.enabled,
            patternsPath: this.settings.patterns.folderPath,
        });
    
        this.addSettingTab(new DeepInsightAISettingTab(this.app, this));

        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (view?.editor) {
                    this.lastActiveEditor = view.editor;
                }
            })
        );

        this.registerEvent(
            this.app.workspace.on('editor-change', (editor) => {
                this.lastActiveEditor = editor;
            })
        );
    }
    
    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
        this.initializeProvider();
        this.updateContextMenu();
    }
    
    updateContextMenu(): void {
        if (this.settings.patterns.enabled) {
            this.registerContextMenu();
        } else {
            this.contextMenuManager.unregister();
        }
    }
    
    onunload(): void {
        if (this.contextMenuManager) {
            this.contextMenuManager.unregister();
        }
        this.lastActiveEditor = null;
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
        this.updateContextMenu();
    }
    

    private registerContextMenu(): void {
        this.contextMenuManager.register(async (file) => {
            await this.showPatternSelection(file);
        });
    }    
    
    private async showPatternSelection(file: TAbstractFile): Promise<void> {
        // Store the current active editor before showing pattern selection
        const currentView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (currentView?.editor) {
            this.lastActiveEditor = currentView.editor;
        }

        await this.patternManager.loadPatterns();
        const patterns = this.patternManager.getAllPatterns();
        
        if (patterns.length === 0) {
            new Notice('No patterns found. Please install patterns first.');
            return;
        }

        new PatternSelectionModal(
            this.app,
            patterns,
            async (pattern: Pattern) => {
                await this.runPattern(pattern, file);
            }
        ).open();
    }

    private async runPattern(pattern: Pattern, file: TAbstractFile): Promise<void> {
        // Try to use the last active editor first, then fall back to getting current active editor
        const editor = this.lastActiveEditor || this.getActiveEditor();
        if (!editor) {
            new Notice('No editor found. Please make sure you have a note open and a cursor position selected.');
            return;
        }

        try {
            const systemPrompt = pattern.system || this.settings.defaultSystemPrompt;
            const userPrompt = this.settings.defaultUserPrompt;
            
            const contentProcessor = new ContentProcessor(
                this.app.vault,
                {
                    ...this.settings,
                    excludeFolders: []
                },
                TestModeManager.getInstance()
            );

            const chunks = await contentProcessor.processContent(file);
            const result = chunks.length === 1 
                ? await this.processPatternChunk(chunks[0].content, systemPrompt, userPrompt) 
                : await this.processPatternChunks(chunks, systemPrompt, userPrompt);

            await this.insertTasks(editor, result);
            this.showSuccessMessage();
        } catch (error) {
            ErrorHandler.handle(error);
        }
    }

    private async processPatternChunk(
        content: string,
        systemPrompt: string,
        userPrompt: string,
        isCombining = false
    ): Promise<string> {
        if (!this.provider) {
            throw new DeepInsightError({
                type: 'PROCESSING_ERROR',
                message: 'AI provider not initialized'
            });
        }

        const promptContent = isCombining ? content : `Notes Content:\n${content}`;
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

    private async processPatternChunks(
        chunks: { content: string; size: number }[],
        systemPrompt: string,
        userPrompt: string
    ): Promise<string> {
        const results: string[] = [];

        for (let i = 0; i < chunks.length; i++) {
            const randomMessage = UI_MESSAGES.PROCESSING[
                Math.floor(Math.random() * UI_MESSAGES.PROCESSING.length)
            ];
            
            new Notice(`${randomMessage} (${i + 1}/${chunks.length})`);
            const result = await this.processPatternChunk(
                chunks[i].content,
                systemPrompt,
                userPrompt
            );
            results.push(result);
        }

        new Notice(UI_MESSAGES.COMBINING);
        const combinedContent = results.join('\n\n=== Next Section ===\n\n');
        
        return this.processPatternChunk(
            combinedContent,
            systemPrompt,
            userPrompt,
            true
        );
    }

    private getActiveEditor(): Editor | null {
        if (this.lastActiveEditor) {
            return this.lastActiveEditor;
        }
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        return view?.editor || null;
    }
}