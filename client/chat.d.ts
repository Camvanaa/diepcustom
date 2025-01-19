export class ChatSystem {
    constructor();
    messages: any[];
    chatBox: HTMLDivElement | null;
    chatInput: HTMLInputElement | null;
    init(): void;
    sendMessage(text: string): void;
    addMessage(sender: string, text: string): void;
} 