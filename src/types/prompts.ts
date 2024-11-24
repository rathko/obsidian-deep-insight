export interface PromptTemplate {
    systemPrompt: string;
    userPrompt: string;
    combinationPrompt: string;
}

export interface PromptConfig {
    template: PromptTemplate;
    variables: Record<string, string>;
}