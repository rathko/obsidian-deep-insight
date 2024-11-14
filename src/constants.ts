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

export const API_CONSTANTS = {
    anthropic: {
        BASE_URL: 'https://api.anthropic.com/v1/messages',
        API_VERSION: '2023-06-01',
        DEFAULT_MAX_TOKENS: 8192,
        RESPONSE_TOKENS: 10000,
        CHARS_PER_TOKEN: 4
    },
    openai: {
        BASE_URL: 'https://api.openai.com/v1/chat/completions',
        DEFAULT_MAX_TOKENS: 4096,
        RESPONSE_TOKENS: 8192,
        CHARS_PER_TOKEN: 4
    }
} as const;

export const TOKEN_LIMITS = {
    SYSTEM_PROMPT: 1000,
    USER_PROMPT: 500,
    RESPONSE: 10000,
    XML_TAGS: 200,
    CHUNK_SIZE: 100000
} as const;

export const UI_MESSAGES = {
    PROCESSING: [
        '🧠 Analyzing your notes...',
        '💫 Extracting insights...',
        '🎯 Connecting ideas...',
        '✨ Processing content...',
        '🔮 Synthesizing information...'
    ],
    SUCCESS: '✨ Analysis complete!',
    COMBINING: '🎭 Combining multiple sections...',
    NETWORK_ERROR: '📡 Connection error: Please check your network',
    API_ERROR: '❌ API error: Please check your settings',
    RATE_LIMIT: '⚠️ Rate limit reached: Please try again later'
} as const;

