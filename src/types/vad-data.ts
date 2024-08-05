export interface VadData {
    time: number;
    audioData: Buffer;
    speech: {
        state: boolean;
        start: boolean;
        end: boolean;
        startTime: number;
        duration: number;
    };
}
