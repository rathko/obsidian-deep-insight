import { Plugin, TAbstractFile, Menu } from 'obsidian';

export class ContextMenuManager {    
    private fileMenuEvent: ((menu: Menu, file: TAbstractFile) => void) | null = null;
    private editorMenuEvent: ((menu: Menu) => void) | null = null;
    
    constructor(private plugin: Plugin) {}

    register(callback: (file: TAbstractFile) => void): void {
        this.unregister();

        // Create file explorer menu handler
        this.fileMenuEvent = (menu: Menu, file: TAbstractFile) => {
            menu.addSeparator();
            menu.addItem((item) => {
                item
                    .setTitle('Deep Insight: Run Pattern')
                    .setIcon('sparkles')
                    .onClick(() => callback(file));
            });
        };

        // Create editor menu handler
        this.editorMenuEvent = (menu: Menu) => {
            const file = this.plugin.app.workspace.getActiveFile();
            if (!file) {
                return;
            }

            menu.addSeparator();
            menu.addItem((item) => {
                item
                    .setTitle('Deep Insight: Run Pattern')
                    .setIcon('sparkles')
                    .onClick(() => callback(file));
            });
        };

        if (this.fileMenuEvent) {
            this.plugin.registerEvent(
                this.plugin.app.workspace.on('file-menu', this.fileMenuEvent)
            );
        }
        
        if (this.editorMenuEvent) {
            this.plugin.registerEvent(
                this.plugin.app.workspace.on('editor-menu', this.editorMenuEvent)
            );
        }
    }

    unregister(): void {
        if (this.fileMenuEvent) {
            this.plugin.app.workspace.off('file-menu', this.fileMenuEvent as any);
            this.fileMenuEvent = null;
        }

        if (this.editorMenuEvent) {
            this.plugin.app.workspace.off('editor-menu', this.editorMenuEvent as any);
            this.editorMenuEvent = null;
        }
    }
}