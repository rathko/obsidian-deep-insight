export class TokenCalculator {
    private static readonly AVG_CHARS_PER_TOKEN = 4;

    static estimateTokenCount(text: string): number {
        return Math.ceil(text.length / this.AVG_CHARS_PER_TOKEN);
    }

    static truncateToTokenLimit(text: string, maxTokens: number): string {
        const maxChars = maxTokens * this.AVG_CHARS_PER_TOKEN;
        if (text.length <= maxChars) return text;
        
        return text.slice(0, maxChars) + '...';
    }
}