import { TAbstractFile } from "obsidian";

export interface PromptTemplate {
    systemPrompt: string;
    userPrompt: string;
}

export interface PromptConfig {
    template: PromptTemplate;
    variables: Record<string, string>;
}
