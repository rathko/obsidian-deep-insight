export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}

export interface RequestMetadata {
    model: string;
    timestamp: number;
    duration: number;
    usage?: TokenUsage;
}

export interface ApiRequestOptions {
    maxRetries?: number;
    timeoutMs?: number;
    showNotification?: boolean;
}
