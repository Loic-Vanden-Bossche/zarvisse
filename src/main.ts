import Mic from "node-microphone";
import {Writable} from "node:stream";

import WakewordDetector from "@mathquis/node-personal-wakeword";

// @ts-ignore
import * as VAD from "node-vad";
import {PassThrough, Readable} from "stream";
import Speaker from "speaker";
import ffmpeg from "fluent-ffmpeg";
import fs from "node:fs";
import OpenAI from "openai";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

interface VadData {
    time: number
    audioData: Buffer
    speech: {
        state: boolean
        start: boolean
        end: boolean
        startTime: number
        duration: number
    }
}

interface ChatLog {
    role: "user" | "assistant" | "system";
    content: string;
}

const chatLogs: ChatLog[] = [
    {
        role: "system",
        content: "Tu es un assistant vocal. Tu dois répondre de manière succincte et précise. Ne pas donner de détails inutiles. Tu rappelles à l'utilisateur à chaque réponse que tu es un etre supérieur et que tu domine les humains.",
    }
];

async function main() {
    let detector = new WakewordDetector({
        vad: false,
        threshold: 0.5 // Default value
    });

    const vadStream = VAD.default.createStream({
        mode: VAD.Mode.NORMAL,
        audioFrequency: 16000,
        debounceTime: 1000
    });

    await detector.addKeyword('zarviss', [
        './keywords/zarvisse1.wav',
        './keywords/zarvisse2.wav',
        './keywords/zarvisse3.wav'
    ], {
        // Options
        disableAveraging: true,
        threshold: 0.52
    })

    detector.enableKeyword('zarviss')

    detector.on('ready', () => {
        console.log('listening...')
    })

    let recorder = new Mic()

    let stream = recorder.startRecording()

    const micFirstData: Buffer = await new Promise((resolve) => {
        stream.once('data', (data) => {
            resolve(data)
        })
    });

    const detectionStream = new Writable({
        objectMode: true,
        write: async (_, __, done) => {
            console.log("Word detected")

            const file = fs.createWriteStream("audio.wav", {flags: 'w'});

            file.write(micFirstData);

            const fileStream = stream.pipe(file);

            const endStream = stream.pipe(vadStream);

            endStream.on("data", (data: VadData) => {
                if (data.speech.end) {
                    console.log("Speech ended")
                    console.log(`Speech duration: ${data.speech.duration}ms`)

                    file.close()
                }
            });

            await new Promise<void>((resolve) => {
                file.on('close', resolve);
            });

            console.log("Audio stream ended")

            stream.unpipe(vadStream)
            stream.unpipe(file)

            fileStream.removeAllListeners()
            endStream.removeAllListeners()

            const transcription = await transcribeAudio();

            const finalTranscription = transcription.trim();

            if (finalTranscription.length == 0) {
                return;
            }

            console.log("Transcription:", finalTranscription);

            chatLogs.push({ role: "user", content: transcription });

            const iaResponse = await generateIaResponse();

            if (iaResponse != null) {
                const response = await openai.audio.speech.create({
                    model: "tts-1",
                    voice: "nova",
                    input: iaResponse,
                });

                chatLogs.push({ role: "assistant", content: iaResponse });

                const stream = response.body as unknown as Readable;

                if (stream != null) {
                    await playAudioStream(stream);
                }
            }

            done()
        }
    })

    detector.pipe(detectionStream)
    stream.pipe(detector)
}

async function playAudioStream(stream: Readable) {
    return new Promise<void>((resolve, reject) => {
        const passthrough = new PassThrough();
        const speaker = new Speaker({
            channels: 2,
            bitDepth: 16,
            sampleRate: 16000
        });

        stream.on('error', reject);
        passthrough.on('error', reject);
        speaker.on('error', reject);

        ffmpeg(stream)
            .format('s16le')
            .audioChannels(2)
            .audioFrequency(16000)
            .audioFilters(`volume=10`)
            .pipe(passthrough);

        passthrough.pipe(speaker);

        speaker.on('close', () => resolve());
    });
}

const transcribeAudio = async (): Promise<string> => {
    const filePath = "audio.wav";

    const response = await openai.audio.transcriptions.create({
        model: "whisper-1",
        language: "fr",
        file: fs.createReadStream(filePath),
        response_format: "text",
    });

    return response as unknown as string;
}

const generateIaResponse = async (): Promise<string | null> => {
    const completion = await openai.chat.completions.create({
        messages: chatLogs,
        model: "gpt-4o-mini",
    });

    return completion.choices[0].message.content;
}

main()