import {PassThrough, Readable} from "stream";
import Speaker from "speaker";
import ffmpeg from "fluent-ffmpeg";

export async function playAudioStream(stream: Readable) {
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
            .audioFilters('volume=10')
            .pipe(passthrough);

        passthrough.pipe(speaker);

        speaker.on('close', () => resolve());
    });
}