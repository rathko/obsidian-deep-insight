import { RequestUrlResponse } from 'obsidian';
import { AIProvider, AIMessage, AIResponse, AIProviderConfig } from './types';
import { MODEL_CONFIGS, API_CONSTANTS } from '../../constants';
import { NetworkManager } from '../network/networkManager';

export class OpenAIProvider implements AIProvider {
    private apiKey: string = '';
    private model: string = '';
    private maxTokens: number = 4096;
    private networkManager: NetworkManager;

    private static readonly COSTS = {
        'gpt-4o': {
            input: MODEL_CONFIGS['gpt-4o'].inputCostPer1k / 1000,
            output: MODEL_CONFIGS['gpt-4o'].outputCostPer1k / 1000,
            displayName: 'GPT-4o'
        },
        'gpt-4o-mini': {
            input: MODEL_CONFIGS['gpt-4o-mini'].inputCostPer1k / 1000,
            output: MODEL_CONFIGS['gpt-4o-mini'].outputCostPer1k / 1000,
            displayName: 'GPT-4o mini'
        }
    };

    constructor() {
        this.networkManager = NetworkManager.getInstance();
    }

    initialize(config: AIProviderConfig): void {
        this.apiKey = config.apiKey;
        this.model = config.model;
        this.maxTokens = config.maxTokens ?? API_CONSTANTS.openai.DEFAULT_MAX_TOKENS;
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
                max_tokens: this.maxTokens
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

    getCosts(): { input: number; output: number; displayName: string } {
        const costs = OpenAIProvider.COSTS[this.model as keyof typeof OpenAIProvider.COSTS];
        if (!costs) {
            throw new Error(`Cost information not available for model: ${this.model}`);
        }
        return costs;
    }
}