import { RealtimeTranscriber } from 'assemblyai';
import { WebSocket } from 'ws';

export class AudioHandler {
    private transcriber: RealtimeTranscriber | null = null;
    private onTranscript: (text: string, isFinal: boolean) => void;

    constructor(onTranscript: (text: string, isFinal: boolean) => void) {
        this.onTranscript = onTranscript;
    }

    async start() {
        this.transcriber = new RealtimeTranscriber({
            apiKey: process.env.ASSEMBLY_AI_API_KEY || '',
            sampleRate: 16000,
        });

        this.transcriber.on('transcript', (transcript) => {
            if (!transcript.text) return;
            this.onTranscript(transcript.text, transcript.message_type === 'FinalTranscript');
        });

        this.transcriber.on('error', (error) => {
            console.error('[AudioHandler] AssemblyAI Error:', error);
        });

        await this.transcriber.connect();
        console.log('[AudioHandler] Connected to AssemblyAI');
    }

    sendAudio(chunk: Buffer) {
        if (this.transcriber) {
            // Convert Buffer to ArrayBuffer as required by some versions of the SDK
            const arrayBuffer = chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength);
            this.transcriber.sendAudio(arrayBuffer);
        }
    }

    async stop() {
        if (this.transcriber) {
            await this.transcriber.close();
            this.transcriber = null;
        }
    }
}
