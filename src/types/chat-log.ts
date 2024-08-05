export interface ChatLog {
    role: "user" | "assistant" | "system";
    content: string;
}