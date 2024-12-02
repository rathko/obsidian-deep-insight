import { App, FuzzySuggestModal, FuzzyMatch } from 'obsidian';
import { Pattern } from './types';

export class PatternSelectionModal extends FuzzySuggestModal<Pattern> {
    constructor(
        app: App,
        private patterns: Pattern[],
        private onSelect: (pattern: Pattern) => void
    ) {
        super(app);
        this.setPlaceholder('Choose a pattern to apply...');
        // Sort patterns alphabetically by name
        this.patterns.sort((a, b) => a.name.localeCompare(b.name));
    }

    getItems(): Pattern[] {
        return this.patterns;
    }

    getItemText(pattern: Pattern): string {
        return this.formatPatternName(pattern.name);
    }

    renderSuggestion(match: FuzzyMatch<Pattern>, el: HTMLElement): void {
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

    onChooseItem(pattern: Pattern): void {
        this.onSelect(pattern);
    }
}