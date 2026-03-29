import { Editor } from 'obsidian';

export interface Pattern {
    id: string;           // Unique identifier
    name: string;         // Display name
    path: string;         // Full path to pattern
    system?: string;      // Content of system.md if exists
    user?: string;        // Content of user.md if exists
}

export interface PatternFile {
    path: string;
    content: string;
    hash: string;
}

export interface PatternConfig {
    enabled: boolean;
    patternsPath: string;
}

export interface ProcessingOptions {
    systemPrompt: string;
    userPrompt: string;
    isCombining?: boolean;
}

export interface PatternMetadata {
    id: string;
    name: string;
    path: string;
}

export interface PatternExecutor {
    processChunk(content: string, options: ProcessingOptions): Promise<string>;
    processChunks(chunks: { content: string; size: number }[], options: ProcessingOptions): Promise<string>;
    insertContent(editor: Editor, content: string): Promise<void>;
    showSuccessMessage(): void;
    costTracker?: {
        reset(): void;
        generateInitialCostEstimate(numChunks: number): string;
    };
    settings: {
        defaultSystemPrompt: string;
        defaultUserPrompt: string;
    };
}