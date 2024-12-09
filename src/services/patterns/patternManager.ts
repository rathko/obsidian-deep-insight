import { Vault, TFile, normalizePath, TFolder, Editor, Notice } from 'obsidian';
import { Pattern, PatternFile, PatternConfig } from './types';
import { createHash } from 'crypto';
import { BundledPatternsManager } from './bundledPatternsManager';
import DeepInsightAI from 'src/main';
import { ContentProcessor } from '../content/processor';
import { DeepInsightError } from '../error/types';
import { CostTracker } from 'src/costTracker';

export class PatternManager {
    private static instance: PatternManager;
    private patterns: Map<string, Pattern> = new Map();
    
    private constructor(
        private vault: Vault,
        private config: PatternConfig
    ) {}

    static getInstance(vault: Vault, config: PatternConfig): PatternManager {
        if (!PatternManager.instance) {
            PatternManager.instance = new PatternManager(vault, config);
        }
        return PatternManager.instance;
    }

    async loadPatterns(): Promise<void> {
        if (!this.config.enabled) {
            return;
        }
    
        const abstractFile = this.vault.getAbstractFileByPath(this.config.patternsPath);
        if (!abstractFile || !(abstractFile instanceof TFolder)) {
            console.warn(`Patterns folder not found at path: ${this.config.patternsPath}`);
            return;
        }
    
        this.patterns.clear();
        await this.scanPatterns(abstractFile);
    }

    private async scanPatterns(folder: TFolder): Promise<void> {
        for (const child of folder.children) {
            try {
                if (child instanceof TFolder) {
                    const pattern = await this.processPatternFolder(child);
                    if (pattern) {
                        this.patterns.set(pattern.id, pattern);
                    }
                    // Also scan subfolders
                    await this.scanPatterns(child);
                } else if (child instanceof TFile && 
                          child.extension === 'md' && 
                          child.name.toLowerCase() !== 'system.md' && 
                          child.name.toLowerCase() !== 'user.md' &&
                          child.name.toLowerCase() !== 'readme.md') {
                    const pattern = await this.processPatternFile(child);
                    if (pattern) {
                        this.patterns.set(pattern.id, pattern);
                    }
                }
            } catch (error) {
                console.error(`Error loading pattern from ${child.path}:`, error);
            }
        }
    }

    private async processPatternFolder(folder: TFolder): Promise<Pattern | null> {
        const children = folder.children;
        const systemFile = children.find(f => f instanceof TFile && f.name === 'system.md') as TFile | undefined;
        const userFile = children.find(f => f instanceof TFile && f.name === 'user.md') as TFile | undefined;
    
        if (!systemFile && !userFile) {
            return null;
        }
    
        const pattern: Pattern = {
            id: folder.path,
            name: folder.name,
            path: folder.path,
            type: 'folder'
        };
    
        if (systemFile) {
            pattern.system = await this.vault.cachedRead(systemFile);
        }
        if (userFile) {
            pattern.user = await this.vault.cachedRead(userFile);
        }
    
        return pattern;
    }

    private async processPatternFile(file: TFile): Promise<Pattern | null> {
        if (file.name === 'system.md' || file.name === 'user.md') {
            return null;
        }

        if (file.parent) {
            const siblings = file.parent.children;
            if (siblings.some(f => f.name === 'system.md' || f.name === 'user.md')) {
                return null;
            }
        }

        // Treat single file patterns as folders with just a system prompt
        const name = file.basename;
        return {
            id: file.path,
            name: name,
            path: file.path,
            type: 'folder',  // Treat all patterns as folder type for consistent display
            system: await this.vault.cachedRead(file)
        };
    }

    getPattern(id: string): Pattern | undefined {
        return this.patterns.get(id);
    }

    getAllPatterns(): Pattern[] {
        return Array.from(this.patterns.values());
    }

    searchPatterns(query: string): Pattern[] {
        const lowerQuery = query.toLowerCase();
        return this.getAllPatterns().filter(pattern => 
            pattern.name.toLowerCase().includes(lowerQuery)
        );
    }

    private calculateHash(content: string): string {
        return createHash('md5').update(content).digest('hex');
    }

    async installPatterns(sourcePath: string, targetPath: string): Promise<void> {
        const normalizedTarget = normalizePath(targetPath);
        
        // Ensure target directory exists
        if (!await this.vault.adapter.exists(normalizedTarget)) {
            await this.vault.createFolder(normalizedTarget);
        }

        const existingFiles = new Map<string, PatternFile>();
        
        // Gather existing files
        await this.gatherExistingFiles(normalizedTarget, existingFiles);
        
        // Copy new patterns
        await this.copyPatterns(sourcePath, normalizedTarget, existingFiles);
    }

    private async gatherExistingFiles(
        path: string, 
        files: Map<string, PatternFile>
    ): Promise<void> {
        const items = await this.vault.adapter.list(path);
        
        for (const file of items.files) {
            if (file.endsWith('.md')) {
                const content = await this.vault.adapter.read(file);
                files.set(file, {
                    path: file,
                    content,
                    hash: this.calculateHash(content)
                });
            }
        }

        for (const dir of items.folders) {
            await this.gatherExistingFiles(dir, files);
        }
    }

    private async copyPatterns(
        sourcePath: string,
        targetPath: string,
        existingFiles: Map<string, PatternFile>
    ): Promise<void> {
        // Read bundled patterns
        const bundledPatterns = await this.readBundledPatterns();
        
        for (const [path, content] of bundledPatterns) {
            const targetFile = normalizePath(`${targetPath}/${path}`);
            const existing = existingFiles.get(targetFile);

            if (path.endsWith('user.md') && existing) {
                // For user.md files, only copy if unchanged from original
                if (this.calculateHash(existing.content) === this.calculateHash(content)) {
                    await this.vault.adapter.write(targetFile, content);
                }
            } else {
                // For all other files, always copy
                const targetDir = targetFile.substring(0, targetFile.lastIndexOf('/'));
                if (!await this.vault.adapter.exists(targetDir)) {
                    await this.vault.createFolder(targetDir);
                }
                await this.vault.adapter.write(targetFile, content);
            }
        }
    }

    private async readBundledPatterns(): Promise<Map<string, string>> {
        return BundledPatternsManager.getBundledPatterns();
    }

    async executePatternOnVault(
        pattern: Pattern, 
        editor: Editor,
        mainPlugin: DeepInsightAI,
        contentProcessor: ContentProcessor
    ): Promise<void> {
        if (!pattern || !editor) {
            throw new DeepInsightError({
                type: 'PATTERN_ERROR',
                message: 'Missing required parameters for pattern execution'
            });
        }
    
        const chunks = await contentProcessor.processContent();
        
        if (mainPlugin.settings.showCostSummary) {
            const costTracker = new CostTracker(mainPlugin.provider!);
            const estimate = costTracker.generateInitialCostEstimate(chunks.length);
            new Notice(estimate, 10000);
        }
    
        const options = {
            systemPrompt: pattern.system || mainPlugin.settings.defaultSystemPrompt,
            userPrompt: mainPlugin.settings.defaultUserPrompt
        };
    
        const result = chunks.length === 1 
            ? await mainPlugin.processChunk(chunks[0].content, options)
            : await mainPlugin.processChunks(chunks, options);
    
        await mainPlugin.insertContent(editor, result);
        mainPlugin.showSuccessMessage();
    }
}