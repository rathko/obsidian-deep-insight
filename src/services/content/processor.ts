import { TAbstractFile, TFile, TFolder, Vault } from 'obsidian';
import { DeepInsightAISettings } from '../../types';
import { TestModeManager } from '../test/testManager';
import { TOKEN_LIMITS, MODEL_CONFIGS } from '../../constants';

// src/services/content/processor.ts

export class ContentProcessor {
    constructor(
        private vault: Vault,
        private settings: DeepInsightAISettings,
        private testManager: TestModeManager
    ) {}

    async processContent(target?: TAbstractFile): Promise<{ content: string; size: number }[]> {
        const files = target 
            ? await this.getTargetFiles(target)
            : this.getFilteredFiles();

        const processableFiles = this.testManager.applyTestLimits(
            files,
            this.settings
        );

        const chunker = new ContentChunker(
            this.settings.maxTokensPerRequest,
            MODEL_CONFIGS[this.settings.provider.model].contextWindow
        );
        return chunker.createChunks(processableFiles, this.vault);
    }

    private async getTargetFiles(target: TAbstractFile): Promise<TFile[]> {
        if (target instanceof TFile) {
            return [target];
        }
        
        if (target instanceof TFolder) {
            return await this.getAllFilesInFolder(target);
        }
        
        return [];
    }

    private async getAllFilesInFolder(folder: TFolder): Promise<TFile[]> {
        const files: TFile[] = [];
        
        for (const child of folder.children) {
            if (child instanceof TFile && child.extension === 'md') {
                files.push(child);
            } else if (child instanceof TFolder) {
                files.push(...await this.getAllFilesInFolder(child));
            }
        }
        
        return files;
    }

    private getFilteredFiles(): TFile[] {
        return this.vault.getMarkdownFiles()
            .filter((file: TFile) => !this.settings.excludeFolders
                .some(folder => file.path.toLowerCase().startsWith(folder.toLowerCase())));
    }
}

export class ContentChunker {
    private static readonly CHARS_PER_TOKEN = 4;
    private documentIndex = 1;

    constructor(
        private readonly maxTokensPerRequest: number,
        private readonly modelContextWindow: number
    ) {}

    async createChunks(files: TFile[], vault: Vault): Promise<Array<{ content: string; size: number }>> {
        const maxContentTokens = this.calculateMaxContentTokens();
        const chunks: Array<{ content: string; size: number }> = [];
        let currentFiles: Array<{ file: TFile; content: string }> = [];
        let currentTokens = 0;

        for (const file of files) {
            const content = await vault.cachedRead(file);
            const tokens = this.estimateTokens(content);

            if (currentTokens + tokens > maxContentTokens) {
                if (currentFiles.length > 0) {
                    chunks.push(this.createChunk(currentFiles));
                    currentFiles = [];
                    currentTokens = 0;
                    this.resetDocumentIndex();
                }
                
                if (tokens > maxContentTokens) {
                    if (currentFiles.length > 0) {
                        chunks.push(this.createChunk(currentFiles));
                        currentFiles = [];
                        currentTokens = 0;
                        this.resetDocumentIndex();
                    }
                    chunks.push(...this.splitLargeContent(file, content.trim(), maxContentTokens));
                    continue;
                }
            }

            currentFiles.push({ file, content: content.trim() });
            currentTokens += tokens;
        }

        if (currentFiles.length > 0) {
            chunks.push(this.createChunk(currentFiles));
        }

        return chunks;
    }

    private calculateMaxContentTokens(): number {
        const overheadTokens = TOKEN_LIMITS.SYSTEM_PROMPT +
            TOKEN_LIMITS.USER_PROMPT +
            TOKEN_LIMITS.RESPONSE +
            TOKEN_LIMITS.XML_TAGS;

        const maxAllowedTokens = Math.min(this.maxTokensPerRequest, this.modelContextWindow);
        
        return Math.min(maxAllowedTokens - overheadTokens, TOKEN_LIMITS.CHUNK_SIZE);
    }

    private createChunk(files: Array<{ file: TFile; content: string }>): { content: string; size: number } {
        const content = this.formatToXML(files);
        return {
            content,
            size: this.estimateTokens(content)
        };
    }

    private formatCreationDate(timestamp: number): string {
        return new Date(timestamp).toISOString().split('T')[0];
    }

    private formatToXML(files: Array<{ file: TFile; content: string }>): string {
        const documents = files
            .map(({ file, content }) => this.createDocumentXML(file, content))
            .join('\n');
        return `<documents>\n${documents}\n</documents>`;
    }

    private createDocumentXML(file: TFile, content: string): string {
        const creationDate = this.formatCreationDate(file.stat.ctime);
        const modifiedDate = this.formatCreationDate(file.stat.mtime);
        
        return `<document index="${this.documentIndex++}">
    <source>${file.path}</source>
    <created>${creationDate}</created>
    <modified>${modifiedDate}</modified>
    <metadata>
        <folder>${file.parent?.path || ''}</folder>
        <filename>${file.name}</filename>
        <tags>${this.extractTags(content)}</tags>
    </metadata>
    <document_content>
${content}
    </document_content>
</document>`;
    }

    private extractTags(content: string): string {
        const tagRegex = /#[^\s#]+/g;
        const tags = content.match(tagRegex) || [];
        return tags.join(' ');
    }

    private splitLargeContent(file: TFile, content: string, maxTokens: number): Array<{ content: string; size: number }> {
        const chunks: Array<{ content: string; size: number }> = [];
        let remaining = content;
        const maxChars = maxTokens * ContentChunker.CHARS_PER_TOKEN;

        while (remaining.length > 0) {
            const chunk = remaining.slice(0, maxChars);
            remaining = remaining.slice(maxChars);

            if (chunk.length > 0) {
                chunks.push(this.createChunk([{ file, content: chunk }]));
            }
        }

        return chunks;
    }

    private estimateTokens(text: string): number {
        return Math.ceil(text.length / ContentChunker.CHARS_PER_TOKEN);
    }

    private resetDocumentIndex(): void {
        this.documentIndex = 1;
    }
}