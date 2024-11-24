import { AIProvider, AIUsage } from './services/ai/types';

export class CostTracker {
    private inputTokens: number = 0;
    private outputTokens: number = 0;
    private provider: AIProvider;
    private static readonly TOKENS_PER_CHUNK = 100000;

    constructor(provider: AIProvider) {
        this.provider = provider;
    }

    addUsage(usage?: AIUsage): void {
        if (usage) {
            this.inputTokens += usage.inputTokens;
            this.outputTokens += usage.outputTokens;
        }
    }

    calculateCost(): { total: number; details: string } {
        const costs = this.provider.getCosts();
        const inputCost = this.inputTokens * costs.inputCostPer1k / 1000;
        const outputCost = this.outputTokens * costs.outputCostPer1k / 1000;
        const total = inputCost + outputCost;

        const details = `Cost Summary (${costs.displayName}):
• Input: ${this.inputTokens.toLocaleString()} tokens ($${inputCost.toFixed(4)})
• Output: ${this.outputTokens.toLocaleString()} tokens ($${outputCost.toFixed(4)})
• Total estimated cost: $${total.toFixed(4)}`;

        return { total, details };
    }

    generateInitialCostEstimate(numChunks: number): string {
        const costs = this.provider.getCosts();
        const maxCostPerChunk = costs.inputCostPer1k / 1000 * CostTracker.TOKENS_PER_CHUNK;
        const totalEstimate = (maxCostPerChunk * numChunks).toFixed(2);

        return `Processing ${numChunks} chunk${numChunks > 1 ? 's' : ''} using ${costs.displayName}\nEstimated maximum cost: $${totalEstimate}\n(Based on ${CostTracker.TOKENS_PER_CHUNK.toLocaleString()} tokens per chunk)`;
    }
}
