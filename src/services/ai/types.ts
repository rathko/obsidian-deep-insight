export interface AIMessage {
    role: 'user' | 'system' | 'assistant';
    content: string;
}

export interface AIResponse {
    content: string;
    usage?: AIUsage
}

export interface AIProviderConfig {
    apiKey: string;
    model: string;
    maxTokens?: number;
    temperature?: number;
}

export interface AIProvider {
    initialize(config: AIProviderConfig): void;
    generateResponse(messages: AIMessage[]): Promise<AIResponse>;
    generateStream?(messages: AIMessage[], onChunk: (text: string) => void): Promise<AIResponse>;
    estimateTokens(text: string): number;
    getCosts(): ModelConfig;
}

export interface AIUsage {
    inputTokens: number;
    outputTokens: number;
}

export interface ModelConfig {
    inputCostPer1k: number;
    outputCostPer1k: number;
    displayName: string;
    contextWindow: number;
}
