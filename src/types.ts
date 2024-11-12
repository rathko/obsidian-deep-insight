export type InsertPosition = 'top' | 'bottom' | 'cursor';

export type AnthropicModel = 'claude-3-5-sonnet-latest' | 'claude-3-5-haiku-latest';

export type ErrorType = 'API' | 'File' | 'Settings' | 'Processing' | 'Network';

export interface DeepInsightAISettings {
    apiKey: string;
    model: AnthropicModel;
    systemPromptPath: string;
    userPromptPath: string;
    combinationPromptPath: string;
    excludeFolders: string[];
    maxTokensPerRequest: number;
    insertPosition: InsertPosition;
    defaultSystemPrompt: string;
    defaultUserPrompt: string;
    defaultCombinationPrompt: string;
    retryAttempts: number;
    showCostSummary: boolean;
    testMode: {
        enabled: boolean;
        maxFiles?: number;
        maxTokens?: number;
    };
    showAdvancedSettings: boolean;
}