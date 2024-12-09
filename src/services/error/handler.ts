import { Notice } from 'obsidian';
import { DeepInsightError } from './types';
import { ERROR_MESSAGES } from 'src/constants';

export class ErrorHandler {
    static handle(error: unknown): void {
        if (error instanceof DeepInsightError) {
            const message = this.getErrorMessage(error);
            new Notice(message, 5000);
            
            const errorLog = {
                type: error.error.type,
                message: error.error.message,
                ...(error.error.context !== undefined && { context: error.error.context })
            };

            console.error('Deep Insight Error:', errorLog);
        } else {
            new Notice(ERROR_MESSAGES.UNEXPECTED, 5000);
            console.error('Unexpected error:', error);
        }
    }

    private static getErrorMessage(error: DeepInsightError): string {
        const baseMessage = ERROR_MESSAGES.TYPES[error.error.type];
        return `${baseMessage}: ${error.error.message}`;
    }
}