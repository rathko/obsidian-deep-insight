import { requestUrl, RequestUrlResponse, RequestUrlParam, Notice } from 'obsidian';
import { DeepInsightError } from '../error/types';
import { UI_MESSAGES } from '../../constants';
import { DeepInsightAISettings } from '../../types';

export class NetworkManager {
    private static instance: NetworkManager;
    private isOnline: boolean = navigator.onLine;
    private settings!: DeepInsightAISettings;
    private retryDelay: number = 1000;

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
                message: 'NetworkManager not initialized with settings'
            });
        }

        if (!this.isOnline) {
            throw new DeepInsightError({
                type: 'NETWORK_ERROR',
                message: 'No internet connection'
            });
        }
    
        const { notice, clearInterval } = this.createProgressNotice(UI_MESSAGES.WAITING_RESPONSE);
    
        try {
            let lastError: unknown;
            for (let attempt = 1; attempt <= this.settings.retryAttempts; attempt++) {
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
                    if (attempt < this.settings.retryAttempts) {
                        await new Promise(resolve => 
                            setTimeout(resolve, this.retryDelay * attempt)
                        );
                    }
                }
            }
    
            throw lastError;
        } finally {
            clearInterval();
            notice.hide();
        }
    }

    private createProgressNotice(message: string): { notice: Notice; clearInterval: () => void } {
        const notice = new Notice(message, 0);
        const startTime = Date.now();
        const interval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            notice.setMessage(`${message} (${elapsed}s)`);
        }, 1000);

        return {
            notice,
            clearInterval: () => clearInterval(interval)
        };
    }
}