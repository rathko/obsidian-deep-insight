import { App, Setting, Notice } from 'obsidian';
import DeepInsightAI from 'src/main';
import { PatternManager } from './patternManager';
import { PATTERN_DEFAULTS } from 'src/constants';

export class PatternSettings {
    private mainToggle!: Setting;
    private patternContainer!: HTMLElement;

    constructor(
        private containerEl: HTMLElement,
        private plugin: DeepInsightAI
    ) {}

    private async handleInstallPatterns(): Promise<void> {
        try {
            new Notice('Installing Fabric patterns...');
            const patternManager = PatternManager.getInstance(
                this.plugin.app.vault,
                {
                    enabled: this.plugin.settings.patterns.enabled,
                    patternsPath: this.plugin.settings.patterns.folderPath
                }
            );

            await patternManager.installPatterns(
                'fabric-patterns',
                this.plugin.settings.patterns.folderPath
            );

            this.plugin.settings.patterns.installed = true;
            await this.plugin.saveSettings();
            new Notice('Fabric patterns installed successfully!');
        } catch (err) {
            const error = err as Error;
            new Notice(`Failed to install patterns: ${error.message}`);
            console.error('Pattern installation error:', error);
        }
    }

    render(): void {
        this.containerEl.createEl('h3', { text: 'Pattern Settings' });

        // Create container for pattern settings
        this.patternContainer = this.containerEl.createDiv({ cls: 'pattern-settings-container' });

        this.mainToggle = new Setting(this.containerEl)
            .setName('Enable Patterns')
            .setDesc('Enable pattern-based analysis')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.patterns.enabled)
                .onChange(async (value) => {
                    this.plugin.settings.patterns.enabled = value;
                    await this.plugin.saveSettings();
                    this.plugin.updateContextMenu();
                    
                    // Clear and update container
                    this.patternContainer.empty();
                    if (value) {
                        this.renderPatternOptions();
                    }
                }));

        // Insert container after the toggle
        this.mainToggle.settingEl.after(this.patternContainer);

        if (this.plugin.settings.patterns.enabled) {
            this.renderPatternOptions();
        }
    }

    private renderPatternOptions(): void {
        new Setting(this.patternContainer)
            .setName('Patterns Folder')
            .setDesc('Location of analysis patterns')
            .addText(text => text
                .setPlaceholder(PATTERN_DEFAULTS.DEFAULT_PATTERNS_FOLDER)
                .setValue(this.plugin.settings.patterns.folderPath)
                .onChange(async (value) => {
                    this.plugin.settings.patterns.folderPath = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(this.patternContainer)
            .setName('Install Fabric Patterns')
            .setDesc('Install or update bundled Fabric patterns')
            .addButton(button => button
                .setButtonText(this.plugin.settings.patterns.installed ? 'Update Patterns' : 'Install Patterns')
                .onClick(() => this.handleInstallPatterns()));
    }
}