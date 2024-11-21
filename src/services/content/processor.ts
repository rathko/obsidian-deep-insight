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

class ContentChunker {
    private static readonly CHARS_PER_TOKEN = 4;

    constructor(
        private readonly maxTokensPerRequest: number,
        private readonly modelContextWindow: number
    ) {}

    async createChunks(files: TFile[], vault: Vault): Promise<Array<{ content: string; size: number }>> {
        const maxContentTokens = this.calculateMaxContentTokens();
        const chunks: Array<{ content: string; size: number }> = [];
        let currentChunk = '';
        let currentTokens = 0;

        for (const file of files) {
            const content = await vault.cachedRead(file);
            const tokens = this.estimateTokens(content);

            if (currentTokens + tokens > maxContentTokens) {
                if (currentChunk) {
                    chunks.push(this.createChunk(currentChunk));
                    currentChunk = '';
                    currentTokens = 0;
                }
                
                if (tokens > maxContentTokens) {
                    chunks.push(...this.splitLargeContent(content, maxContentTokens));
                    continue;
                }
            }

            currentChunk += (currentChunk ? '\n\n' : '') + `File: ${file.path}\n${content}`;
            currentTokens += tokens;
        }

        if (currentChunk) {
            chunks.push(this.createChunk(currentChunk));
        }

        return chunks;
    }

    private calculateMaxContentTokens(): number {
        const overheadTokens = TOKEN_LIMITS.SYSTEM_PROMPT +
            TOKEN_LIMITS.USER_PROMPT +
            TOKEN_LIMITS.RESPONSE +
            TOKEN_LIMITS.XML_TAGS;

        // Use the smaller of maxTokensPerRequest or modelContextWindow
        const maxAllowedTokens = Math.min(this.maxTokensPerRequest, this.modelContextWindow);
        
        // Ensure we don't exceed the chunk size limit
        return Math.min(maxAllowedTokens - overheadTokens, TOKEN_LIMITS.CHUNK_SIZE);
    }

    private estimateTokens(text: string): number {
        return Math.ceil(text.length / ContentChunker.CHARS_PER_TOKEN);
    }

    private createChunk(content: string): { content: string; size: number } {
        return {
            content,
            size: this.estimateTokens(content)
        };
    }

    private splitLargeContent(content: string, maxTokens: number): Array<{ content: string; size: number }> {
        const chunks: Array<{ content: string; size: number }> = [];
        let remaining = content;
        const maxChars = maxTokens * ContentChunker.CHARS_PER_TOKEN;

        while (remaining.length > 0) {
            const chunk = remaining.slice(0, maxChars);
            remaining = remaining.slice(maxChars);

            if (chunk.length > 0) {
                chunks.push(this.createChunk(chunk));
            }
        }

        return chunks;
    }
}