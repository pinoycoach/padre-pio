/**
 * ElevenLabs TTS Service
 *
 * Replaces Inworld TTS (Luna, female) with a male contemplative voice.
 * API key and voice ID are handled server-side in api/elevenlabs-tts.js —
 * never exposed in the client bundle.
 *
 * Required env vars (Vercel dashboard, NOT VITE_ prefix):
 *   ELEVENLABS_API_KEY   — ElevenLabs secret key
 *   ELEVENLABS_VOICE_ID  — Voice ID from ElevenLabs Voice Library
 *
 * For local dev: TTS will fail gracefully (App.tsx shows text-only prayer).
 * To test locally, use `vercel dev` so edge functions run.
 */

const MAX_CHARS = 5000;

async function retry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts: number; delayMs: number }
): Promise<T> {
  let attempts = 0;
  while (true) {
    try {
      return await fn();
    } catch (error: unknown) {
      attempts++;
      const err = error as { status?: number; message?: string };
      const isRetryable = err.status !== undefined
        ? err.status >= 500
        : err.message === 'Failed to fetch';

      if (attempts >= options.maxAttempts || !isRetryable) {
        throw error;
      }
      console.warn(
        `[ElevenLabs] Attempt ${attempts} failed, retrying in ${options.delayMs * Math.pow(2, attempts - 1)}ms`
      );
      await new Promise(resolve =>
        setTimeout(resolve, options.delayMs * Math.pow(2, attempts - 1))
      );
    }
  }
}

/**
 * Generate TTS audio via ElevenLabs.
 * Returns base64-encoded MP3 string (same format as the previous Inworld service).
 */
export async function generateElevenLabsTTSAudio(text: string): Promise<string> {
  let ttsText = text;
  if (ttsText.length > MAX_CHARS) {
    console.warn(`[ElevenLabs] Text too long (${ttsText.length} chars), truncating to ${MAX_CHARS}`);
    ttsText = ttsText.substring(0, MAX_CHARS);
  }

  console.log('[ElevenLabs] TTS request:', {
    textLength: ttsText.length,
    textPreview: ttsText.substring(0, 100) + (ttsText.length > 100 ? '...' : ''),
  });

  const audioBase64 = await retry(async () => {
    const res = await fetch('/api/elevenlabs-tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: ttsText }),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      console.error('[ElevenLabs] API error:', { status: res.status, body: errorBody });
      const err = { message: `ElevenLabs TTS error: ${res.status} ${res.statusText}`, status: res.status };
      throw err;
    }

    const result = await res.json();

    if (!result.audioContent) {
      console.error('[ElevenLabs] Missing audioContent in response:', Object.keys(result));
      throw new Error('ElevenLabs TTS: no audioContent in response');
    }

    return result.audioContent as string;
  }, { maxAttempts: 3, delayMs: 1000 });

  if (audioBase64.length < 100) {
    throw new Error('ElevenLabs TTS returned invalid audio (too small)');
  }

  console.log('[ElevenLabs] Audio received, base64 length:', audioBase64.length);
  return audioBase64;
}
