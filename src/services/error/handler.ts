import { Notice } from 'obsidian';
import { DeepInsightError, ErrorType } from './types';

export class ErrorHandler {
    private static readonly ERROR_MESSAGES: Record<ErrorType, string> = {
        API_ERROR: 'API request failed',
        NETWORK_ERROR: 'Network connection error',
        AUTH_ERROR: 'Authentication failed',
        RATE_LIMIT: 'Rate limit exceeded',
        INVALID_REQUEST: 'Invalid request',
        PROCESSING_ERROR: 'Error processing content'
    };

    static handle(error: unknown): void {
        if (error instanceof DeepInsightError) {
            const message = this.getErrorMessage(error);
            new Notice(message, 5000);
            console.error('Deep Insight Error:', {
                type: error.error.type,
                message: error.error.message,
                context: error.error.context
            });
        } else {
            new Notice('An unexpected error occurred', 5000);
            console.error('Unexpected error:', error);
        }
    }

    private static getErrorMessage(error: DeepInsightError): string {
        const baseMessage = this.ERROR_MESSAGES[error.error.type];
        return `${baseMessage}: ${error.error.message}`;
    }
}
