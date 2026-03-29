import { describe, it, expect } from 'vitest';
import { StreamParser } from './streamParser';

function createStream(chunks: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    let index = 0;
    return new ReadableStream({
        pull(controller) {
            if (index < chunks.length) {
                controller.enqueue(encoder.encode(chunks[index]));
                index++;
            } else {
                controller.close();
            }
        }
    });
}

describe('StreamParser', () => {
    describe('parseSSE - OpenAI format', () => {
        it('extracts text from OpenAI SSE chunks', async () => {
            const chunks = [
                'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
                'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
                'data: [DONE]\n\n'
            ];

            const collected: string[] = [];
            const result = await StreamParser.parseSSE(
                createStream(chunks),
                (text) => collected.push(text),
                'openai'
            );

            expect(result.content).toBe('Hello world');
            expect(collected).toEqual(['Hello', ' world']);
        });
    });

    describe('parseSSE - Anthropic format', () => {
        it('extracts text from Anthropic SSE chunks', async () => {
            const chunks = [
                'data: {"type":"content_block_delta","delta":{"text":"Hi"}}\n\n',
                'data: {"type":"content_block_delta","delta":{"text":" there"}}\n\n',
                'data: {"type":"message_delta","usage":{"input_tokens":10,"output_tokens":5}}\n\n',
            ];

            const collected: string[] = [];
            const result = await StreamParser.parseSSE(
                createStream(chunks),
                (text) => collected.push(text),
                'anthropic'
            );

            expect(result.content).toBe('Hi there');
            expect(collected).toEqual(['Hi', ' there']);
            expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
        });
    });

    describe('parseNDJSON - Ollama format', () => {
        it('extracts text from Ollama NDJSON chunks', async () => {
            const chunks = [
                '{"message":{"content":"Hello"},"done":false}\n',
                '{"message":{"content":" world"},"done":false}\n',
                '{"message":{"content":""},"done":true,"prompt_eval_count":15,"eval_count":8}\n',
            ];

            const collected: string[] = [];
            const result = await StreamParser.parseNDJSON(
                createStream(chunks),
                (text) => collected.push(text),
                'ollama'
            );

            expect(result.content).toBe('Hello world');
            expect(collected).toEqual(['Hello', ' world']);
            expect(result.usage).toEqual({ inputTokens: 15, outputTokens: 8 });
        });
    });

    describe('parseSSE - handles malformed data', () => {
        it('skips non-data lines and unparseable JSON', async () => {
            const chunks = [
                'event: ping\n',
                ': comment\n',
                'data: not-json\n\n',
                'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
            ];

            const collected: string[] = [];
            const result = await StreamParser.parseSSE(
                createStream(chunks),
                (text) => collected.push(text),
                'openai'
            );

            expect(result.content).toBe('ok');
            expect(collected).toEqual(['ok']);
        });
    });
});
