import { requestUrl, RequestUrlResponse, RequestUrlParam, Notice } from 'obsidian';
import { DeepInsightError } from '../error/types';
import { ERROR_MESSAGES, UI_MESSAGES } from '../../constants';
import { DeepInsightAISettings } from '../../types';

type NetworkError = DeepInsightError | Error;

interface QueueItem {
    params: RequestUrlParam;
    resolve: (value: RequestUrlResponse) => void;
    reject: (error: NetworkError) => void;
    retries: number;
}

interface ErrorDetails {
    statusCode?: number;
    responseBody?: string;
    retryAttempt: number;
    originalError: Error;
}

export class NetworkManager {
    private static instance: NetworkManager;
    private readonly MIN_REQUEST_INTERVAL = 500;
    private readonly MAX_RETRY_DELAY = 32000;
    private readonly JITTER_MAX = 1000;
    private readonly BASE_DELAY = 1000;
    private readonly ERROR_NOTICE_DURATION = 10000;

    private queue: QueueItem[] = [];
    private isProcessing = false;
    private lastRequestTime = 0;
    private settings!: DeepInsightAISettings;
    private isOnline = navigator.onLine;

    private constructor() {
        window.addEventListener('online', () => this.isOnline = true);
        window.addEventListener('offline', () => this.isOnline = false);
    }

    static getInstance(): NetworkManager {
        if (!NetworkManager.instance) {
            NetworkManager.instance = new NetworkManager();
        }
        return NetworkManager.instance;
    }

    initialize(settings: DeepInsightAISettings): void {
        this.settings = settings;
    }

    async makeRequest(params: RequestUrlParam): Promise<RequestUrlResponse> {
        if (!this.settings) {
            throw new DeepInsightError({
                type: 'PROCESSING_ERROR',
                message: ERROR_MESSAGES.NETWORK.NOT_INITIALIZED
            });
        }
    
        if (!this.isOnline) {
            throw new DeepInsightError({
                type: 'NETWORK_ERROR',
                message: ERROR_MESSAGES.NETWORK.NO_CONNECTION
            });
        }
    
        return new Promise<RequestUrlResponse>((resolve, reject) => {
            this.queue.push({ params, resolve, reject, retries: 0 });
            void this.processQueue();
        });
    }

    private async processQueue(): Promise<void> {
        if (this.isProcessing || this.queue.length === 0) {
            return;
        }

        this.isProcessing = true;
        const item = this.queue[0];
        const { notice, clearInterval } = this.createProgressNotice(UI_MESSAGES.WAITING_RESPONSE);

        try {
            await this.delay(this.getTimeToWait());
            const response = await this.executeWithRetry(item);
            item.resolve(response);
            this.lastRequestTime = Date.now();
        } catch (error) {
            item.reject(error instanceof Error ? error : new Error(String(error)));
        } finally {
            clearInterval();
            notice.hide();
            this.queue.shift();
            this.isProcessing = false;
            void this.processQueue();
        }
    }

    private async executeWithRetry(item: QueueItem): Promise<RequestUrlResponse> {
        let errorDetails: ErrorDetails | null = null;
    
        for (let attempt = 1; attempt <= this.settings.retryAttempts; attempt++) {
            try {
                const response = await requestUrl(item.params);
                
                if (response.status === 429) {
                    const retryAfter = parseInt(response.headers?.['retry-after'] ?? '0');
                    const waitTime = retryAfter ? retryAfter * 1000 : this.calculateRetryDelay(attempt);
                    
                    errorDetails = {
                        statusCode: response.status,
                        responseBody: await response.text,
                        retryAttempt: attempt,
                        originalError: new Error('Rate limit exceeded')
                    };
                    
                    this.showRetryNotice(attempt, waitTime);
                    await this.delay(waitTime);
                    continue;
                }
                
                return response;
            } catch (error) {
                const currentError = error instanceof Error ? error : new Error(String(error));
                
                errorDetails = {
                    retryAttempt: attempt,
                    originalError: currentError,
                    ...(error instanceof Response ? {
                        statusCode: error.status,
                        responseBody: await error.text()
                    } : {})
                };
                
                if (attempt === this.settings.retryAttempts) {
                    break;
                }
                
                const retryDelay = this.calculateRetryDelay(attempt);
                this.showRetryNotice(attempt, retryDelay);
                await this.delay(retryDelay);
            }
        }

        const errorMessage = this.formatErrorMessage(errorDetails);
        this.showErrorNotice(errorMessage);
        
        throw new DeepInsightError({
            type: 'RATE_LIMIT',
            message: errorMessage
        });
    }

    private formatErrorMessage(details: ErrorDetails | null): string {
        if (!details) {
            return ERROR_MESSAGES.NETWORK.UNKNOWN_ERROR;
        }

        // User-friendly error message for the notice
        const userParts = [
            `Request failed after ${details.retryAttempt} attempt${details.retryAttempt !== 1 ? 's' : ''}.`
        ];

        if (details.statusCode === 429) {
            userParts.push("Rate limit reached. Please try again later.");
        } else if (details.statusCode) {
            userParts.push(`Server returned status ${details.statusCode}.`);
        }

        if (details.responseBody) {
            const cleanResponse = details.responseBody
                .replace(/[{}"]/g, '')  // Remove JSON syntax
                .slice(0, 100);         // Limit length
            if (cleanResponse) {
                userParts.push(`Server message: ${cleanResponse}`);
            }
        }

        return userParts.join(' ');
    }

    private showErrorNotice(message: string): void {
        new Notice(message, this.ERROR_NOTICE_DURATION);
    }

    private calculateRetryDelay(retryCount: number): number {
        const baseDelay = this.BASE_DELAY * Math.pow(2, retryCount - 1);
        const jitter = Math.random() * this.JITTER_MAX;
        return Math.min(baseDelay + jitter, this.MAX_RETRY_DELAY);
    }

    private showRetryNotice(attempt: number, delay: number): void {
        const message = attempt === this.settings.retryAttempts 
            ? ERROR_MESSAGES.PROCESSING.RATE_LIMIT_RETRY
            : ERROR_MESSAGES.PROCESSING.RETRY;
            
        new Notice(
            message(
                attempt,
                this.settings.retryAttempts,
                Math.ceil(delay / 1000)
            ),
            delay
        );
    }

    private getTimeToWait(): number {
        return Math.max(0, this.MIN_REQUEST_INTERVAL - (Date.now() - this.lastRequestTime));
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private createProgressNotice(message: string): { notice: Notice; clearInterval: () => void } {
        const notice = new Notice(message, 0);
        const startTime = Date.now();
        const interval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            notice.setMessage(`${message} (${elapsed}s)`);
        }, 1000);

        return { notice, clearInterval: () => clearInterval(interval) };
    }
}