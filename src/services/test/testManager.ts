import { TFile, Notice } from 'obsidian';
import { DeepInsightAISettings } from 'src/types';

export class TestModeManager {
    private static instance: TestModeManager;
    private constructor() {}

    static getInstance(): TestModeManager {
        if (!TestModeManager.instance) {
            TestModeManager.instance = new TestModeManager();
        }
        return TestModeManager.instance;
    }

    isTestModeEnabled(settings: DeepInsightAISettings): boolean {
        return settings.testMode.enabled;
    }

    applyTestLimits(files: TFile[], settings: DeepInsightAISettings): TFile[] {
        if (!this.isTestModeEnabled(settings)) {
            return files;
        }

        new Notice('Deep Insight: Test Mode Active');
        
        if (settings.testMode.maxFiles) {
            const limitedFiles = files.slice(0, settings.testMode.maxFiles);
            new Notice(`Deep Insight: Limited to ${limitedFiles.length} files for testing`);
            return limitedFiles;
        }

        return files;
    }

    applyTokenLimit(content: string, settings: DeepInsightAISettings, charsPerToken: number): string {
        if (!this.isTestModeEnabled(settings) || !settings.testMode.maxTokens) {
            return content;
        }

        const estimatedCurrentTokens = Math.ceil(content.length / charsPerToken);
        if (estimatedCurrentTokens <= settings.testMode.maxTokens) {
            return content;
        }

        const charLimit = settings.testMode.maxTokens * charsPerToken;
        const truncatedContent = content.slice(0, charLimit);
        
        const reduction = Math.round((1 - settings.testMode.maxTokens / estimatedCurrentTokens) * 100);
        new Notice(`Deep Insight: Content truncated by ${reduction}% for testing`);

        return truncatedContent + '\n\n[Content truncated for testing]';
    }
}