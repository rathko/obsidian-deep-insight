export class InputValidator {
    static validateApiKey(apiKey: string, provider: string): boolean {
        if (!apiKey) return false;
        
        if (provider === 'anthropic') {
            return apiKey.startsWith('sk-') && apiKey.length > 20;
        }
        
        if (provider === 'openai') {
            return apiKey.startsWith('sk-') && apiKey.length > 30;
        }
        
        return false;
    }

    static validateModelConfig(model: string, config: ModelConfig): boolean {
        return !!(
            config &&
            typeof config.maxTokens === 'number' &&
            typeof config.inputCostPer1k === 'number' &&
            typeof config.outputCostPer1k === 'number' &&
            typeof config.contextWindow === 'number'
        );
    }
}
import { AIProvider } from '../services/ai/types';

export class InputValidator {
    static validateApiKey(apiKey: string, providerType: string): boolean {
        if (!apiKey) {
            return false;
        }

        switch (providerType.toLowerCase()) {
            case 'anthropic':
                return apiKey.startsWith('sk-');
            case 'openai':
                return apiKey.startsWith('sk-');
            default:
                return false;
        }
    }
}
