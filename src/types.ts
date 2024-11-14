export type InsertPosition = 'top' | 'bottom' | 'cursor';

export type AIProvider = 'anthropic' | 'openai';

export const AI_MODELS = {
    anthropic: {
        'claude-3-5-sonnet-latest': 'Claude 3.5 Sonnet (Balanced)',
        'claude-3-5-haiku-latest': 'Claude 3.5 Haiku (Fast)'
    },
    openai: {
        'gpt-4-turbo-preview': 'GPT-4 Turbo',
        'gpt-4': 'GPT-4',
        'gpt-3.5-turbo': 'GPT-3.5 Turbo'
    }
} as const;

export type AnthropicModel = keyof typeof AI_MODELS.anthropic;
export type OpenAIModel = keyof typeof AI_MODELS.openai;
export type AIModel = AnthropicModel | OpenAIModel;

export type ErrorType = 'API' | 'File' | 'Settings' | 'Processing' | 'Network';

export interface AIProviderSettings {
    type: AIProvider;
    apiKey: string;
    model: AIModel;
    maxTokens?: number;
}

export interface DeepInsightAISettings {
    provider: AIProviderSettings;
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
