/**
 * Cloud Vision Service
 *
 * Client-side wrapper for the /api/cloud-vision Edge Function.
 * Provides objective emotion scores (joy/sorrow/anger/surprise) from Google Cloud Vision.
 * All calls go server-side — the API key never touches the browser bundle.
 *
 * Always fails gracefully: if Cloud Vision is unavailable, the pipeline continues
 * with Gemini-only analysis.
 */

export interface CloudVisionEmotions {
  joy: number;       // 0-100
  sorrow: number;    // 0-100
  anger: number;     // 0-100
  surprise: number;  // 0-100
  cloudVisionAvailable: boolean;
  noFaceDetected?: boolean;
}

const VISION_FALLBACK: CloudVisionEmotions = {
  joy: 0,
  sorrow: 0,
  anger: 0,
  surprise: 0,
  cloudVisionAvailable: false,
};

/**
 * Get emotion scores from Google Cloud Vision for a face image.
 * Returns fallback (cloudVisionAvailable: false) on any error.
 */
export async function getCloudVisionEmotions(imageBase64: string): Promise<CloudVisionEmotions> {
  try {
    const response = await fetch('/api/cloud-vision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64 }),
      signal: AbortSignal.timeout(10000), // 10s max — don't hold up the Gemini pipeline
    });

    if (!response.ok) {
      console.warn('[CloudVision] HTTP error:', response.status);
      return VISION_FALLBACK;
    }

    const data = await response.json() as CloudVisionEmotions;

    if (data.cloudVisionAvailable) {
      console.log(
        `[CloudVision] joy:${data.joy} sorrow:${data.sorrow} anger:${data.anger} surprise:${data.surprise}`
      );
    } else {
      console.log('[CloudVision] unavailable');
    }

    return data;
  } catch (error) {
    console.warn('[CloudVision] Failed, proceeding without:', error);
    return VISION_FALLBACK;
  }
}
