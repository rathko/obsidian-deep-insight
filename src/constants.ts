import { DEFAULT_PROMPTS } from './defaultPrompts';
import { DeepInsightAISettings } from './types';

export const DEFAULT_SETTINGS: DeepInsightAISettings = {
    apiKey: '',
    model: 'claude-3-5-sonnet-latest',
    systemPromptPath: '',
    userPromptPath: '',
    combinationPromptPath: '',
    excludeFolders: ['templates', 'archive'],
    maxTokensPerRequest: 90000,
    insertPosition: 'cursor',
    defaultSystemPrompt: DEFAULT_PROMPTS.system,
    defaultUserPrompt: DEFAULT_PROMPTS.user,
    defaultCombinationPrompt: DEFAULT_PROMPTS.combination,
    retryAttempts: 2,
    showCostSummary: true,
    testMode: {
        enabled: false,
        maxFiles: 5,
        maxTokens: 1000
    },
    showAdvancedSettings: false,
};