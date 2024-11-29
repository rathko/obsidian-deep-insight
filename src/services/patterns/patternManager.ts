import { Vault, TFile, normalizePath, TFolder } from 'obsidian';
import { Pattern, PatternFile, PatternConfig } from './types';
import { createHash } from 'crypto';
import { BundledPatternsManager } from './bundledPatternsManager';

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
            throw new Error('Patterns folder not found or is not a folder');
        }
    
        this.patterns.clear();
        await this.scanPatterns(abstractFile);
    }

    private async scanPatterns(folder: TFolder): Promise<void> {
        for (const child of folder.children) {
            if (child instanceof TFolder) {
                const pattern = await this.processPatternFolder(child);
                if (pattern) {
                    this.patterns.set(pattern.id, pattern);
                }
            } else if (child instanceof TFile && child.extension === 'md') {
                const pattern = await this.processPatternFile(child);
                if (pattern) {
                    this.patterns.set(pattern.id, pattern);
                }
            }
        }
    }

    private async processPatternFolder(folder: TFolder): Promise<Pattern | null> {
        const children = folder.children;
        const systemFile = children.find(f => f instanceof TFile && f.name === 'system.md') as TFile;
        const userFile = children.find(f => f instanceof TFile && f.name === 'user.md') as TFile;

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

        return {
            id: file.path,
            name: `${file.parent?.name}/${file.basename}`,
            path: file.path,
            type: 'file',
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
}