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
    maxTokens?: number;
}

export interface DeepInsightAISettings {
    provider: AIProviderSettings;
    systemPromptPath: string;
    userPromptPath: string;
    combinationPromptPath: string;
    excludeFolders: string[];
    maxTokensPerRequest: number;
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
