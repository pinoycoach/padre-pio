interface InworldTTSConfig {
  apiKeyBase64: string;  // Pre-encoded Base64 key from Inworld dashboard
  voice: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// API ENDPOINT CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

// Use Vite proxy in dev, Vercel API route in production
const getInworldEndpoint = () => {
  // Check if running in local dev environment
  const isLocalDev = typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  if (isLocalDev) {
    // Local dev uses Vite proxy (configured in vite.config.ts)
    return '/inworld-api/tts/v1/voice';
  }

  // Production/Preview uses Vercel serverless function
  return '/api/inworld-tts';
};

// ─────────────────────────────────────────────────────────────────────────────
// RETRY UTILITY FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

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
      const err = error as { response?: { status?: number }; message?: string };
      const isServerError = err.response && err.response.status && err.response.status >= 500 && err.response.status < 600;
      const isNetworkError = !err.response && err.message === 'Failed to fetch';

      if (attempts >= options.maxAttempts || !(isServerError || isNetworkError)) {
        throw error;
      }
      console.warn(
        `Attempt ${attempts} failed, retrying in ${options.delayMs * Math.pow(2, attempts - 1)}ms:`,
        err.message
      );
      await new Promise((resolve) =>
        setTimeout(resolve, options.delayMs * Math.pow(2, attempts - 1))
      );
    }
  }
}

export async function generateInworldTTSAudio(
  text: string,
  emotionTags: string,
  config: InworldTTSConfig
): Promise<string> {
  // Combine emotion tags with text, but trim if needed
  let whisperText = emotionTags ? `${emotionTags} ${text}` : text;

  // Inworld TTS has a character limit - truncate if too long (safe limit ~2000 chars)
  const MAX_CHARS = 2000;
  if (whisperText.length > MAX_CHARS) {
    console.warn(`Text too long (${whisperText.length} chars), truncating to ${MAX_CHARS}`);
    whisperText = whisperText.substring(0, MAX_CHARS);
  }

  const endpoint = getInworldEndpoint();

  console.log('Inworld TTS Request:', {
    endpoint,
    voice_id: config.voice,
    textLength: whisperText.length,
    textPreview: whisperText.substring(0, 100) + '...'
  });

  const response = await retry(async () => {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${config.apiKeyBase64}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: whisperText,
        voice_id: config.voice,
        audio_config: {
          audio_encoding: 'MP3',
          speaking_rate: 1
        },
        temperature: 0.93,
        model_id: 'inworld-tts-1.5-max'
      }),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      console.error('Inworld TTS error response:', {
        status: res.status,
        statusText: res.statusText,
        body: errorBody
      });
      const error: { message: string; response?: Response } = {
        message: `Inworld TTS error: ${res.status} ${res.statusText}. Body: ${errorBody}`,
        response: res
      };
      throw error;
    }
    return res;
  }, { maxAttempts: 3, delayMs: 1000 });

  const result = await response.json();
  console.log('Inworld TTS response keys:', Object.keys(result));

  // The API returns audioContent directly at the root level (base64 encoded MP3)
  if (result.audioContent) {
    const audioLength = result.audioContent.length;
    console.log('Audio content received, base64 length:', audioLength);

    // Validate that the base64 is not empty or too small (minimum valid MP3 header ~100 bytes)
    if (audioLength < 100) {
      console.error('Audio content too small, likely invalid:', audioLength);
      throw new Error('Inworld TTS returned invalid audio (too small)');
    }

    // Validate it's valid base64
    try {
      atob(result.audioContent.substring(0, 100));
      console.log('Base64 validation passed, first bytes decoded successfully');
    } catch (e) {
      console.error('Invalid base64 in audio content:', e);
      throw new Error('Inworld TTS returned invalid base64 audio');
    }

    return result.audioContent;
  }

  // Check for alternative response formats
  if (result.audio) {
    console.log('Found audio in alternative format (result.audio)');
    return result.audio;
  }

  if (result.data?.audioContent) {
    console.log('Found audio in nested format (result.data.audioContent)');
    return result.data.audioContent;
  }

  console.error('Inworld TTS API response missing audio content:', JSON.stringify(result, null, 2));
  throw new Error(`Inworld TTS error: No audio content returned. Response keys: ${Object.keys(result).join(', ')}`);
}
