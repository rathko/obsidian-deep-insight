export class PromptManager {
    static async loadPromptTemplate(
        vault: Vault,
        path: string,
        defaultPrompt: string
    ): Promise<string> {
        try {
            if (!path) return defaultPrompt;

            const file = vault.getAbstractFileByPath(path);
            if (!(file instanceof TFile)) return defaultPrompt;

            return await vault.cachedRead(file);
        } catch (error) {
            console.warn('Failed to load prompt template:', error);
            return defaultPrompt;
        }
    }

    static interpolateVariables(
        template: string,
        variables: Record<string, string>
    ): string {
        return Object.entries(variables).reduce(
            (result, [key, value]) => 
                result.replace(new RegExp(`{{${key}}}`, 'g'), value),
            template
        );
    }
}