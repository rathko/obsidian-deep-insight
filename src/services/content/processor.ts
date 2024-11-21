import { TFile, Vault } from 'obsidian';
import { DeepInsightAISettings } from '../../types';
import { TestModeManager } from '../test/testManager';

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

        const chunker = new ContentChunker(this.settings.maxTokensPerRequest);
        return chunker.createChunks(files, this.vault);
    }

    private getFilteredFiles(): TFile[] {
        return this.vault.getMarkdownFiles()
            .filter((file: TFile) => !this.settings.excludeFolders
                .some(folder => file.path.toLowerCase().startsWith(folder.toLowerCase())));
    }
}

class ContentChunker {
    private static readonly TOKEN_OVERHEAD = {
        SYSTEM_PROMPT: 1000,
        USER_PROMPT: 500,
        RESPONSE: 10000,
        XML_TAGS: 200
    };

    constructor(
        private readonly maxTokensPerRequest: number,
        private readonly charsPerToken: number = 4
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
        const overheadTokens = Object.values(ContentChunker.TOKEN_OVERHEAD)
            .reduce((sum, tokens) => sum + tokens, 0);
        return this.maxTokensPerRequest - overheadTokens;
    }

    private estimateTokens(text: string): number {
        return Math.ceil(text.length / this.charsPerToken);
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
        const maxChars = maxTokens * this.charsPerToken;

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