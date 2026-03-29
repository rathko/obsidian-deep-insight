import { RequestUrlResponse } from 'obsidian';
import { AIMessage, AIResponse, AIProviderConfig, ModelConfig } from './types';
import { BaseAIProvider } from './baseProvider';

const CLAUDE_CODE_DEFAULTS = {
    BASE_URL: 'http://localhost:3456',
    CHARS_PER_TOKEN: 4,
    MAX_OUTPUT_TOKENS: 8192,
} as const;

export class ClaudeCodeProvider extends BaseAIProvider {
    private bridgeUrl: string = CLAUDE_CODE_DEFAULTS.BASE_URL;

    initialize(config: AIProviderConfig): void {
        this.apiKey = config.apiKey || '';
        this.model = config.model || 'claude-code';
        this.maxOutputTokens = config.maxTokens || CLAUDE_CODE_DEFAULTS.MAX_OUTPUT_TOKENS;
        if (this.apiKey) {
            this.bridgeUrl = this.apiKey;
        }
    }

    async generateResponse(messages: AIMessage[]): Promise<AIResponse> {
        const response = await this.networkManager.makeRequest({
            url: `${this.bridgeUrl}/chat`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: messages.map(m => ({ role: m.role, content: m.content }))
            }),
            throw: false
        });

        return this.parseResponse(response);
    }

    private parseResponse(response: RequestUrlResponse): AIResponse {
        if (response.status !== 200) {
            const errorText = response.text || `Bridge request failed with status ${response.status}`;
            throw new Error(errorText);
        }

        const data = JSON.parse(response.text);
        if (!data.content) {
            throw new Error('Invalid response from Claude Code bridge');
        }

        return {
            content: data.content,
            usage: data.usage ? {
                inputTokens: data.usage.inputTokens || 0,
                outputTokens: data.usage.outputTokens || 0
            } : undefined
        };
    }

    estimateTokens(text: string): number {
        return Math.ceil(text.length / CLAUDE_CODE_DEFAULTS.CHARS_PER_TOKEN);
    }

    getCosts(): ModelConfig {
        return {
            inputCostPer1k: 0,
            outputCostPer1k: 0,
            displayName: 'Claude Code (Local)',
            contextWindow: 200000
        };
    }
}
