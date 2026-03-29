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
}