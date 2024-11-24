import { AIProvider } from './types';
import { AnthropicProvider } from './anthropic';
import { OpenAIProvider } from './openai';

export class AIProviderFactory {
    private static providers: Record<string, AIProvider> = {
        anthropic: new AnthropicProvider(),
        openai: new OpenAIProvider()
    };

    static getProvider(name: string): AIProvider {
        const provider = this.providers[name];
        if (!provider) {
            throw new Error(`AI provider '${name}' not found`);
        }
        return provider;
    }

    static registerProvider(name: string, provider: AIProvider): void {
        this.providers[name] = provider;
    }
}


