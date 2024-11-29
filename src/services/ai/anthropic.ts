import { RequestUrlResponse } from 'obsidian';
import { AIMessage, AIResponse, AIProviderConfig } from './types';
import { API_CONSTANTS } from '../../constants';
import { BaseAIProvider } from './baseProvider';

export class AnthropicProvider extends BaseAIProvider {
    initialize(config: AIProviderConfig): void {
        this.apiKey = config.apiKey;
        this.model = config.model;
        this.maxOutputTokens = API_CONSTANTS.anthropic.MAX_OUTPUT_TOKENS;
    }

    async generateResponse(messages: AIMessage[]): Promise<AIResponse> {
        const systemMessage = messages.find(m => m.role === 'system')?.content || '';
        
        const formattedMessages = messages
            .filter(m => m.role !== 'system')
            .map(m => ({
                role: m.role,
                content: m.content
            }));

        const response = await this.networkManager.makeRequest({
            url: API_CONSTANTS.anthropic.BASE_URL,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKey,
                'anthropic-version': API_CONSTANTS.anthropic.API_VERSION,
                'accept': 'application/json'
            },
            body: JSON.stringify({
                model: this.model,
                max_tokens: this.maxOutputTokens,
                messages: formattedMessages,
                system: systemMessage
            }),
            throw: false
        });

        return this.parseResponse(response);
    }

    private parseResponse(response: RequestUrlResponse): AIResponse {
        if (response.status !== 200) {
            const errorMessage = this.getErrorMessage(response);
            throw new Error(errorMessage);
        }
    
        const data = JSON.parse(response.text);
        if (!data.content?.[0]?.text) {
            throw new Error('Invalid API response format');
        }
    
        return {
            content: data.content[0].text,
            usage: data.usage ? {
                inputTokens: data.usage.input_tokens,
                outputTokens: data.usage.output_tokens
            } : undefined
        };
    }

    private getErrorMessage(response: RequestUrlResponse): string {
        try {
            const data = JSON.parse(response.text);
            return data.error?.message || `API request failed with status ${response.status}`;
        } catch {
            return `API request failed with status ${response.status}`;
        }
    }

    estimateTokens(text: string): number {
        return Math.ceil(text.length / API_CONSTANTS.anthropic.CHARS_PER_TOKEN);
    }
}