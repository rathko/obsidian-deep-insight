import { DEFAULT_PROMPTS } from './defaultPrompts';
import { DeepInsightAISettings } from './types';
import { ModelConfig } from './services/ai/types';

export const DEFAULT_SETTINGS: DeepInsightAISettings = {
    provider: {
        type: 'openai',
        apiKey: '',
        model: 'gpt-4o-mini'
    },
    systemPromptPath: '',
    userPromptPath: '',
    combinationPromptPath: '',
    excludeFolders: ['templates', 'archive'],
    maxTokensPerRequest: 90000,
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
        'claude-3-5-haiku-latest': 'Claude 3.5 Haiku (Affordable)',
        'claude-3-5-sonnet-latest': 'Claude 3.5 Sonnet (Flagship)',
    },
    openai: {
        'gpt-4o-mini': 'GPT-o mini (Affordable)',
        'gpt-4o': 'GPT-4o (Flagship)',
    }
} as const;

export const MODEL_CONFIGS: Record<string, ModelConfig> = {
    // Anthropic Models
    'claude-3-5-sonnet-latest': {
        maxTokens: 15000,
        inputCostPer1k: 0.015,  
        outputCostPer1k: 0.075, 
        displayName: 'Claude 3.5 Sonnet',
        contextWindow: 200000
    },
    'claude-3-5-haiku-latest': {
        maxTokens: 4000,
        inputCostPer1k: 0.003,  
        outputCostPer1k: 0.015, 
        displayName: 'Claude 3.5 Haiku',
        contextWindow: 200000
    },
    
    // OpenAI Models
    'gpt-4o': {
        maxTokens: 4096,
        inputCostPer1k: 0.01,   
        outputCostPer1k: 0.03,  
        displayName: 'GPT-4o',
        contextWindow: 128000
    },
    'gpt-4o-mini': {
        maxTokens: 4096,
        inputCostPer1k: 0.0015, 
        outputCostPer1k: 0.002, 
        displayName: 'GPT-4o mini',
        contextWindow: 16385
    }
};

export const API_CONSTANTS = {
    anthropic: {
        BASE_URL: 'https://api.anthropic.com/v1/messages',
        API_VERSION: '2023-06-01',
        DEFAULT_MAX_TOKENS: 4000,
        RESPONSE_TOKENS: 4000,
        CHARS_PER_TOKEN: 4
    },
    openai: {
        BASE_URL: 'https://api.openai.com/v1/chat/completions',
        DEFAULT_MAX_TOKENS: 4096,
        RESPONSE_TOKENS: 4096,
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
    API_ERROR: '❌ API error: Please check your settings',
    RATE_LIMIT: '⚠️ Rate limit reached: Please try again later',
    WAITING_RESPONSE: '🤔 Waiting for AI response...',
    RETRY_ATTEMPT: '🔄 Retrying request...'
} as const;