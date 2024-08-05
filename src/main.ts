import OpenAI from "openai";
import { Readable, PassThrough } from "stream";
import Speaker from "speaker";
import ffmpeg from "fluent-ffmpeg";
import * as fs from "node:fs";
import Mic from "node-microphone";
import { Writable } from "node:stream";

import { BuiltinKeyword, Porcupine } from "@picovoice/porcupine-node";

const accessKey = process.env.PICOVOICE_ACCESS_KEY;

if (accessKey == null) {
  console.error("PICOVOICE_ACCESS_KEY environment variable is not set.");
  process.exit(1);
}

const handle = new Porcupine(
  accessKey,
  [BuiltinKeyword.OK_GOOGLE],
  [0.5]
);

interface ChatLog {
  role: "user" | "assistant" | "system";
  content: string;
}

const chatLogs: ChatLog[] = [
  {
    role: "system",
    content: "Répond de manière succincte et précise. Ne pas donner de détails inutiles. Finis tes phrases par 'la prochaine fois t'iras sur internet connard'",
  }
];

const SILENCE_THRESHOLD = 0.2;
const SILENCE_DURATION = 800;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

async function detectEndOfSpeechAndProcess() {
  const mic = new Mic();
  const micStream = mic.startRecording();
  const audioStream = new PassThrough();
  let endTimeout: NodeJS.Timeout | null = null;
  let recordingStopped = false;
  let audioRecorded = false;

  let lastSilenceBuffered: Buffer | null = null;

  const stopRecording = () => {
    if (!recordingStopped) {
      recordingStopped = true;
      mic.stopRecording();
      audioStream.end();
      console.log("Stopped recording due to silence.");
    }
  };

  const sampleSize = 512;
  const sampleRate = 16000;
  const tone = 500;

  const sin500Hz = new Float32Array(sampleSize);
  const cos500Hz = new Float32Array(sampleSize);
  const normalizationFactor = 1 / Math.sqrt(sampleSize);

  for (let i = 0; i < sampleSize; i++) {
    const angle = 2 * Math.PI * tone / sampleRate * i;
    sin500Hz[i] = Math.sin(angle) * normalizationFactor;
    cos500Hz[i] = Math.cos(angle) * normalizationFactor;
  }

  function noiseLevel(inputSamples: Float32Array) {
    let power = 0;
    let average = 0;

    for (let i = 0; i < sampleSize; i++) {
      average += inputSamples[i];
    }
    average /= sampleSize;

    for (let i = 0; i < sampleSize; i++) {
      power += Math.pow(inputSamples[i] - average, 2);
    }

    return Math.sqrt(power);
  }

  let index = 0;

  const silenceDetectionStream = new Writable({
    highWaterMark: sampleSize,
    write(chunk, encoding, callback) {
      const inputSamples = new Float32Array(sampleSize);
      for (let i = 0; i < sampleSize; i++) {
        inputSamples[i] = chunk.readInt16LE(i * 2) / 32768;
      }

      const keywordIndex = handle.process(
        Int16Array.from(inputSamples.map((x) => x * 32768))
      );

      console.log(keywordIndex)

      if (keywordIndex !== -1) {
        console.log("Keyword detected");
        // stopRecording();
        return;
      }

      const noise = noiseLevel(inputSamples);

      index++;

      if (index == 1) {
        console.log("Started recording");
        audioStream.write(chunk, encoding, callback);
        return;
      }

      if (noise > SILENCE_THRESHOLD) {
        console.log("Detected noise");

        audioRecorded = true;

        if (lastSilenceBuffered != null) {
          audioStream.write(lastSilenceBuffered, encoding);
          lastSilenceBuffered = null;
        }

        audioStream.write(chunk, encoding, callback);

        if (endTimeout != null) {
          clearTimeout(endTimeout);
          endTimeout = null;
        }
      } else {
        lastSilenceBuffered = chunk;

        if (audioRecorded) {
          // endTimeout = setTimeout(stopRecording, SILENCE_DURATION);
        }

        callback();
      }
    }
  });

  micStream.pipe(silenceDetectionStream);

  micStream.on('error', (error) => {
    console.error("Microphone error:", error);
  });

  const file = fs.createWriteStream("audio.wav", {flags: 'w'});

  audioStream.pipe(file);

  audioStream.on('error', (error) => {
    console.error("Audio stream error:", error);
  });

  await new Promise<void>((resolve) => {
    audioStream.on('end', resolve);
  });

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
      voice: "onyx",
      input: iaResponse,
    });

    chatLogs.push({ role: "assistant", content: iaResponse });

    const stream = response.body as unknown as Readable;

    if (stream != null) {
      await playAudioStream(stream);
    }
  }
}

const generateIaResponse = async (): Promise<string | null> => {
  const completion = await openai.chat.completions.create({
    messages: chatLogs,
    model: "gpt-4o-mini",
  });

  return completion.choices[0].message.content;
}

(async () => {
  while (true) {
    await detectEndOfSpeechAndProcess();
  }
})();
