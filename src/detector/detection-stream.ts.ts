import fs from 'fs';
import {Readable, Writable} from 'stream';
import logger from '../utils/logger';
import { VadData } from "../types/vad-data";
import { transcribeAudio } from "../audio/transcriber";
import { generateIaResponse } from '../chat/generate-response';
import { openai } from "../openai/init";
import { playAudioStream } from "../audio/player";
import { createVadStream } from './vad-handler';
import {addChatLog, chatLogs} from "../chat/chat-log";

export function createDetectionStream(stream: any, micFirstData: Buffer) {
    return new Writable({
        objectMode: true,
        write: async (_, __, done) => {
            logger.info('Wakeword detected');

            const file = fs.createWriteStream('audio.wav', { flags: 'w' });
            file.write(micFirstData);
            const fileStream = stream.pipe(file);
            const endStream = stream.pipe(createVadStream());

            endStream.on('data', (data: VadData) => {
                if (data.speech.end) {
                    logger.info('Speech ended');
                    logger.info(`Speech duration: ${data.speech.duration}ms`);
                    file.close();
                }
            });

            await new Promise<void>((resolve) => {
                file.on('close', resolve);
            });

            logger.info('Audio stream ended');
            stream.unpipe(endStream);
            stream.unpipe(file);
            fileStream.removeAllListeners();
            endStream.removeAllListeners();

            const transcription = await transcribeAudio();
            const finalTranscription = transcription.trim();

            if (finalTranscription.length === 0) {
                return;
            }

            logger.info(`Transcription: ${finalTranscription}`);
            addChatLog('user', transcription);

            const iaResponse = await generateIaResponse(chatLogs);
            if (iaResponse != null) {
                const response = await openai.audio.speech.create({
                    model: 'tts-1',
                    voice: 'alloy',
                    input: iaResponse,
                });

                addChatLog('assistant', iaResponse);
                const responseStream = response.body as unknown as Readable;
                if (responseStream != null) {
                    await playAudioStream(responseStream);
                }
            }

            done();
        }
    });
}