import {getFirstMicData, startMicRecording} from "./mic-handler";
import {createDetectionStream} from "./detection-stream.ts";
import {setupWakewordDetector} from "./wakeword-detector";

async function detector() {
    const detector = await setupWakewordDetector();
    const stream = startMicRecording();
    const micFirstData = await getFirstMicData(stream);

    const detectionStream = createDetectionStream(stream, micFirstData);
    detector.pipe(detectionStream);
    stream.pipe(detector);
}

export default detector;