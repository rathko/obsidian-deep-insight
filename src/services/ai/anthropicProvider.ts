import { requestUrl } from 'obsidian';
import { AIProvider, AIProviderConfig, AIMessage, AIResponse } from './types';
import { ANTHROPIC_API_CONSTANTS } from '../../constants';

export class AnthropicProvider implements AIProvider {
    private apiKey: string = '';
    private model: string = '';
    private maxTokens: number = ANTHROPIC_API_CONSTANTS.DEFAULT_MAX_TOKENS;

    initialize(config: AIProviderConfig): void {
        this.apiKey = config.apiKey;
        this.model = config.model;
        if (config.maxTokens) {
            this.maxTokens = config.maxTokens;
        }
    }

    async generateResponse(messages: AIMessage[]): Promise<AIResponse> {
        if (!this.apiKey) {
            throw new Error('API key not set');
        }

        const response = await requestUrl({
            url: ANTHROPIC_API_CONSTANTS.BASE_URL,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKey,
                'anthropic-version': ANTHROPIC_API_CONSTANTS.API_VERSION,
                'accept': 'application/json'
            },
            body: JSON.stringify({
                model: this.model,
                max_tokens: this.maxTokens,
                system: messages.find(m => m.role === 'system')?.content || '',
                messages: messages
                    .filter(m => m.role === 'user')
                    .map(m => ({
                        role: m.role,
                        content: m.content
                    }))
            }),
            throw: false
        });

        const data = await this.parseResponse(response);
        
        return {
            content: data.content[0].text,
            usage: {
                inputTokens: this.estimateTokens(messages.map(m => m.content).join('')),
                outputTokens: this.estimateTokens(data.content[0].text)
            }
        };
    }

    private async parseResponse(response: any): Promise<any> {
        if (response.status !== 200) {
            let errorMessage: string;
            try {
                const data = JSON.parse(response.text);
                errorMessage = data.error?.message || `API request failed with status ${response.status}`;
            } catch {
                errorMessage = `API request failed with status ${response.status}`;
            }
            throw new Error(errorMessage);
        }

        try {
            const data = JSON.parse(response.text);
            if (!data.content?.[0]?.text) {
                throw new Error('Invalid API response format');
            }
            return data;
        } catch {
            throw new Error('Failed to parse API response');
        }
    }

    estimateTokens(text: string): number {
        return Math.ceil(text.length / ANTHROPIC_API_CONSTANTS.CHARS_PER_TOKEN);
    }
}
