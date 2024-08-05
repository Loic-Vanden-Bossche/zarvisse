import fs from "fs";
import {openai} from "../openai/init";

export const transcribeAudio = async (): Promise<string> => {
    const filePath = 'audio.wav';

    const response = await openai.audio.transcriptions.create({
        model: 'whisper-1',
        language: 'fr',
        file: fs.createReadStream(filePath),
        response_format: 'text',
    });

    return response as unknown as string;
}