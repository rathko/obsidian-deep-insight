import { DEFAULT_PROMPTS } from './defaultPrompts';
import { DeepInsightAISettings } from './types';
import { ModelConfig } from './services/ai/types';

export const PATTERN_DEFAULTS = {
    DEFAULT_PATTERNS_FOLDER: 'Deep Insight Fabric Patterns',
    SYSTEM_PROMPT_FILE: 'system.md',
    USER_PROMPT_FILE: 'user.md',
} as const;

export const DEFAULT_SETTINGS: DeepInsightAISettings = {
    provider: {
        type: 'openai',
        apiKey: '',
        model: 'gpt-4o-mini'
    },
    systemPromptPath: '',
    userPromptPath: '',
    excludeFolders: ['templates', 'archive'],
    maxTokensPerRequest: 90000,
    defaultSystemPrompt: DEFAULT_PROMPTS.system,
    defaultUserPrompt: DEFAULT_PROMPTS.user,
    retryAttempts: 1,
    showCostSummary: true,
    includeUserContext: true,
    testMode: {
        enabled: false,
        maxFiles: 5,
        maxTokens: 1000
    },
    showAdvancedSettings: false,
    patterns: {
        enabled: false,
        folderPath: PATTERN_DEFAULTS.DEFAULT_PATTERNS_FOLDER,
        installed: false
    }
};

export const AI_MODELS = {
    anthropic: {
        'claude-3-5-haiku-latest': 'Claude 3.5 Haiku (Affordable)',
        'claude-3-5-sonnet-latest': 'Claude 3.5 Sonnet (Advanced)',
    },
    openai: {
        'gpt-4o-mini': 'GPT-4o mini (Affordable)',
        'gpt-4o': 'GPT-4o (Advanced)',
    }
} as const;

export const MODEL_CONFIGS: Record<string, ModelConfig> = {
    // Anthropic Models
    // https://www.anthropic.com/pricing#anthropic-api
    'claude-3-5-sonnet-latest': {
        inputCostPer1k: 3 / 1000,  
        outputCostPer1k: 15 / 1000, 
        displayName: 'Claude 3.5 Sonnet',
        contextWindow: 200000
    },
    'claude-3-5-haiku-latest': {
        inputCostPer1k: 1 / 1000,  
        outputCostPer1k: 5 / 1000, 
        displayName: 'Claude 3.5 Haiku',
        contextWindow: 200000
    },
    
    // OpenAI Models
    // https://openai.com/api/pricing/
    'gpt-4o': {
        inputCostPer1k: 2.5 / 1000,
        outputCostPer1k: 10 / 1000,
        displayName: 'GPT-4o',
        contextWindow: 128000
    },
    'gpt-4o-mini': {
        inputCostPer1k: 0.150 / 1000, 
        outputCostPer1k: 0.600 / 1000,
        displayName: 'GPT-4o mini',
        contextWindow: 128000
    }
};

export const API_CONSTANTS = {
    anthropic: {
        BASE_URL: 'https://api.anthropic.com/v1/messages',
        REQUEST_API_KEY: 'https://console.anthropic.com/settings/keys',
        API_VERSION: '2023-06-01',
        MAX_OUTPUT_TOKENS: 4000,
        CHARS_PER_TOKEN: 4
    },
    openai: {
        BASE_URL: 'https://api.openai.com/v1/chat/completions',
        REQUEST_API_KEY: 'https://platform.openai.com/api-keys',
        MAX_OUTPUT_TOKENS: 4096,
        CHARS_PER_TOKEN: 4
    }
} as const;

export const TOKEN_LIMITS = {
    SYSTEM_PROMPT: 1000,
    USER_PROMPT: 500,
    RESPONSE: 4000,
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
    WAITING_RESPONSE: '🤔 Waiting for AI response...',
    RETRY_ATTEMPT: '🔄 Retrying request...',
    EDITOR_NOTE: 'Please open a note where you want to see the results.',
    ALREADY_PROCESSING: 'Already processing notes. Please wait...',
} as const;

export const ERROR_MESSAGES = {
    TYPES: {
        API_ERROR: 'API request failed',
        NETWORK_ERROR: 'Network connection error',
        AUTH_ERROR: 'Authentication failed',
        RATE_LIMIT: 'Rate limit exceeded',
        INVALID_REQUEST: 'Invalid request',
        PROCESSING_ERROR: 'Error processing content',
        PATTERN_ERROR: 'Pattern processing failed',
        PATTERN_NOT_FOUND: 'Pattern not found',
        PATTERN_INSTALLATION_ERROR: 'Failed to install patterns'
    },
    NETWORK: {
        NOT_INITIALIZED: 'NetworkManager not initialized',
        NO_CONNECTION: 'No internet connection',
        RATE_LIMIT: (attempts: number, error?: unknown) => 
            `Rate limit exceeded after ${attempts} attempts. ${error ? `Last error: ${error}` : ''}`
    },
    PROCESSING: {
        RETRY: (attempt: number, maxAttempts: number, seconds: number) => 
            `Request failed. Retrying in ${seconds}s... (Attempt ${attempt}/${maxAttempts})`,
        RATE_LIMIT_RETRY: (attempt: number, maxAttempts: number, seconds: number) => 
            `Rate limit reached. Retrying in ${seconds}s... (Attempt ${attempt}/${maxAttempts})`
    },
    API: {
        INVALID_RESPONSE: 'Invalid API response format',
        REQUEST_FAILED: (status: number) => `API request failed with status ${status}`
    },
    UNEXPECTED: 'An unexpected error occurred'
} as const;