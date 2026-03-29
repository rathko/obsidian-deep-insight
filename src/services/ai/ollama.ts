import { RequestUrlResponse } from 'obsidian';
import { AIMessage, AIResponse, AIProviderConfig, ModelConfig } from './types';
import { BaseAIProvider } from './baseProvider';
import { StreamParser } from './streamParser';

const OLLAMA_DEFAULTS = {
    BASE_URL: 'http://localhost:11434/api/chat',
    CHARS_PER_TOKEN: 4,
    MAX_OUTPUT_TOKENS: 4096,
} as const;

export class OllamaProvider extends BaseAIProvider {
    initialize(config: AIProviderConfig): void {
        this.apiKey = config.apiKey || '';
        this.model = config.model || 'llama3';
        this.maxOutputTokens = config.maxTokens || OLLAMA_DEFAULTS.MAX_OUTPUT_TOKENS;
    }

    async generateResponse(messages: AIMessage[]): Promise<AIResponse> {
        const response = await this.networkManager.makeRequest({
            url: OLLAMA_DEFAULTS.BASE_URL,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: this.model,
                messages: messages.map(m => ({ role: m.role, content: m.content })),
                stream: false
            }),
            throw: false
        });

        return this.parseResponse(response);
    }

    private parseResponse(response: RequestUrlResponse): AIResponse {
        if (response.status !== 200) {
            throw new Error(`Ollama request failed with status ${response.status}`);
        }

        const data = JSON.parse(response.text);
        if (!data.message?.content) {
            throw new Error('Invalid Ollama response format');
        }

        return {
            content: data.message.content,
            usage: {
                inputTokens: data.prompt_eval_count || 0,
                outputTokens: data.eval_count || 0
            }
        };
    }

    async generateStream(messages: AIMessage[], onChunk: (text: string) => void): Promise<AIResponse> {
        const response = await fetch(OLLAMA_DEFAULTS.BASE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: this.model,
                messages: messages.map(m => ({ role: m.role, content: m.content })),
                stream: true
            })
        });

        if (!response.ok || !response.body) {
            throw new Error(`Ollama streaming request failed with status ${response.status}`);
        }

        return StreamParser.parseNDJSON(response.body, onChunk, 'ollama');
    }

    estimateTokens(text: string): number {
        return Math.ceil(text.length / OLLAMA_DEFAULTS.CHARS_PER_TOKEN);
    }

    getCosts(): ModelConfig {
        return {
            inputCostPer1k: 0,
            outputCostPer1k: 0,
            displayName: this.model,
            contextWindow: 128000
        };
    }
}
