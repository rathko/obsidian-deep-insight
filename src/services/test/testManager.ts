import { TFile } from 'obsidian';
import { DeepInsightAISettings } from '../../settings';
import { ANTHROPIC_API_CONSTANTS } from '../../constants';

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

        console.log('Deep Insight AI: Test Mode Active');
        
        if (settings.testMode.maxFiles) {
            const limitedFiles = files.slice(0, settings.testMode.maxFiles);
            console.log(`Deep Insight AI: Limited to ${limitedFiles.length} files for testing`);
            return limitedFiles;
        }

        return files;
    }

    applyTokenLimit(content: string, settings: DeepInsightAISettings): string {
        if (!this.isTestModeEnabled(settings) || !settings.testMode.maxTokens) {
            return content;
        }

        const estimatedCurrentTokens = Math.ceil(content.length / ANTHROPIC_API_CONSTANTS.CHARS_PER_TOKEN);
        if (estimatedCurrentTokens <= settings.testMode.maxTokens) {
            return content;
        }

        const charLimit = settings.testMode.maxTokens * ANTHROPIC_API_CONSTANTS.CHARS_PER_TOKEN;
        const truncatedContent = content.slice(0, charLimit);
        
        console.log('Deep Insight AI: Content truncated for testing', {
            originalTokens: estimatedCurrentTokens,
            truncatedTokens: settings.testMode.maxTokens,
            reduction: `${Math.round((1 - settings.testMode.maxTokens / estimatedCurrentTokens) * 100)}%`
        });

        return truncatedContent + '\n\n[Content truncated for testing]';
    }
}
