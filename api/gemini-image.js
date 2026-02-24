import { GoogleGenAI } from "@google/genai";

export const config = {
  runtime: 'edge',
  maxDuration: 60,
};

const API_TIMEOUT_MS = 60000;
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 2000;

function withTimeout(promise, timeoutMs = API_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Image generation timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

async function retryWithBackoff(fn, maxRetries = MAX_RETRIES, initialDelay = INITIAL_RETRY_DELAY_MS) {
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const errorMessage = lastError.message.toLowerCase();

      const isRetryable =
        errorMessage.includes('503') ||
        errorMessage.includes('overloaded') ||
        errorMessage.includes('rate') ||
        errorMessage.includes('busy') ||
        errorMessage.includes('unavailable') ||
        errorMessage.includes('timed out') ||
        errorMessage.includes('resource exhausted');

      if (!isRetryable || attempt >= maxRetries) {
        throw lastError;
      }

      const delay = initialDelay * Math.pow(2, attempt);
      console.warn(`API call failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms:`, errorMessage);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Unknown error in retry');
}

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
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { prompt } = await request.json();

    if (!prompt || typeof prompt !== 'string') {
      return new Response(JSON.stringify({ error: 'Invalid prompt: must be a non-empty string' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY not configured");
      return new Response(JSON.stringify({ error: 'Image generation service is not configured.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const ai = new GoogleGenAI({ apiKey });

    const sanitizedPrompt = prompt
      .trim()
      .slice(0, 1000)
      .replace(/[\x00-\x1F\x7F]/g, '');

    const enhancedPrompt = `Generate a beautiful, ethereal sanctuary image: ${sanitizedPrompt}. Style: cinematic lighting, dramatic atmosphere, peaceful and spiritual mood, 9:16 aspect ratio portrait orientation.`;

    const response = await retryWithBackoff(async () => {
        return await withTimeout(
            ai.models.generateImages({
              model: 'imagen-3.0-generate-002',
              prompt: enhancedPrompt,
              config: {
                numberOfImages: 1,
                aspectRatio: '9:16',
              },
            }),
            API_TIMEOUT_MS
        );
    });

    const generatedImages = response.generatedImages;
    if (generatedImages && generatedImages.length > 0) {
      const imageData = generatedImages[0].image;
      if (imageData?.imageBytes) {
        const base64Data = imageData.imageBytes;
        return new Response(JSON.stringify({ image: `data:image/png;base64,${base64Data}` }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
    }

    console.error('No image found in response:', JSON.stringify(response, null, 2));
    return new Response(JSON.stringify({ error: 'No image data in response' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
       },
    });

  } catch (error) {
    console.error('Image generation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    const errorStack = error instanceof Error ? error.stack : '';
    
    if (errorMessage.includes('503') || errorMessage.includes('overloaded')) {
      return new Response(JSON.stringify({ error: 'The AI service is currently busy. Please try again in a moment.' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    if (errorMessage.includes('rate') || errorMessage.includes('exhausted')) {
      return new Response(JSON.stringify({ error: 'Too many requests. Please wait a moment and try again.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    
    return new Response(JSON.stringify({ 
      error: `Failed to generate image: ${errorMessage}`,
      stack: errorStack,
     }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
