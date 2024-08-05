import OpenAI from 'openai';
import {ChatLog} from "../types/chat-log";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export const generateIaResponse = async (chatLogs: ChatLog[]): Promise<string | null> => {
    const completion = await openai.chat.completions.create({
        messages: chatLogs,
        model: 'gpt-4o-mini',
    });

    return completion.choices[0].message.content;
}