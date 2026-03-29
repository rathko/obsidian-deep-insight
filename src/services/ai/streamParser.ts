import { AIResponse } from './types';

export class StreamParser {
    static async parseSSE(
        body: ReadableStream<Uint8Array>,
        onChunk: (text: string) => void,
        provider: 'anthropic' | 'openai' | 'ollama'
    ): Promise<AIResponse> {
        const reader = body.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';
        let inputTokens = 0;
        let outputTokens = 0;
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const data = line.slice(6).trim();
                    if (data === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(data);
                        const text = this.extractText(parsed, provider);
                        if (text) {
                            fullContent += text;
                            onChunk(text);
                        }

                        this.extractUsage(parsed, provider, (input, output) => {
                            inputTokens = input;
                            outputTokens = output;
                        });
                    } catch {
                        // Skip unparseable SSE lines
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }

        return {
            content: fullContent,
            usage: (inputTokens || outputTokens)
                ? { inputTokens, outputTokens }
                : undefined
        };
    }

    static async parseNDJSON(
        body: ReadableStream<Uint8Array>,
        onChunk: (text: string) => void,
        provider: 'ollama'
    ): Promise<AIResponse> {
        const reader = body.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';
        let inputTokens = 0;
        let outputTokens = 0;
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;

                    try {
                        const parsed = JSON.parse(trimmed);
                        const text = this.extractText(parsed, provider);
                        if (text) {
                            fullContent += text;
                            onChunk(text);
                        }
                        this.extractUsage(parsed, provider, (input, output) => {
                            inputTokens = input;
                            outputTokens = output;
                        });
                    } catch {
                        // Skip unparseable lines
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }

        return {
            content: fullContent,
            usage: (inputTokens || outputTokens)
                ? { inputTokens, outputTokens }
                : undefined
        };
    }

    private static extractText(
        parsed: Record<string, unknown>,
        provider: 'anthropic' | 'openai' | 'ollama'
    ): string | null {
        if (provider === 'anthropic') {
            if (parsed.type === 'content_block_delta') {
                const delta = parsed.delta as Record<string, unknown> | undefined;
                return (delta?.text as string) || null;
            }
        } else if (provider === 'openai') {
            const choices = parsed.choices as Array<Record<string, unknown>> | undefined;
            const delta = choices?.[0]?.delta as Record<string, unknown> | undefined;
            return (delta?.content as string) || null;
        } else if (provider === 'ollama') {
            const message = parsed.message as Record<string, unknown> | undefined;
            return (message?.content as string) || null;
        }
        return null;
    }

    private static extractUsage(
        parsed: Record<string, unknown>,
        provider: 'anthropic' | 'openai' | 'ollama',
        onUsage: (input: number, output: number) => void
    ): void {
        if (provider === 'anthropic' && parsed.type === 'message_delta') {
            const usage = parsed.usage as Record<string, number> | undefined;
            if (usage) {
                onUsage(usage.input_tokens || 0, usage.output_tokens || 0);
            }
        } else if (provider === 'openai' && parsed.usage) {
            const usage = parsed.usage as Record<string, number>;
            onUsage(usage.prompt_tokens || 0, usage.completion_tokens || 0);
        } else if (provider === 'ollama' && parsed.done === true) {
            onUsage(
                (parsed.prompt_eval_count as number) || 0,
                (parsed.eval_count as number) || 0
            );
        }
    }
}
