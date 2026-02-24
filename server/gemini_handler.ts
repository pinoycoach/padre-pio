import dotenv from 'dotenv';
import { SoulAnalysis } from '../types';

dotenv.config();

const INWORLD_LLM_URL = 'https://api.inworld.ai/llm/v1alpha/completions:completeChat';

const SOUL_ANALYSIS_PROMPT = `
  Analyze this prayer request or heart-sharing transcript.
  Extract the spiritual archetype and emotional intensity.
  
  Possible Archetypes:
  - The Penitent
  - The Wandering Soul
  - The Suffering Servant
  - The Scrupulous Soul
  - The Desolate Heart
  - The Grieving Soul
  - The Consoled Soul
  - The Wounded Pilgrim

  Respond with valid JSON ONLY:
  {
    "archetype": "...",
    "intensityScore": 0-100,
    "confidence": 0-100,
    "reasoning": "..."
  }
`;

export async function performSoulAnalysis(text: string): Promise<SoulAnalysis> {
  console.log('[InworldLLM] Analyzing soul for:', text.substring(0, 50) + '...');

  try {
    const response = await fetch(INWORLD_LLM_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${process.env.INWORLD_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        servingId: {
          provider: 'SERVICE_PROVIDER_GOOGLE',
          model: 'gemini-3-flash-preview'
        },
        messages: [
          { role: 'user', content: `${SOUL_ANALYSIS_PROMPT}\n\nTranscript: "${text}"` }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Inworld LLM API error: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    // The response structure for v1alpha/completeChat usually contains 'text' or 'choices'
    // Let's assume it follows a standard pattern or check for 'text'
    const responseText = result.text || result.choices?.[0]?.message?.content || '';

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      console.error('Inworld LLM Response:', result);
      throw new Error('Failed to parse JSON from Inworld LLM response');
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('Error in performSoulAnalysis:', error);
    throw error;
  }
}
