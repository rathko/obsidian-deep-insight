import { RequestUrlResponse } from 'obsidian';
import { AIMessage, AIResponse, AIProviderConfig, ModelConfig } from './types';
import { API_CONSTANTS } from '../../constants';
import { BaseAIProvider } from './baseProvider';

export class OpenAIProvider extends BaseAIProvider {

    constructor() {
        super();
    }

    initialize(config: AIProviderConfig): void {
        this.apiKey = config.apiKey;
        this.model = config.model;
        this.maxOutputTokens = API_CONSTANTS.openai.MAX_OUTPUT_TOKENS;
    }

    async generateResponse(messages: AIMessage[]): Promise<AIResponse> {
        const response = await this.networkManager.makeRequest({
            url: API_CONSTANTS.openai.BASE_URL,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: this.model,
                messages: messages,
                max_tokens: this.maxOutputTokens
            }),
            throw: false
        });

        return this.parseResponse(response);
    }

    private parseResponse(response: RequestUrlResponse): AIResponse {
        if (response.status !== 200) {
            const data = JSON.parse(response.text);
            throw new Error(data.error?.message || `API request failed with status ${response.status}`);
        }
    
        const data = JSON.parse(response.text);
        if (!data.choices?.[0]?.message?.content) {
            throw new Error('Invalid API response format');
        }
    
        return {
            content: data.choices[0].message.content,
            usage: data.usage ? {
                inputTokens: data.usage.prompt_tokens,
                outputTokens: data.usage.completion_tokens
            } : undefined
        };
    }

    estimateTokens(text: string): number {
        return Math.ceil(text.length / API_CONSTANTS.openai.CHARS_PER_TOKEN);
    }
}