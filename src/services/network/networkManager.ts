import { requestUrl, RequestUrlResponse, RequestUrlParam, Notice } from 'obsidian';
import { DeepInsightError } from '../error/types';
import { ERROR_MESSAGES, UI_MESSAGES } from '../../constants';
import { DeepInsightAISettings } from '../../types';

interface QueueItem {
    params: RequestUrlParam;
    resolve: (value: RequestUrlResponse) => void;
    reject: (error: any) => void;
    retries: number;
}

export class NetworkManager {
    private static instance: NetworkManager;
    private queue: QueueItem[] = [];
    private isProcessing = false;
    private lastRequestTime = 0;
    private settings!: DeepInsightAISettings;
    private isOnline = navigator.onLine;
    private readonly MIN_REQUEST_INTERVAL = 500;

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
    
        return new Promise((resolve, reject) => {
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
            item.reject(error);
        } finally {
            clearInterval();
            notice.hide();
            this.queue.shift();
            this.isProcessing = false;
            if (this.queue.length > 0) {
                void this.processQueue();
            }
        }
    }

    private async executeWithRetry(item: QueueItem): Promise<RequestUrlResponse> {
        let lastError: unknown;
    
        for (let attempt = 1; attempt <= this.settings.retryAttempts; attempt++) {
            try {
                const response = await requestUrl(item.params);
                if (response.status === 429) {
                    const retryAfter = response.headers?.['retry-after'];
                    const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : this.calculateRetryDelay(attempt);
                    
                    new Notice(
                        ERROR_MESSAGES.PROCESSING.RATE_LIMIT_RETRY(
                            attempt,
                            this.settings.retryAttempts,
                            Math.ceil(waitTime/1000)
                        ), 
                        waitTime
                    );
                    
                    await this.delay(waitTime);
                    continue;
                }
                return response;
            } catch (error) {
                lastError = error;
                if (attempt === this.settings.retryAttempts) {
                    break;
                }
                
                const retryDelay = this.calculateRetryDelay(attempt);
                new Notice(
                    ERROR_MESSAGES.PROCESSING.RETRY(
                        attempt,
                        this.settings.retryAttempts,
                        Math.ceil(retryDelay/1000)
                    ),
                    retryDelay
                );
                
                await this.delay(retryDelay);
            }
        }
    
        throw new DeepInsightError({
            type: 'RATE_LIMIT',
            message: ERROR_MESSAGES.NETWORK.RATE_LIMIT(this.settings.retryAttempts, lastError)
        });
    }

    /**
    * Calculates delay time for retry attempts using exponential backoff with jitter.
    * @param retryCount - Current retry attempt number
    * @returns Delay in milliseconds, capped at 32 seconds
    * 
    * Formula: delay = min(base * 2^(retry-1) + random(0-1000), 32000)
    * Example sequence (without jitter):
    * Retry 1: 1000ms
    * Retry 2: 2000ms 
    * Retry 3: 4000ms
    * Retry 4: 8000ms
    * etc.
    */
    private calculateRetryDelay(retryCount: number): number {
        const baseDelay = 1000 * Math.pow(2, retryCount - 1);
        const jitter = Math.random() * 1000;
        return Math.min(baseDelay + jitter, 32000);
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