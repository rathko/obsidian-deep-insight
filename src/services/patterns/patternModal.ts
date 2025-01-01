import { App, FuzzySuggestModal, FuzzyMatch } from 'obsidian';
import { PatternMetadata } from './types';

export class PatternSelectionModal extends FuzzySuggestModal<PatternMetadata> {
    constructor(
        app: App,
        private patterns: PatternMetadata[],
        private onSelect: (pattern: PatternMetadata) => void
    ) {
        super(app);
        this.setPlaceholder('Choose a pattern to apply...');
        // Sort patterns alphabetically by name
        this.patterns.sort((a, b) => a.name.localeCompare(b.name));
    }

    getItems(): PatternMetadata[] {
        return this.patterns;
    }

    getItemText(pattern: PatternMetadata): string {
        return this.formatPatternName(pattern.name);
    }

    renderSuggestion(match: FuzzyMatch<PatternMetadata>, el: HTMLElement): void {
        const pattern = match.item;
        el.createEl('div', { text: this.formatPatternName(pattern.name) });
        el.createEl('small', { 
            text: 'Pattern',
            cls: 'pattern-type'
        });
    }

    private formatPatternName(name: string): string {
        // Human readable pattern names
        // Remove file extension and path segments
        const baseName = name.split('/').pop()?.replace('.md', '') || name;
        
        // Split by underscore, capitalize each word, join with space
        return baseName
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    onChooseItem(pattern: PatternMetadata): void {
        this.onSelect(pattern);
    }
}