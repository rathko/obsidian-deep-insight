import { PATTERN_DEFAULTS } from "src/constants";
import { PatternManager } from "./patternManager";
import { Notice, Setting } from "obsidian";
import DeepInsightAI from "src/main";

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

            // Load patterns immediately after installation
            await patternManager.loadPatterns();

            this.plugin.settings.patterns.installed = true;
            await this.plugin.saveSettings();
            
            // Verify patterns were loaded successfully
            const patterns = patternManager.getAllPatterns();
            if (patterns.length === 0) {
                throw new Error('No patterns were loaded after installation');
            }
            
            new Notice(`Fabric patterns installed successfully! (${patterns.length} patterns available)`);
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
            .setName('Enable Fabric Patterns')
            .setDesc('Enable Fabric pattern-based analysis')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.patterns.enabled)
                .onChange(async (value) => {
                    this.plugin.settings.patterns.enabled = value;
                    await this.plugin.saveSettings();
                    this.plugin.updateContextMenu();
                    
                    if (value) {
                        // Load patterns when enabling the feature
                        const patternManager = PatternManager.getInstance(
                            this.plugin.app.vault,
                            {
                                enabled: true,
                                patternsPath: this.plugin.settings.patterns.folderPath
                            }
                        );
                        await patternManager.loadPatterns();
                    }
                    
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
            .setDesc('Location of Fabric patterns')
            .addText(text => text
                .setPlaceholder(PATTERN_DEFAULTS.DEFAULT_PATTERNS_FOLDER)
                .setValue(this.plugin.settings.patterns.folderPath)
                .onChange(async (value) => {
                    this.plugin.settings.patterns.folderPath = value;
                    await this.plugin.saveSettings();
                }));
    
        const buttonText = this.plugin.settings.patterns.installed ? 
            `Update Patterns` : 
            'Install Patterns';
    
        const descFragment = document.createDocumentFragment();
        descFragment.append(
            'Install or update bundled Fabric patterns. To install all Fabric patterns, see: ',
            this.containerEl.createEl('a', { 
                text: 'installation guide',
                href: 'https://github.com/rathko/obsidian-deep-insight?tab=readme-ov-file#patterns',
                cls: 'external-link'
            })
        );
    
        new Setting(this.patternContainer)
            .setName('Install Fabric Patterns')
            .setDesc(descFragment)
            .addButton(button => button
                .setButtonText(buttonText)
                .onClick(() => this.handleInstallPatterns()));
    }
}