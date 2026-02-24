/**
 * Cloud Vision Emotion Detection — Vercel Edge Function
 *
 * Server-side only. Uses CLOUD_VISION_API_KEY (never VITE_ prefix).
 * Returns joy/sorrow/anger/surprise as 0-100 scores mapped from
 * Cloud Vision likelihood values.
 *
 * Always returns HTTP 200 — the pipeline must never fail because of Vision.
 * Set cloudVisionAvailable: false for any error/unavailable state.
 */

export const config = {
  runtime: 'edge',
  maxDuration: 30,
};

const LIKELIHOOD_SCORE = {
  VERY_UNLIKELY: 5,
  UNLIKELY: 25,
  POSSIBLE: 50,
  LIKELY: 75,
  VERY_LIKELY: 95,
  UNKNOWN: 0,
};

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: CORS_HEADERS,
    });
  }

  // Graceful: if no API key configured, return unavailable without failing
  const apiKey = process.env.CLOUD_VISION_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ cloudVisionAvailable: false }), {
      status: 200,
      headers: CORS_HEADERS,
    });
  }

  try {
    const body = await request.json();
    const imageBase64 = body?.imageBase64;

    if (!imageBase64) {
      return new Response(JSON.stringify({ cloudVisionAvailable: false }), {
        status: 200,
        headers: CORS_HEADERS,
      });
    }

    // Strip data URL prefix if present (e.g. "data:image/jpeg;base64,")
    const pureBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

    const visionRes = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: pureBase64 },
              features: [{ type: 'FACE_DETECTION', maxResults: 1 }],
            },
          ],
        }),
      }
    );

    if (!visionRes.ok) {
      console.warn('[CloudVision] API returned error:', visionRes.status);
      return new Response(JSON.stringify({ cloudVisionAvailable: false }), {
        status: 200,
        headers: CORS_HEADERS,
      });
    }

    const data = await visionRes.json();
    const face = data.responses?.[0]?.faceAnnotations?.[0];

    if (!face) {
      return new Response(
        JSON.stringify({ cloudVisionAvailable: false, noFaceDetected: true }),
        { status: 200, headers: CORS_HEADERS }
      );
    }

    return new Response(
      JSON.stringify({
        cloudVisionAvailable: true,
        joy: LIKELIHOOD_SCORE[face.joyLikelihood] ?? 0,
        sorrow: LIKELIHOOD_SCORE[face.sorrowLikelihood] ?? 0,
        anger: LIKELIHOOD_SCORE[face.angerLikelihood] ?? 0,
        surprise: LIKELIHOOD_SCORE[face.surpriseLikelihood] ?? 0,
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error('[CloudVision] Unexpected error:', error);
    return new Response(JSON.stringify({ cloudVisionAvailable: false }), {
      status: 200,
      headers: CORS_HEADERS,
    });
  }
}
