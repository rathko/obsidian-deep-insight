export type ErrorType = 
    | 'API_ERROR' 
    | 'NETWORK_ERROR' 
    | 'AUTH_ERROR' 
    | 'RATE_LIMIT' 
    | 'INVALID_REQUEST'
    | 'PROCESSING_ERROR'
    | 'PATTERN_ERROR'
    | 'PATTERN_NOT_FOUND'
    | 'PATTERN_INSTALLATION_ERROR';

export interface AIError {
    type: ErrorType;
    message: string;
    originalError?: unknown;
    context?: Record<string, unknown>;
}

export class DeepInsightError extends Error {
    constructor(
        public error: AIError
    ) {
        super(error.message);
        this.name = 'DeepInsightError';
    }
}