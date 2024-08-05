import Mic from 'node-microphone';

export function startMicRecording() {
    let recorder = new Mic();
    return recorder.startRecording();
}

export async function getFirstMicData(stream: any): Promise<Buffer> {
    return new Promise((resolve) => {
        stream.once('data', (data: Buffer) => {
            resolve(data);
        });
    });
}