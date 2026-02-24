// Using fetch directly for Edge compatibility (no SDK needed)

export const config = {
  runtime: 'edge',
  maxDuration: 60,
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
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { audioBase64, mimeType = 'audio/webm' } = await request.json();

    if (!audioBase64) {
      return new Response(JSON.stringify({ error: 'Missing audio data' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Gemini API key not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const prompt = `
      Analyze this audio of a person speaking a prayer request or sharing their heart.
      Extract two things:
      1. Transcription: The literal words they said.
      2. Soul Analysis: Analyze their emotional tone and map it to one of these spiritual archetypes:
         - The Penitent
         - The Wandering Soul
         - The Suffering Servant
         - The Scrupulous Soul
         - The Desolate Heart
         - The Grieving Soul
         - The Consoled Soul
         - The Wounded Pilgrim

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

    // Extract the pure base64 data (remove data URL prefix if present)
    const pureBase64 = audioBase64.includes(',') ? audioBase64.split(',')[1] : audioBase64;

    console.log('[Backend] Calling Gemini 3 API via REST...');

    // Retry logic for API busy (503) and rate limit (429) errors
    const MAX_RETRIES = 3;
    let geminiResponse;
    let lastError;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: pureBase64
                  }
                },
                { text: prompt }
              ]
            }]
          })
        }
      );

      // Success - break out of retry loop
      if (geminiResponse.ok) {
        break;
      }

      // Check if it's a retryable error (503 Service Unavailable or 429 Rate Limit)
      if ((geminiResponse.status === 503 || geminiResponse.status === 429) && attempt < MAX_RETRIES - 1) {
        const waitTime = 1000 * Math.pow(2, attempt); // Exponential backoff: 1s, 2s, 4s
        console.log(`[Backend] API busy (${geminiResponse.status}). Retrying in ${waitTime}ms... (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await new Promise(r => setTimeout(r, waitTime));
        continue;
      }

      // Non-retryable error or max retries reached
      const errorText = await geminiResponse.text();
      console.error('[Backend] Gemini API error:', geminiResponse.status, errorText);
      lastError = new Error(`Gemini API error: ${geminiResponse.status}`);
    }

    if (!geminiResponse.ok) {
      throw lastError || new Error('Gemini API request failed after retries');
    }

    const geminiResult = await geminiResponse.json();
    const responseText = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text;

    console.log('[Backend] Gemini raw response:', responseText);

    if (!responseText) {
      throw new Error("No response from Gemini");
    }

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[Backend] Failed to find JSON in response:', responseText);
      throw new Error("Failed to parse JSON from Gemini response");
    }

    return new Response(jsonMatch[0], {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    console.error('Audio processing error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
