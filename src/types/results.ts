export interface AnalysisResult {
    tasks: Array<{
        title: string;
        priority: 'high' | 'medium' | 'low';
        dueDate?: string;
        source?: string;
        category?: string;
    }>;
    ideas: string[];
    reflections: string[];
}

export interface ProcessingStats {
    filesProcessed: number;
    tokensProcessed: number;
    duration: number;
    cost: number;
}