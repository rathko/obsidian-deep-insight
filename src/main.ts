import { Plugin, TAbstractFile, MarkdownView, Notice, Editor } from 'obsidian';
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
import { Pattern, ProcessingOptions } from './services/patterns/types';
import { ContextMenuManager } from './services/patterns/contextMenuManager';

export default class DeepInsightAI extends Plugin {
    public provider?: AIProvider;
    settings!: DeepInsightAISettings;
    private networkManager!: NetworkManager;
    private costTracker?: CostTracker;
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
            id: 'run-pattern-globally',
            name: 'Run Pattern on Vault',
            callback: () => this.handleGlobalPatternCommand(),
        });
    
        this.addCommand({
            id: 'generate-insights',
            name: 'Generate Insights and Tasks from Notes',
            editorCallback: () => this.generateTasks(),
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

    async generateTasks(): Promise<void> {
        const editor = this.validateExecutionPrerequisites();
        if (!editor) {
            return;
        }

        this.isProcessing = true;

        try {
            if (this.costTracker) {
                this.costTracker.reset();
            }

            const { systemPrompt, userPrompt } = await this.getPrompts();
            const contentProcessor = new ContentProcessor(
                this.app.vault,
                this.settings,
                TestModeManager.getInstance()
            );

            const chunks = await contentProcessor.processContent();
            await this.handleCostEstimate(chunks.length);
            
            const options: ProcessingOptions = {
                systemPrompt,
                userPrompt
            };

            const result = chunks.length === 1 
                ? await this.processChunk(chunks[0].content, options)
                : await this.processChunks(chunks, options);

            await this.insertContent(editor, result);
            this.showSuccessMessage();
        } catch (error) {
            ErrorHandler.handle(error);
        } finally {
            this.isProcessing = false;
        }
    }

    public validateExecutionPrerequisites(editor?: Editor): Editor | null {
        if (this.isProcessing) {
            new Notice(UI_MESSAGES.ALREADY_PROCESSING);
            return null;
        }
    
        if (!InputValidator.validateApiKey(
            this.settings.provider.apiKey, 
            this.settings.provider.type
        )) {
            new Notice(`Please set a valid ${this.settings.provider.type} API key in settings`);
            return null;
        }
    
        const activeEditor = editor || this.getActiveEditor();
        if (!activeEditor) {
            new Notice(UI_MESSAGES.EDITOR_NOTE);
            return null;
        }
    
        return activeEditor;
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
                this.settings.defaultSystemPrompt,
                true
            ),
            PromptManager.loadPromptTemplate(
                this.app.vault,
                this.settings.userPromptPath,
                this.settings.defaultUserPrompt,
                this.settings.includeUserContext
            )
        ]);
    
        return { systemPrompt, userPrompt };
    }

    public async processChunk(
        content: string, 
        options: ProcessingOptions
    ): Promise<string> {
        if (!this.provider) {
            throw new DeepInsightError({
                type: 'PROCESSING_ERROR',
                message: 'AI provider not initialized'
            });
        }

        const promptContent = options.isCombining 
            ? content 
            : `Notes Content:\n${content}`;

        const messages: AIMessage[] = [
            { role: 'system', content: options.systemPrompt },
            { 
                role: 'user', 
                content: this.settings.includeUserContext 
                    ? `${options.userPrompt}\n\n${promptContent}`
                    : promptContent
            }
        ];

        const response = await this.provider.generateResponse(messages);
        
        if (this.costTracker && response.usage) {
            this.costTracker.addUsage(response.usage);
        }

        return response.content;
    }


    public async processChunks(
        chunks: { content: string; size: number }[],
        options: ProcessingOptions
    ): Promise<string> {
        const results: string[] = [];

        for (let i = 0; i < chunks.length; i++) {
            const randomMessage = UI_MESSAGES.PROCESSING[
                Math.floor(Math.random() * UI_MESSAGES.PROCESSING.length)
            ];
            
            new Notice(`${randomMessage} (${i + 1}/${chunks.length})`);
            const result = await this.processChunk(chunks[i].content, options);
            results.push(result);
        }

        new Notice(UI_MESSAGES.COMBINING);
        const combinedContent = results.join('\n\n=== Next Section ===\n\n');
        
        return this.processChunk(combinedContent, {
            ...options,
            isCombining: true
        });
    }

    async insertContent(editor: Editor, content: string): Promise<void> {
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

    showSuccessMessage(): void {
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
        const editor = this.validateExecutionPrerequisites();
        if (!editor) {
            return;
        }

        try {
            if (this.costTracker) {
                this.costTracker.reset();
            }

            const options: ProcessingOptions = {
                systemPrompt: pattern.system || this.settings.defaultSystemPrompt,
                userPrompt: this.settings.defaultUserPrompt
            };

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
                ? await this.processChunk(chunks[0].content, options)
                : await this.processChunks(chunks, options);

            await this.insertContent(editor, result);
            this.showSuccessMessage();
        } catch (error) {
            ErrorHandler.handle(error);
        }
    }

    private getActiveEditor(): Editor | null {
        if (this.lastActiveEditor) {
            return this.lastActiveEditor;
        }
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        return view?.editor || null;
    }

    private async handleGlobalPatternCommand(): Promise<void> {
        const editor = this.validateExecutionPrerequisites();
        if (!editor) {
            return;
        }

        const patterns = await this.loadAvailablePatterns();
        if (!patterns.length) {
            return;
        }

        new PatternSelectionModal(
            this.app,
            patterns,
            (pattern) => this.executeGlobalPattern(pattern, editor)
        ).open();
    }

    private async loadAvailablePatterns(): Promise<Pattern[]> {
        await this.patternManager.loadPatterns();
        const patterns = this.patternManager.getAllPatterns();
        
        if (!patterns.length) {
            new Notice('No patterns found. Please install patterns first.');
        }
        
        return patterns;
    }

    private async executeGlobalPattern(pattern: Pattern, editor: Editor): Promise<void> {
        const contentProcessor = new ContentProcessor(
            this.app.vault,
            {
                ...this.settings,
                excludeFolders: []
            },
            TestModeManager.getInstance()
        );

        await this.patternManager.executePatternOnVault(
            pattern,
            editor,
            this,
            contentProcessor
        );
    }
}