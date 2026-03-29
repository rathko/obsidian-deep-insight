import { Vault, TFile } from "obsidian";

export class PromptManager {
    static async loadPromptTemplate(
        vault: Vault,
        path: string,
        defaultPrompt: string,
        includeUserContext: boolean = true // Add parameter
    ): Promise<string> {
        try {
            if (!path) {
                return includeUserContext ? defaultPrompt : '';
            }

            const file = vault.getAbstractFileByPath(path);
            if (!(file instanceof TFile)) {
                return includeUserContext ? defaultPrompt : '';
            }

            const content = await vault.cachedRead(file);
            return includeUserContext ? content : '';
        } catch (error) {
            console.warn('Failed to load prompt template:', error);
            return includeUserContext ? defaultPrompt : '';
        }
    }
}