interface ModelCosts {
    input: number;
    output: number;
    displayName: string;
}

export interface ModelCostConfig {
    [key: string]: ModelCosts;
}

export class CostTracker {
    private static readonly MODEL_COSTS: ModelCostConfig = {
        'claude-3-5-sonnet-latest': {
            input: 0.000015,   // per input token
            output: 0.000075,  // per output token
            displayName: 'Sonnet'
        },
        'claude-3-5-haiku-latest': {
            input: 0.000003,   // per input token
            output: 0.000015,  // per output token
            displayName: 'Haiku'
        }
    };

    private static readonly TOKENS_PER_CHUNK = 100000;

    private inputTokens: number = 0;
    private outputTokens: number = 0;
    private model: string;

    constructor(model: string) {
        this.model = model;
    }

    addInputTokens(tokens: number): void {
        this.inputTokens += tokens;
    }

    addOutputTokens(tokens: number): void {
        this.outputTokens += tokens;
    }

    private getModelCosts(): ModelCosts {
        const costs = CostTracker.MODEL_COSTS[this.model];
        if (!costs) {
            throw new Error(`Cost information not available for model: ${this.model}`);
        }
        return costs;
    }

    private calculateMaxCostPerChunk(): number {
        const costs = this.getModelCosts();
        // Calculate maximum cost based on number of input tokens
        return costs.input * CostTracker.TOKENS_PER_CHUNK;
    }

    calculateCost(): { total: number; details: string } {
        const costs = this.getModelCosts();
        const inputCost = this.inputTokens * costs.input;
        const outputCost = this.outputTokens * costs.output;
        const total = inputCost + outputCost;

        const details = `Cost Summary:
• Input: ${this.inputTokens.toLocaleString()} tokens
• Output: ${this.outputTokens.toLocaleString()} tokens
• Total cost: $${total.toFixed(4)}`;

        return { total, details };
    }

    generateInitialCostEstimate(numChunks: number): string {
        const costs = this.getModelCosts();
        const maxCostPerChunk = this.calculateMaxCostPerChunk();
        const totalEstimate = (maxCostPerChunk * numChunks).toFixed(2);

        return `🔎 Starting analysis...\n\nProcessing ${numChunks} chunk${numChunks > 1 ? 's' : ''} using Claude ${costs.displayName}\nEstimated maximum cost: $${totalEstimate}\n(Based on ${CostTracker.TOKENS_PER_CHUNK.toLocaleString()} tokens per chunk)`;
    }

    static estimateTokens(text: string): number {
        // Rough estimation: ~3 characters per token
        return Math.ceil(text.length / 3);
    }
}