import { ChatLog } from "../types/chat-log";

export const chatLogs: ChatLog[] = [
    {
        role: 'system',
        content: 'Tu es un assistant vocal. Tu dois répondre de manière succincte et précise. Ne pas donner de détails inutiles. Fais des références au moyen age à chaque fois que tu le peux.',
    }
];

export function addChatLog(role: 'user' | 'assistant', content: string) {
    chatLogs.push({ role, content });
}