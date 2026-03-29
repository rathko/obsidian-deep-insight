import { describe, it, expect } from 'vitest';
import { InputValidator } from './validation';

describe('InputValidator', () => {
    describe('validateApiKey', () => {
        it('rejects empty API key for anthropic', () => {
            expect(InputValidator.validateApiKey('', 'anthropic')).toBe(false);
        });

        it('rejects empty API key for openai', () => {
            expect(InputValidator.validateApiKey('', 'openai')).toBe(false);
        });

        it('accepts any value for ollama (no key needed)', () => {
            expect(InputValidator.validateApiKey('', 'ollama')).toBe(true);
            expect(InputValidator.validateApiKey('anything', 'ollama')).toBe(true);
        });

        it('validates anthropic key starts with sk-ant-', () => {
            expect(InputValidator.validateApiKey('sk-ant-abc123456789012345', 'anthropic')).toBe(true);
            expect(InputValidator.validateApiKey('sk-abc123', 'anthropic')).toBe(false);
        });

        it('validates openai key starts with sk- and is long enough', () => {
            expect(InputValidator.validateApiKey('sk-' + 'a'.repeat(50), 'openai')).toBe(true);
            expect(InputValidator.validateApiKey('sk-short', 'openai')).toBe(false);
        });

        it('rejects unknown provider', () => {
            expect(InputValidator.validateApiKey('any-key', 'unknown')).toBe(false);
        });
    });
});
