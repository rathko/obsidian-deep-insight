export type AIProvider = 'anthropic' | 'openai' | 'ollama' | 'claude-code';

export type AIModel = string;

export interface AIProviderSettings {
    type: AIProvider;
    apiKey: string;
    model: AIModel;
}

export interface DeepInsightAISettings {
    provider: AIProviderSettings;
    systemPromptPath: string;
    userPromptPath: string;
    excludeFolders: string[];
    maxTokensPerRequest: number;
    defaultSystemPrompt: string;
    defaultUserPrompt: string;
    retryAttempts: number;
    showCostSummary: boolean;
    includeUserContext: boolean;
    testMode: {
        enabled: boolean;
        maxFiles?: number;
        maxTokens?: number;
    };
    showAdvancedSettings: boolean;
    patterns: {
        enabled: boolean;
        folderPath: string;
        installed: boolean;
    };
}
