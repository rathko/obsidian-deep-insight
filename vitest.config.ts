import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
    test: {
        include: ['src/**/*.test.ts'],
    },
    resolve: {
        alias: {
            'src': resolve(__dirname, 'src'),
            'obsidian': resolve(__dirname, 'src/__mocks__/obsidian.ts'),
        }
    }
});
