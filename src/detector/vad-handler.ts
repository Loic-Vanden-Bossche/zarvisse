// @ts-ignore
import * as VAD from 'node-vad';

export function createVadStream() {
    return VAD.default.createStream({
        mode: VAD.Mode.NORMAL,
        audioFrequency: 16000,
        debounceTime: 1000
    });
}