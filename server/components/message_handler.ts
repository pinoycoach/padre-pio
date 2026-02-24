import { WebSocket } from 'ws';
import { AudioHandler } from './audio_handler';
import { createInworldGraph } from './graph.mjs';
import { performSoulAnalysis } from '../gemini_handler';

export class MessageHandler {
    private ws: WebSocket;
    private audioHandler: AudioHandler;
    private graphInstance: any;
    private inputs: any;
    private outputs: any;

    constructor(ws: WebSocket) {
        this.ws = ws;
    }

    async init() {
        // 1. Setup Inworld Graph
        const { graph, inputs, outputs } = await createInworldGraph();
        this.graphInstance = graph;
        this.inputs = inputs;
        this.outputs = outputs;

        // 2. Setup Audio Handler (STT)
        this.audioHandler = new AudioHandler(async (text, isFinal) => {
            // Send live transcript to client
            this.ws.send(JSON.stringify({
                type: isFinal ? 'final_transcript' : 'live_transcript',
                text
            }));

            // If final, send to Inworld Graph AND perform soul analysis
            if (isFinal) {
                this.inputs.text.send(text);

                try {
                    const analysis = await performSoulAnalysis(text);
                    this.ws.send(JSON.stringify({
                        type: 'soul_analysis_result',
                        transcription: text,
                        analysis
                    }));
                } catch (err) {
                    console.error('[MessageHandler] Soul Analysis Error:', err);
                }
            }
        });

        // 3. Handle Graph Outputs (LLM Text & TTS Audio)
        this.outputs.text.on((text: string) => {
            this.ws.send(JSON.stringify({ type: 'agent_text', text }));
        });

        this.outputs.audio.on((audio: Uint8Array) => {
            // Send binary audio data to client
            this.ws.send(Buffer.from(audio));
        });
    }

    async handleMessage(data: any) {
        try {
            if (Buffer.isBuffer(data)) {
                this.audioHandler.sendAudio(data);
                return;
            }

            const message = JSON.parse(data.toString());
            switch (message.type) {
                case 'start_recording':
                    await this.audioHandler.start();
                    break;
                case 'stop_recording':
                    await this.audioHandler.stop();
                    break;
                case 'text_input':
                    // Optional: handle direct text chat
                    // this.inputs.text.send(message.text);
                    break;
            }
        } catch (err) {
            console.error('[MessageHandler] Error:', err);
        }
    }

    async cleanup() {
        await this.audioHandler.stop();
    }
}
