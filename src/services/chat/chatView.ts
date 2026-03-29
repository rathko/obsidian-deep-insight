import { ItemView, WorkspaceLeaf, Notice, setIcon } from 'obsidian';
import { AIMessage, AIProvider, AIResponse } from '../ai/types';
import { ErrorHandler } from '../error/handler';

export const VIEW_TYPE_CHAT = 'deep-insight-chat';

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}

export class ChatView extends ItemView {
    private messages: ChatMessage[] = [];
    private messageContainer!: HTMLElement;
    private inputEl!: HTMLTextAreaElement;
    private sendButton!: HTMLButtonElement;
    private isProcessing = false;
    private provider: AIProvider | undefined;
    private systemPrompt = '';
    private onStatusUpdate: (status: string) => void = () => {};

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType(): string {
        return VIEW_TYPE_CHAT;
    }

    getDisplayText(): string {
        return 'Deep Insight Chat';
    }

    getIcon(): string {
        return 'message-square';
    }

    setProvider(provider: AIProvider | undefined): void {
        this.provider = provider;
    }

    setSystemPrompt(prompt: string): void {
        this.systemPrompt = prompt;
    }

    setStatusCallback(callback: (status: string) => void): void {
        this.onStatusUpdate = callback;
    }

    async onOpen(): Promise<void> {
        const container = this.contentEl;
        container.empty();
        container.addClass('deep-insight-chat-container');

        // Header
        const header = container.createDiv({ cls: 'deep-insight-chat-header' });
        header.createEl('span', { text: 'Deep Insight Chat', cls: 'deep-insight-chat-title' });

        const clearBtn = header.createEl('button', { cls: 'deep-insight-chat-clear-btn' });
        setIcon(clearBtn, 'trash-2');
        clearBtn.setAttribute('aria-label', 'Clear chat');
        clearBtn.addEventListener('click', () => this.clearChat());

        // Message area
        this.messageContainer = container.createDiv({ cls: 'deep-insight-chat-messages' });

        // Show welcome message
        this.addWelcomeMessage();

        // Input area
        const inputContainer = container.createDiv({ cls: 'deep-insight-chat-input-container' });

        this.inputEl = inputContainer.createEl('textarea', {
            cls: 'deep-insight-chat-input',
            attr: { placeholder: 'Ask about your notes...', rows: '3' }
        });

        this.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        const buttonRow = inputContainer.createDiv({ cls: 'deep-insight-chat-button-row' });

        this.sendButton = buttonRow.createEl('button', {
            text: 'Send',
            cls: 'deep-insight-chat-send-btn'
        });
        this.sendButton.addEventListener('click', () => this.sendMessage());
    }

    async onClose(): Promise<void> {
        this.contentEl.empty();
    }

    private addWelcomeMessage(): void {
        const welcome = this.messageContainer.createDiv({ cls: 'deep-insight-chat-welcome' });
        welcome.createEl('p', { text: 'Ask questions about your vault, get insights from your notes, or analyze specific content.' });
        welcome.createEl('p', { text: 'Try: "What are the key themes in my recent notes?" or "Summarize my project notes"', cls: 'deep-insight-chat-hint' });
    }

    private async sendMessage(): Promise<void> {
        const content = this.inputEl.value.trim();
        if (!content || this.isProcessing) return;

        if (!this.provider) {
            new Notice('Please configure an AI provider in Deep Insight settings');
            return;
        }

        // Add user message
        this.addMessage({ role: 'user', content, timestamp: Date.now() });
        this.inputEl.value = '';
        this.inputEl.focus();

        // Process
        this.isProcessing = true;
        this.sendButton.disabled = true;
        this.sendButton.textContent = 'Thinking...';
        this.onStatusUpdate('Processing...');

        const typingEl = this.showTypingIndicator();

        try {
            const messages: AIMessage[] = [];

            if (this.systemPrompt) {
                messages.push({ role: 'system', content: this.systemPrompt });
            }

            // Include recent conversation context (last 10 messages)
            const recentMessages = this.messages.slice(-10);
            for (const msg of recentMessages) {
                messages.push({ role: msg.role, content: msg.content });
            }

            let response: AIResponse;

            // Always use non-streaming requestUrl (CORS-safe in Obsidian)
            // fetch() streaming is blocked by CORS for remote APIs in Electron
            response = await this.provider.generateResponse(messages);
            typingEl.remove();
            this.addMessage({ role: 'assistant', content: response.content, timestamp: Date.now() });

            if (response.usage) {
                this.onStatusUpdate(`Tokens: ${response.usage.inputTokens + response.usage.outputTokens}`);
            } else {
                this.onStatusUpdate('Ready');
            }
        } catch (error) {
            typingEl.remove();
            ErrorHandler.handle(error);
            const displayMsg = error instanceof Error ? error.message : 'Unknown error occurred';
            this.addErrorMessage(displayMsg);
            this.onStatusUpdate('Error');
        } finally {
            this.isProcessing = false;
            this.sendButton.disabled = false;
            this.sendButton.textContent = 'Send';
        }
    }

    private addMessage(message: ChatMessage): void {
        this.messages.push(message);

        // Remove welcome message if present
        const welcome = this.messageContainer.querySelector('.deep-insight-chat-welcome');
        if (welcome) welcome.remove();

        const msgEl = this.messageContainer.createDiv({
            cls: `deep-insight-chat-message deep-insight-chat-message-${message.role}`
        });

        const roleLabel = msgEl.createDiv({ cls: 'deep-insight-chat-message-role' });
        roleLabel.textContent = message.role === 'user' ? 'You' : 'AI';

        const contentEl = msgEl.createDiv({ cls: 'deep-insight-chat-message-content' });
        contentEl.textContent = message.content;

        this.scrollToBottom();
    }

    private addErrorMessage(text: string): void {
        const msgEl = this.messageContainer.createDiv({
            cls: 'deep-insight-chat-message deep-insight-chat-message-error'
        });
        msgEl.textContent = text;
        this.scrollToBottom();
    }

    private showTypingIndicator(): HTMLElement {
        const el = this.messageContainer.createDiv({ cls: 'deep-insight-chat-typing' });
        el.createEl('span', { text: 'Thinking' });
        el.createEl('span', { cls: 'deep-insight-chat-typing-dots', text: '...' });
        this.scrollToBottom();
        return el;
    }

    private scrollToBottom(): void {
        this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
    }

    private clearChat(): void {
        this.messages = [];
        this.messageContainer.empty();
        this.addWelcomeMessage();
        this.onStatusUpdate('Ready');
    }
}
