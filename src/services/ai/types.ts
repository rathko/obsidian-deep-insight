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
    estimateTokens(text: string): number;
    getCosts(): ModelCosts;
}export interface AIMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface AIUsage {
    inputTokens: number;
    outputTokens: number;
}

export interface ModelCosts {
    input: number;
    output: number;
    displayName: string;
}

export interface ModelConfig {
    maxTokens: number;
    inputCostPer1k: number;
    outputCostPer1k: number;
    displayName: string;
    contextWindow: number;
}
