import { AI_MODELS } from "./constants";

export type AIProvider = 'anthropic' | 'openai';

export type AnthropicModel = keyof typeof AI_MODELS.anthropic;
export type OpenAIModel = keyof typeof AI_MODELS.openai;
export type AIModel = AnthropicModel | OpenAIModel;

export type ErrorType = 'API' | 'File' | 'Settings' | 'Processing' | 'Network';

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
