import { DEFAULT_PROMPTS } from './defaultPrompts';
import { DeepInsightAISettings } from './types';

export const DEFAULT_SETTINGS: DeepInsightAISettings = {
    provider: {
        type: 'anthropic',
        apiKey: '',
        model: 'claude-3-5-sonnet-latest'
    },
    systemPromptPath: '',
    userPromptPath: '',
    combinationPromptPath: '',
    excludeFolders: ['templates', 'archive'],
    maxTokensPerRequest: 90000,
    insertPosition: 'cursor',
    defaultSystemPrompt: DEFAULT_PROMPTS.system,
    defaultUserPrompt: DEFAULT_PROMPTS.user,
    defaultCombinationPrompt: DEFAULT_PROMPTS.combination,
    retryAttempts: 1,
    showCostSummary: true,
    testMode: {
        enabled: false,
        maxFiles: 5,
        maxTokens: 1000
    },
    showAdvancedSettings: false,
};

export const AI_MODELS = {
    anthropic: {
        'claude-3-5-sonnet-latest': 'Claude 3.5 Sonnet (Powerful)',
        'claude-3-5-haiku-latest': 'Claude 3.5 Haiku (Affordable)'
    },
    openai: {
        'gpt-4o': 'GPT-4o Flagship (Powerful)',
        'gpt-4o-mini': 'GPT-o mini Turbo (Affordable)'
    }
} as const;

export const ANTHROPIC_API_CONSTANTS = {
    BASE_URL: 'https://api.anthropic.com/v1/messages',
    API_VERSION: '2023-06-01',
    DEFAULT_MAX_TOKENS: 8192,
    RESPONSE_TOKENS: 10000,
    // Rough estimation: ~4 characters per token
    CHARS_PER_TOKEN: 4
} as const;

export const UI_MESSAGES = {
    PROCESSING: [
        '🧠 Diving deep into your notes...',
        '💫 Extracting pearls of wisdom...',
        '🎯 Connecting the dots in your notes...',
        '✨ Uncovering insights...',
        '🔮 Crystallizing your thoughts...'
    ],
    SUCCESS: '✨ Deep insights successfully crystallized.',
    COMBINING: '🎭 Harmonizing multiple perspectives...',
    NETWORK_ERROR: '📡 Network error: Please check your connection'
} as const;

