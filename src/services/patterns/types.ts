export interface Pattern {
    id: string;           // Unique identifier
    name: string;         // Display name
    path: string;         // Full path to pattern
    type: 'folder' | 'file';
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
    type: 'folder' | 'file';
}
