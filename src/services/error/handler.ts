import { Notice } from 'obsidian';
import { DeepInsightError } from './types';
import { ERROR_MESSAGES } from 'src/constants';

export class ErrorHandler {
    static handle(error: unknown): void {
        if (error instanceof DeepInsightError) {
            const message = this.getErrorMessage(error);
            new Notice(`Deep Insight: ${message}`, 8000);

            const errorLog = {
                type: error.error.type,
                message: error.error.message,
                ...(error.error.context !== undefined && { context: error.error.context })
            };

            console.error('Deep Insight Error:', errorLog);
        } else {
            const message = this.extractUserMessage(error);
            new Notice(`Deep Insight: ${message}`, 8000);
            console.error('Deep Insight error:', error);
        }
    }

    private static getErrorMessage(error: DeepInsightError): string {
        const baseMessage = ERROR_MESSAGES.TYPES[error.error.type];
        return `${baseMessage}: ${error.error.message}`;
    }

    private static extractUserMessage(error: unknown): string {
        if (error instanceof Error) {
            const msg = error.message.toLowerCase();
            if (msg.includes('credit balance') || msg.includes('billing')) {
                return 'API credits exhausted. Please top up your account or switch to a different provider in settings.';
            }
            if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('invalid.*key')) {
                return 'Invalid API key. Please check your key in Deep Insight settings.';
            }
            if (msg.includes('429') || msg.includes('rate limit')) {
                return 'Rate limit reached. Please wait a moment and try again.';
            }
            if (msg.includes('network') || msg.includes('fetch') || msg.includes('CORS') || msg.includes('failed to fetch')) {
                return 'Network error. Please check your internet connection.';
            }
            if (msg.includes('timeout')) {
                return 'Request timed out. The AI provider may be overloaded — try again shortly.';
            }
            // Show the actual error message rather than hiding it
            return error.message;
        }
        return ERROR_MESSAGES.UNEXPECTED;
    }
}