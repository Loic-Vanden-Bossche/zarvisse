import logger from './utils/logger';
import detector from "./detector";

async function main() {
    try {
        await detector();
    } catch (error) {
        logger.error(`Error initializing wakeword detector: ${error}`);
    }
}

main();