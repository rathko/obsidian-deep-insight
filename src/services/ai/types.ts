export interface AIMessage {
    role: 'user' | 'system' | 'assistant';
    content: string;
}

export interface AIResponse {
    content: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
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
    getCosts(): {
        input: number;
        output: number;
        displayName: string;
    };
}export interface AIMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface AIUsage {
    inputTokens: number;
    outputTokens: number;
}

export interface AIResponse {
    content: string;
    usage: AIUsage;
}

export interface AIProviderConfig {
    apiKey: string;
    model: string;
    maxTokens?: number;
}

export interface AIProvider {
    initialize(config: AIProviderConfig): void;
    generateResponse(messages: AIMessage[]): Promise<AIResponse>;
    estimateTokens(text: string): number;
}
export interface ModelCosts {
    input: number;
    output: number;
    displayName: string;
}

export interface AIProvider {
    getCosts(): ModelCosts;
}
