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
}import { AIProvider } from './types';
import { AnthropicProvider } from './anthropicProvider';
import { OpenAIProvider } from './openaiProvider';

export class AIProviderFactory {
    private static providers: { [key: string]: AIProvider } = {
        'anthropic': new AnthropicProvider(),
        'openai': new OpenAIProvider()
    };

    static getProvider(type: string): AIProvider {
        const provider = this.providers[type];
        if (!provider) {
            throw new Error(`Unsupported AI provider type: ${type}`);
        }
        return provider;
    }
}
