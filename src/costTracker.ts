import { AIProvider, AIUsage } from './services/ai/types';

export class CostTracker {
    private static readonly TOKENS_PER_CHUNK = 100_000;
    private static readonly COST_PRECISION = 4;
    private static readonly ESTIMATE_PRECISION = 2;

    private inputTokens = 0;
    private outputTokens = 0;

    constructor(private readonly provider: AIProvider) {}

    addUsage(usage?: AIUsage): void {
        if (!usage) {
            return;
        }
        
        this.inputTokens += usage.inputTokens;
        this.outputTokens += usage.outputTokens;
    }

    calculateCost(): { total: number; details: string } {
        const costs = this.provider.getCosts();
        const { inputCost, outputCost } = this.calculateTokenCosts(costs);
        const total = inputCost + outputCost;

        const details = this.formatCostDetails(inputCost, outputCost, total, costs.displayName);
        
        return { total, details };
    }

    generateInitialCostEstimate(numChunks: number): string {
        const costs = this.provider.getCosts();
        const maxCostPerChunk = (costs.inputCostPer1k / 1000) * CostTracker.TOKENS_PER_CHUNK;
        const totalEstimate = (maxCostPerChunk * numChunks);

        return [
            `Processing ${numChunks} chunk${numChunks === 1 ? '' : 's'} using ${costs.displayName}`,
            `Estimated maximum cost: $${totalEstimate.toFixed(CostTracker.ESTIMATE_PRECISION)}`,
            `(Based on ${CostTracker.TOKENS_PER_CHUNK.toLocaleString()} tokens per chunk)`
        ].join('\n');
    }

    private calculateTokenCosts(costs: ReturnType<AIProvider['getCosts']>) {
        return {
            inputCost: (this.inputTokens * costs.inputCostPer1k) / 1000,
            outputCost: (this.outputTokens * costs.outputCostPer1k) / 1000
        };
    }

    private formatCostDetails(inputCost: number, outputCost: number, total: number, displayName: string): string {
        return [
            `Cost Summary (${displayName}):`,
            `• Input: ${this.inputTokens.toLocaleString()} tokens ($${inputCost.toFixed(CostTracker.COST_PRECISION)})`,
            `• Output: ${this.outputTokens.toLocaleString()} tokens ($${outputCost.toFixed(CostTracker.COST_PRECISION)})`,
            `• Total estimated cost: $${total.toFixed(CostTracker.COST_PRECISION)}`
        ].join('\n');
    }
}