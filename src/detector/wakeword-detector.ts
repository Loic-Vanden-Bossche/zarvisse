import WakewordDetector from '@mathquis/node-personal-wakeword';
import logger from '../utils/logger';

export async function setupWakewordDetector() {
    let detector = new WakewordDetector({
        vad: false,
        threshold: 0.5 // Default value
    });

    await detector.addKeyword('zarviss', [
        './keywords/zarvisse1.wav',
        './keywords/zarvisse2.wav',
        './keywords/zarvisse3.wav'
    ], {
        disableAveraging: true,
        threshold: 0.52
    });

    detector.enableKeyword('zarviss');

    detector.on('ready', () => {
        logger.info('Listening for wakeword...');
    });

    return detector;
}