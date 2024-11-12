interface ModelCosts {
    input: number;
    output: number;
}

export interface ModelCostConfig {
    [key: string]: ModelCosts;
}

export class CostTracker {
    private static readonly MODEL_COSTS: ModelCostConfig = {
        'claude-3-5-sonnet-latest': {
            input: 0.000015,   // per input token
            output: 0.000075   // per output token
        },
        'claude-3-5-haiku-latest': {
            input: 0.000003,   // per input token
            output: 0.000015   // per output token
        }
    };

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

    calculateCost(): { total: number; details: string } {
        const costs = CostTracker.MODEL_COSTS[this.model];
        if (!costs) {
            throw new Error(`Cost information not available for model: ${this.model}`);
        }

        const inputCost = this.inputTokens * costs.input;
        const outputCost = this.outputTokens * costs.output;
        const total = inputCost + outputCost;

        const details = `Cost Summary:
• Input: ${this.inputTokens.toLocaleString()} tokens
• Output: ${this.outputTokens.toLocaleString()} tokens
• Total cost: $${total.toFixed(4)}`;

        return { total, details };
    }

    static estimateTokens(text: string): number {
        // Rough estimation: ~3 characters per token
        return Math.ceil(text.length / 3);
    }
}