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
    }

    getItems(): Pattern[] {
        return this.patterns;
    }

    getItemText(pattern: Pattern): string {
        return pattern.name;
    }

    renderSuggestion(match: FuzzyMatch<Pattern>, el: HTMLElement): void {
        const pattern = match.item;
        el.createEl('div', { text: pattern.name });
        if (pattern.type === 'folder') {
            el.createEl('small', { 
                text: 'Pattern',
                cls: 'pattern-type'
            });
        }
    }

    onChooseItem(pattern: Pattern): void {
        this.onSelect(pattern);
    }
}