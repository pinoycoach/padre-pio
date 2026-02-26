/**
 * ElevenLabs TTS — Vercel Edge Function
 *
 * Calls ElevenLabs text-to-speech API server-side.
 * API key and voice ID are never exposed to the client bundle.
 *
 * Required Vercel env vars (set in dashboard, NOT in .env with VITE_ prefix):
 *   ELEVENLABS_API_KEY   — ElevenLabs secret key (sk_...)
 *   ELEVENLABS_VOICE_ID  — Voice ID from ElevenLabs Voice Library
 *
 * Returns: { audioContent: string } — base64-encoded MP3
 */

export const config = {
  runtime: 'edge',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;

  if (!apiKey || !voiceId) {
    console.error('[ElevenLabs] Missing env vars: ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID');
    return new Response(JSON.stringify({ error: 'TTS not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  const text = body?.text;
  if (!text || typeof text !== 'string') {
    return new Response(JSON.stringify({ error: 'Missing text field' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }

  try {
    const elevenRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.75,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!elevenRes.ok) {
      const errorText = await elevenRes.text();
      console.error('[ElevenLabs] API error:', elevenRes.status, errorText);
      return new Response(JSON.stringify({ error: 'ElevenLabs API error', status: elevenRes.status }), {
        status: elevenRes.status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    // Convert binary MP3 response to base64
    const audioBuffer = await elevenRes.arrayBuffer();
    const audioBytes = new Uint8Array(audioBuffer);

    // btoa works on binary strings; encode Uint8Array → binary string first
    let binary = '';
    for (let i = 0; i < audioBytes.length; i++) {
      binary += String.fromCharCode(audioBytes[i]);
    }
    const audioBase64 = btoa(binary);

    console.log('[ElevenLabs] Audio generated, base64 length:', audioBase64.length);

    return new Response(JSON.stringify({ audioContent: audioBase64 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  } catch (error) {
    console.error('[ElevenLabs] Unexpected error:', error);
    return new Response(JSON.stringify({ error: 'Proxy error', message: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
}
