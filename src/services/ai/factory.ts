import { AIProvider } from './types';
import { AnthropicProvider } from './anthropic';
import { OpenAIProvider } from './openai';
import { OllamaProvider } from './ollama';
import { ClaudeCodeProvider } from './claudeCode';

export class AIProviderFactory {
    private static providers: Record<string, AIProvider> = {
        anthropic: new AnthropicProvider(),
        openai: new OpenAIProvider(),
        ollama: new OllamaProvider(),
        'claude-code': new ClaudeCodeProvider()
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


