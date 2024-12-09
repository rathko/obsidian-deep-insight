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

export class NetworkManager {
    private static instance: NetworkManager;
    private readonly MIN_REQUEST_INTERVAL = 500;
    private readonly MAX_RETRY_DELAY = 32000;
    private readonly JITTER_MAX = 1000;
    private readonly BASE_DELAY = 1000;

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
        let lastError: NetworkError = new Error('Unknown error');
    
        for (let attempt = 1; attempt <= this.settings.retryAttempts; attempt++) {
            try {
                const response = await requestUrl(item.params);
                
                if (response.status === 429) {
                    const retryAfter = parseInt(response.headers?.['retry-after'] ?? '0');
                    const waitTime = retryAfter ? retryAfter * 1000 : this.calculateRetryDelay(attempt);
                    
                    this.showRetryNotice(attempt, waitTime);
                    await this.delay(waitTime);
                    continue;
                }
                
                return response;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                
                if (attempt === this.settings.retryAttempts) {
                    break;
                }
                
                const retryDelay = this.calculateRetryDelay(attempt);
                this.showRetryNotice(attempt, retryDelay);
                await this.delay(retryDelay);
            }
        }
    
        throw new DeepInsightError({
            type: 'RATE_LIMIT',
            message: ERROR_MESSAGES.NETWORK.RATE_LIMIT(this.settings.retryAttempts, lastError)
        });
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