import { GoogleGenAI } from "@google/genai";
import { SoulAnalysis } from "../types";

export interface AudioProcessingResult {
    transcription: string;
    analysis: SoulAnalysis;
}

/**
 * Handle audio recording and processing with Gemini 3 Multimodal
 * Uses browser-side SDK for local dev, falls back to API route for production
 */
export async function processAudioWithGemini(audioBlob: Blob): Promise<AudioProcessingResult> {
    const base64 = await blobToBase64(audioBlob);
    const mimeType = audioBlob.type || 'audio/webm';

    // Try API route first (works on Vercel)
    try {
        const response = await fetch('/api/process-audio', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                audioBase64: base64,
                mimeType
            }),
        });

        if (response.ok) {
            return await response.json();
        }

        // If 404, fall through to browser-side processing
        if (response.status !== 404) {
            const text = await response.text();
            console.error(`[AudioService] API Error ${response.status}:`, text);
            throw new Error(`API Error ${response.status}`);
        }
    } catch (err: any) {
        // Network error or 404 - try browser-side
        if (!err.message?.includes('404') && !err.message?.includes('Failed to fetch')) {
            throw err;
        }
    }

    // Browser-side fallback for local development
    console.log('[AudioService] Using browser-side Gemini processing...');
    return processAudioBrowserSide(base64, mimeType);
}

/**
 * Browser-side Gemini processing (for local dev without Vercel)
 */
async function processAudioBrowserSide(audioBase64: string, mimeType: string): Promise<AudioProcessingResult> {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error('VITE_GEMINI_API_KEY not configured');
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `
      Analyze this audio of a person speaking a prayer request or sharing their heart.
      Extract two things:
      1. Transcription: The literal words they said.
      2. Soul Analysis: Analyze their emotional tone and map it to one of these spiritual archetypes:
         - Burdened Ruler
         - Lost Child
         - Wounded Healer
         - Silent Storm
         - Anxious Achiever
         - Faithful Doubter
         - Joyful Servant
         - Weary Warrior

      Respond with valid JSON only:
      {
        "transcription": "...",
        "analysis": {
          "archetype": "...",
          "intensityScore": 0-100,
          "confidence": 0-100,
          "reasoning": "..."
        }
      }
    `;

    // Extract pure base64 (remove data URL prefix)
    const pureBase64 = audioBase64.includes(',') ? audioBase64.split(',')[1] : audioBase64;

    console.log('[AudioService] Calling Gemini 3 from browser...');
    const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
            {
                inlineData: {
                    mimeType,
                    data: pureBase64
                }
            },
            { text: prompt }
        ]
    });

    const responseText = result.text;
    console.log('[AudioService] Gemini response:', responseText);

    const jsonMatch = responseText?.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        throw new Error("Failed to parse JSON from Gemini response");
    }

    return JSON.parse(jsonMatch[0]);
}

/**
 * Helper to convert Blob to base64
 */
function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = reader.result as string;
            resolve(base64String);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/**
 * Hook-like recording utility with Silence Detection (VAD)
 */
export function createAudioRecorder() {
    let mediaRecorder: MediaRecorder | null = null;
    let chunks: Blob[] = [];
    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let silenceTimeout: number | null = null;
    const SILENCE_THRESHOLD = 0.005; // More sensitive (0.0 - 1.0)
    const SILENCE_DURATION = 3500; // 3.5 seconds of silence triggers auto-stop
    let startTime = 0;

    return {
        start: async (onSilence: () => void) => {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            chunks = [];
            startTime = Date.now();

            // Setup silence detection
            audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const source = audioContext.createMediaStreamSource(stream);
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);

            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Float32Array(bufferLength);

            const checkSilence = () => {
                if (!analyser || !mediaRecorder || mediaRecorder.state !== 'recording') return;

                // Ignore first second to allow user to react
                if (Date.now() - startTime < 1000) {
                    requestAnimationFrame(checkSilence);
                    return;
                }

                analyser.getFloatTimeDomainData(dataArray);
                let sumSquares = 0.0;
                for (const amplitude of dataArray) {
                    sumSquares += amplitude * amplitude;
                }
                const volume = Math.sqrt(sumSquares / dataArray.length);

                if (volume < SILENCE_THRESHOLD) {
                    if (silenceTimeout === null) {
                        silenceTimeout = window.setTimeout(() => {
                            console.log('Silence detected, auto-stopping...');
                            onSilence();
                        }, SILENCE_DURATION);
                    }
                } else {
                    if (silenceTimeout !== null) {
                        window.clearTimeout(silenceTimeout);
                        silenceTimeout = null;
                    }
                }

                requestAnimationFrame(checkSilence);
            };

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunks.push(e.data);
            };

            mediaRecorder.start();
            checkSilence();
        },
        getStream: () => mediaRecorder?.stream,
        stop: (): Promise<Blob> => {
            return new Promise((resolve) => {
                if (!mediaRecorder) return resolve(new Blob([]));

                if (silenceTimeout !== null) {
                    window.clearTimeout(silenceTimeout);
                    silenceTimeout = null;
                }

                mediaRecorder.onstop = () => {
                    const blob = new Blob(chunks, { type: mediaRecorder?.mimeType || 'audio/webm' });
                    mediaRecorder?.stream.getTracks().forEach(track => track.stop());
                    if (audioContext && audioContext.state !== 'closed') {
                        audioContext.close();
                    }
                    resolve(blob);
                };

                if (mediaRecorder.state !== 'inactive') {
                    mediaRecorder.stop();
                }
            });
        }
    };
}
