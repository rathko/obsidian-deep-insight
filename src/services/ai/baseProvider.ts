import { AIProvider, AIMessage, AIResponse, AIProviderConfig, ModelConfig } from './types';
import { MODEL_CONFIGS } from '../../constants';
import { NetworkManager } from '../network/networkManager';

export abstract class BaseAIProvider implements AIProvider {
    protected apiKey: string = '';
    protected model: string = '';
    protected maxOutputTokens!: number;
    protected networkManager: NetworkManager;

    constructor() {
        this.networkManager = NetworkManager.getInstance();
    }

    abstract initialize(config: AIProviderConfig): void;
    abstract generateResponse(messages: AIMessage[]): Promise<AIResponse>;
    abstract estimateTokens(text: string): number;

    getCosts(): ModelConfig {
        const costs = MODEL_CONFIGS[this.model as keyof typeof MODEL_CONFIGS];
        if (!costs) {
            throw new Error(`Cost information not available for model: ${this.model}`);
        }
        return costs;
    }
}
