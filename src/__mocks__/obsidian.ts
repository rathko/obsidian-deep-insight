// Minimal Obsidian mock for unit tests
export class Notice {
    constructor(public message: string, public timeout?: number) {}
}

export class Plugin {}
export class Modal {
    app: unknown;
    contentEl = { empty: () => {}, createEl: () => ({}), createDiv: () => ({}), addClass: () => {} };
    constructor(app: unknown) { this.app = app; }
    open() {}
    close() {}
}
export class Setting {
    constructor(_el: unknown) {}
    setName() { return this; }
    setDesc() { return this; }
    addToggle() { return this; }
    addText() { return this; }
    addButton() { return this; }
    addDropdown() { return this; }
}
export class ItemView {
    contentEl = { empty: () => {}, createEl: () => ({}), createDiv: () => ({}), addClass: () => {} };
    constructor(_leaf: unknown) {}
    getViewType() { return ''; }
    getDisplayText() { return ''; }
}
export class MarkdownView {}
export class TFile { path = ''; basename = ''; name = ''; }
export class TFolder { path = ''; children: unknown[] = []; }
export class TAbstractFile { path = ''; }
export class SuggestModal { constructor(_app: unknown) {} }
export class PluginSettingTab { constructor(_app: unknown, _plugin: unknown) {} }

export function normalizePath(path: string) { return path; }
export function setIcon(_el: unknown, _icon: string) {}
export function requestUrl(_options: unknown) { return Promise.resolve({ status: 200, text: '{}' }); }

export type WorkspaceLeaf = unknown;
export type Vault = unknown;
export type App = unknown;
export type Editor = unknown;
export type DropdownComponent = unknown;
export type RequestUrlResponse = { status: number; text: string; headers: Record<string, string> };
