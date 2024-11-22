import { TFile, Vault } from 'obsidian';
import { DeepInsightAISettings } from '../../types';
import { TestModeManager } from '../test/testManager';
import { TOKEN_LIMITS, MODEL_CONFIGS } from '../../constants';

export class ContentProcessor {
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

        const chunker = new ContentChunker(
            this.settings.maxTokensPerRequest,
            MODEL_CONFIGS[this.settings.provider.model].contextWindow
        );
        return chunker.createChunks(files, this.vault);
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
        let currentFiles: Array<{ path: string; content: string }> = [];
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
                    chunks.push(...this.splitLargeContent(file.path, content.trim(), maxContentTokens));
                    continue;
                }
            }

            currentFiles.push({ path: file.path, content: content.trim() });
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

    private createChunk(files: { path: string; content: string }[]): { content: string; size: number } {
        const content = this.formatToXML(files);
        return {
            content,
            size: this.estimateTokens(content)
        };
    }

    // Apply https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/long-context-tips
    // to both Anthropic and OpenAI
    private formatToXML(files: { path: string; content: string }[]): string {
        const documents = files
            .map(file => this.createDocumentXML(file.path, file.content))
            .join('\n');
        return `<documents>\n${documents}\n</documents>`;
    }

    private createDocumentXML(path: string, content: string): string {
        return `<document index="${this.documentIndex++}">
    <source>${path}</source>
    <document_content>
${content}
    </document_content>
</document>`;
    }

    private splitLargeContent(path: string, content: string, maxTokens: number): Array<{ content: string; size: number }> {
        const chunks: Array<{ content: string; size: number }> = [];
        let remaining = content;
        const maxChars = maxTokens * ContentChunker.CHARS_PER_TOKEN;

        while (remaining.length > 0) {
            const chunk = remaining.slice(0, maxChars);
            remaining = remaining.slice(maxChars);

            if (chunk.length > 0) {
                chunks.push(this.createChunk([{ path, content: chunk }]));
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