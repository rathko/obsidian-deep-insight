import { RequestUrlResponse, requestUrl } from 'obsidian';
import { AIProvider, AIMessage, AIResponse, AIProviderConfig } from './types';
import { MODEL_CONFIGS } from 'src/constants';

export class OpenAIProvider implements AIProvider {
    private apiKey: string = '';
    private model: string = '';
    private maxTokens: number = 4096;

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

    initialize(config: AIProviderConfig): void {
        this.apiKey = config.apiKey;
        this.model = config.model;
        this.maxTokens = config.maxTokens ?? 4096;
    }

    async generateResponse(messages: AIMessage[]): Promise<AIResponse> {
        const response = await requestUrl({
            url: 'https://api.openai.com/v1/chat/completions',
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

    private async parseResponse(response: RequestUrlResponse): Promise<AIResponse> {
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
        // OpenAI uses tiktoken for accurate token counting
        // This is a simple approximation
        return Math.ceil(text.length / 4);
    }

    getCosts(): { input: number; output: number; displayName: string } {
        const costs = OpenAIProvider.COSTS[this.model as keyof typeof OpenAIProvider.COSTS];
        if (!costs) {
            throw new Error(`Cost information not available for model: ${this.model}`);
        }
        return costs;
    }
}
