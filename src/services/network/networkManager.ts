import { requestUrl, RequestUrlResponse, RequestUrlParam } from 'obsidian';
import { DeepInsightError } from '../error/types';

export class NetworkManager {
    private static instance: NetworkManager;
    private isOnline: boolean = navigator.onLine;
    private retryCount: number = 3;
    private retryDelay: number = 1000;

    private constructor() {
        window.addEventListener('online', () => this.isOnline = true);
        window.addEventListener('offline', () => this.isOnline = false);
    }

    static getInstance(): NetworkManager {
        if (!NetworkManager.instance) {
            NetworkManager.instance = new NetworkManager;
        }
        return NetworkManager.instance;
    }

    async makeRequest(params: RequestUrlParam): Promise<RequestUrlResponse> {
        if (!this.isOnline) {
            throw new DeepInsightError({
                type: 'NETWORK_ERROR',
                message: 'No internet connection'
            });
        }

        let lastError: unknown;
        for (let attempt = 1; attempt <= this.retryCount; attempt++) {
            try {
                const response = await requestUrl(params);
                if (response.status === 429) {
                    throw new DeepInsightError({
                        type: 'RATE_LIMIT',
                        message: 'Rate limit exceeded'
                    });
                }
                return response;
            } catch (error) {
                lastError = error;
                if (attempt < this.retryCount) {
                    await new Promise(resolve => 
                        setTimeout(resolve, this.retryDelay * attempt)
                    );
                }
            }
        }

        throw lastError;
    }

    setRetryOptions(count: number, delay: number): void {
        this.retryCount = count;
        this.retryDelay = delay;
    }
}