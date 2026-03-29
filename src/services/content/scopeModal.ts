import { App, Modal, Setting, TFolder } from 'obsidian';

export type ScopeType = 'current-note' | 'folder' | 'vault';

export interface ScopeSelection {
    type: ScopeType;
    folderPath?: string;
}

export class ScopeSelectionModal extends Modal {
    private result: ScopeSelection | null = null;
    private onSubmit: (result: ScopeSelection) => void;
    private selectedType: ScopeType = 'current-note';
    private selectedFolder = '';

    constructor(app: App, onSubmit: (result: ScopeSelection) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('deep-insight-scope-modal');

        contentEl.createEl('h3', { text: 'Select Processing Scope' });
        contentEl.createEl('p', {
            text: 'Choose which notes to include in the analysis.',
            cls: 'setting-item-description'
        });

        new Setting(contentEl)
            .setName('Current Note')
            .setDesc('Process only the active note')
            .addButton(btn => btn
                .setButtonText('Select')
                .setCta()
                .onClick(() => {
                    this.onSubmit({ type: 'current-note' });
                    this.close();
                }));

        // Folder selection
        const folderSetting = new Setting(contentEl)
            .setName('Specific Folder')
            .setDesc('Process all notes in a folder');

        const folders = this.getFolders();
        folderSetting.addDropdown(dropdown => {
            dropdown.addOption('', 'Select a folder...');
            for (const folder of folders) {
                dropdown.addOption(folder, folder);
            }
            dropdown.onChange(value => {
                this.selectedFolder = value;
            });
        });

        folderSetting.addButton(btn => btn
            .setButtonText('Select')
            .onClick(() => {
                if (this.selectedFolder) {
                    this.onSubmit({ type: 'folder', folderPath: this.selectedFolder });
                    this.close();
                }
            }));

        new Setting(contentEl)
            .setName('Entire Vault')
            .setDesc('Process all notes in the vault (may be slow)')
            .addButton(btn => btn
                .setButtonText('Select')
                .onClick(() => {
                    this.onSubmit({ type: 'vault' });
                    this.close();
                }));
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private getFolders(): string[] {
        const folders: string[] = [];
        const rootFolder = this.app.vault.getRoot();

        const collectFolders = (folder: TFolder, depth: number) => {
            if (depth > 3) return; // Limit depth for performance
            for (const child of folder.children) {
                if (child instanceof TFolder) {
                    folders.push(child.path);
                    collectFolders(child, depth + 1);
                }
            }
        };

        collectFolders(rootFolder, 0);
        return folders.sort();
    }
}
