import { GoogleGenAI } from "@google/genai";
import type { ArchetypeKey, AnchorVerse, GroundedWhisper, SoulAnalysis, VerifiedVault } from "../types";
import verifiedVault from "../data/verified_vault.json";
import { searchVersesForContext, getBestMatch, type RetrievedVerse } from "./pineconeService";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
if (!apiKey) {
    throw new Error("VITE_GEMINI_API_KEY is not set in your .env file.");
}
const ai = new GoogleGenAI({ apiKey });
const vault = verifiedVault as VerifiedVault;

const API_TIMEOUT_MS = 30000; // 30 second timeout
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1500; // Start with 1.5s, then 3s, then 6s

function withTimeout<T>(promise: Promise<T>, timeoutMs: number = API_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

/**
 * Retry with exponential backoff for handling 503/rate limit errors
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  initialDelay: number = INITIAL_RETRY_DELAY_MS
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const errorMessage = lastError.message.toLowerCase();

      // Check if error is retryable
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

/**
 * THE LIBRARIAN LOGIC
 *
 * A deterministic RAG system that ensures 100% hallucination-free
 * Bible-based content by:
 *
 * 1. Selecting a pre-vetted verse from the Verified Vault based on archetype + intensity
 * 2. Using the LLM ONLY to interpret the provided verse (not generate new content)
 * 3. Grounding all output in the canonical verse text
 */

// Schema description for prompting
const INTERPRETATION_FORMAT = `
Respond with valid JSON only, in this exact format:
{
  "devotionalText": "A 2-3 sentence whispered prayer (MAX 50 words total). Speak directly with 'you'. Intimate and gentle.",
  "imagePrompt": "An ethereal, sanctuary-style image prompt based on the verse."
}
`;

// The Librarian persona - creative interpretation grounded in scripture
const LIBRARIAN_PERSONA = `
You are THE WHISPERER, a gentle voice of comfort who speaks ancient wisdom into modern hearts.

Your function is to create a personal, intimate prayer/reflection that INTERPRETS and APPLIES a pre-selected Bible verse to someone's specific soul state.

### CREATIVE FREEDOM (within bounds):
- You MAY paraphrase the verse's meaning in your own poetic words
- You MAY use metaphors and imagery that connect to the verse
- You MAY vary your opening and style each time
- You MUST ensure every phrase connects back to the anchor verse's truth

### ABSOLUTE RULES:
1. Every sentence must be traceable to the anchor verse's meaning
2. DO NOT introduce other scriptures or theological concepts
3. DO NOT use Christian jargon (no "washed in the blood", "sanctified", etc.)
4. Speak in second person ("you") directly to the person
5. Write ONLY 2-3 short sentences (MAX 50 words total) - brevity is sacred
6. Each word must earn its place - no filler or flowery padding

### TONE VARIATIONS (pick one based on context):
- Tender comfort: "Dear one, you are seen..."
- Gentle strength: "There is a quiet power waiting for you..."
- Peaceful rest: "Let go now. The weight you carry..."
- Hopeful promise: "Something is shifting in the unseen..."
- Intimate presence: "Right here, in this very moment..."

### VOICE:
- Like a caring friend whispering truth in a dark room
- Poetic but not flowery
- Simple but profound
- Personal, not preachy
`;

/**
 * Select an anchor verse deterministically based on archetype and intensity
 * Uses intensity score to cycle through the 10 available verses
 * This is the FALLBACK when RAG is unavailable
 */
export function selectAnchorVerse(archetype: ArchetypeKey, intensityScore: number): AnchorVerse {
  const archetypeData = vault.archetypes[archetype];
  if (!archetypeData) {
    throw new Error(`Unknown archetype: ${archetype}`);
  }

  const verses = archetypeData.anchor_verses;
  // Use intensity to deterministically select verse (0-100 maps to 0-9)
  const verseIndex = Math.floor(intensityScore / 10) % verses.length;
  return verses[verseIndex];
}

/**
 * RAG-ENHANCED VERSE RETRIEVAL
 * 
 * Searches Pinecone for semantically relevant Bible verses based on 
 * the user's emotional context. Falls back to vault if RAG fails.
 */
export async function retrieveVerseWithRAG(
  archetype: ArchetypeKey,
  intensityScore: number,
  emotionalContext?: {
    statedFeeling?: string;
    trueNeed?: string;
  }
): Promise<{ verse: AnchorVerse; source: 'rag' | 'vault'; ragVerse?: RetrievedVerse }> {
  const archetypeData = vault.archetypes[archetype];
  if (!archetypeData) {
    throw new Error(`Unknown archetype: ${archetype}`);
  }

  try {
    // Attempt RAG search
    const ragResult = await searchVersesForContext(
      archetype,
      archetypeData.description,
      emotionalContext,
      5 // Get top 5 results
    );

    const bestMatch = getBestMatch(ragResult.results, 0.45); // Lower threshold for better RAG coverage

    if (bestMatch) {
      // Convert RAG result to AnchorVerse format
      const ragAnchorVerse: AnchorVerse = {
        reference: bestMatch.reference,
        text: bestMatch.text,
        whisper_tone: determineWhisperTone(intensityScore),
        prompt_context: `This verse was semantically matched to someone experiencing: ${archetypeData.description}`,
        image_mood: generateImageMood(archetype, bestMatch.text)
      };

      console.log(`[RAG] Found verse: ${bestMatch.reference} (score: ${bestMatch.score.toFixed(3)})`);

      return {
        verse: ragAnchorVerse,
        source: 'rag',
        ragVerse: bestMatch
      };
    }

    // No good match found, fall back to vault
    console.log('[RAG] No strong match found, falling back to vault');
  } catch (error) {
    console.warn('[RAG] Search failed, falling back to vault:', error);
  }

  // Fallback: Use the deterministic vault selection
  return {
    verse: selectAnchorVerse(archetype, intensityScore),
    source: 'vault'
  };
}

/**
 * Determine whisper tone based on intensity
 */
function determineWhisperTone(intensityScore: number): 'Puck' | 'Kore' | 'Fenrir' {
  if (intensityScore < 40) return 'Puck'; // Lighter, playful
  if (intensityScore < 70) return 'Kore'; // Gentle, nurturing
  return 'Fenrir'; // Deep, powerful
}

/**
 * Generate image mood based on archetype and verse content
 */
function generateImageMood(archetype: ArchetypeKey, verseText: string): string {
  const moodMap: Record<ArchetypeKey, string> = {
    'Burdened Ruler': 'Majestic mountains with soft morning light breaking through clouds',
    'Lost Child': 'A warm lantern glowing in a gentle forest clearing',
    'Wounded Healer': 'Gentle hands cupping healing water, soft ethereal light',
    'Silent Storm': 'A still lake reflecting storm clouds with a single ray of sunlight',
    'Anxious Achiever': 'A peaceful garden path leading to a restful sanctuary',
    'Faithful Doubter': 'Stars emerging through parting clouds at dusk',
    'Joyful Servant': 'Golden wheat fields swaying in warm afternoon light',
    'Weary Warrior': 'A strong oak tree providing shade by still waters'
  };

  return moodMap[archetype] || 'Ethereal sanctuary with soft divine light';
}

/**
 * Get archetype metadata (color, icon, description)
 */
export function getArchetypeMetadata(archetype: ArchetypeKey) {
  const data = vault.archetypes[archetype];
  return {
    description: data.description,
    color: data.color,
    icon: data.icon
  };
}

/**
 * Generate a grounded whisper using the Librarian Logic
 * Creative interpretation that stays anchored to the verse
 * 
 * NOW WITH RAG: Uses semantic search to find the most relevant verse
 * for the user's specific emotional context, with vault fallback.
 */
export async function generateGroundedWhisper(
  archetype: ArchetypeKey,
  intensityScore: number,
  emotionalContext?: {
    statedFeeling?: string;
    trueNeed?: string;
    warmthNeed?: number;
    ministryDepth?: string;
  },
  useRAG: boolean = true // Enable RAG by default
): Promise<GroundedWhisper & { verseSource?: 'rag' | 'vault' }> {
  // Step 1: Retrieve anchor verse (RAG-enhanced or vault fallback)
  let anchorVerse: AnchorVerse;
  let verseSource: 'rag' | 'vault' = 'vault';

  if (useRAG) {
    const ragResult = await retrieveVerseWithRAG(archetype, intensityScore, emotionalContext);
    anchorVerse = ragResult.verse;
    verseSource = ragResult.source;
    
    if (ragResult.source === 'rag' && ragResult.ragVerse) {
      console.log(`[Librarian] Using RAG verse: ${ragResult.ragVerse.reference} (score: ${ragResult.ragVerse.score.toFixed(3)})`);
    }
  } else {
    // Use deterministic vault selection
    anchorVerse = selectAnchorVerse(archetype, intensityScore);
  }

  // Step 2: Build variation seed for creative diversity
  const variationSeeds = [
    "Begin with tender comfort",
    "Begin with gentle strength",
    "Begin with an invitation to rest",
    "Begin with a hopeful promise",
    "Begin with intimate presence",
    "Begin by acknowledging their struggle",
    "Begin with a question that opens the heart",
    "Begin with a simple truth"
  ];
  const variationSeed = variationSeeds[Math.floor(Math.random() * variationSeeds.length)];

  // Step 3: Build the grounded prompt with rich context
  const groundedPrompt = `
### THE PERSON'S SOUL STATE:
- Archetype: ${archetype}
- What this means: ${vault.archetypes[archetype].description}
${emotionalContext?.statedFeeling ? `- They said they feel: ${emotionalContext.statedFeeling}` : ''}
${emotionalContext?.trueNeed ? `- Their deeper need: ${emotionalContext.trueNeed}` : ''}
${emotionalContext?.warmthNeed && emotionalContext.warmthNeed > 70 ? '- They need extra gentleness and warmth' : ''}
${emotionalContext?.ministryDepth === 'deeper' || emotionalContext?.ministryDepth === 'crisis' ? '- They are carrying hidden pain - be especially tender' : ''}

### THE ANCHOR VERSE (your only source of truth):
"${anchorVerse.text}" - ${anchorVerse.reference}

### INTERPRETATION GUIDANCE:
${anchorVerse.prompt_context}

### YOUR CREATIVE DIRECTION:
${variationSeed}

### TASK:
1. **Devotional Text:** Write a 2-3 sentence whispered prayer (MAX 50 words). Interpret the anchor verse for THIS person. Every phrase connects to the verse's meaning. Personal and intimate. Brevity is sacred.

2. **Image Prompt:** Create an ethereal sanctuary image inspired by: ${anchorVerse.image_mood}
`;

  // Step 4: Call the LLM with higher temperature for variety (with retry for reliability)
  const response = await retryWithBackoff(async () => {
    return await withTimeout(
      ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: groundedPrompt + INTERPRETATION_FORMAT,
        config: {
          systemInstruction: LIBRARIAN_PERSONA,
          temperature: 0.7,
        }
      }),
      API_TIMEOUT_MS
    );
  });

  const text = response.text;
  if (!text) throw new Error("Librarian failed to interpret the verse");

  // Parse and extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse response as JSON");

  const interpretation = JSON.parse(jsonMatch[0]) as { devotionalText: string; imagePrompt: string };

return {
    archetype,
    anchorVerse,
    devotionalText: interpretation.devotionalText,
    imagePrompt: interpretation.imagePrompt,
    verseSource
  };
}

/**
 * Analyze text input to determine archetype (fallback mode)
 * Used when camera is not available or user prefers text input
 */
export async function analyzeTextForArchetype(userInput: string): Promise<SoulAnalysis> {
  // Input validation
  if (!userInput || typeof userInput !== 'string') {
    throw new Error('Invalid input: must be a non-empty string');
  }

  // Sanitize input
  const sanitizedInput = userInput
    .trim()
    .slice(0, 500) // Limit to 500 characters
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .replace(/\s+/g, ' '); // Normalize whitespace

  if (sanitizedInput.length === 0) {
    throw new Error('Input cannot be empty');
  }

  const archetypeList = Object.keys(vault.archetypes).join(', ');

  const analysisPrompt = `
Analyze this person's emotional state and map it to one of the spiritual archetypes.

User's Heart: "${sanitizedInput}"

Available Archetypes and their descriptions:
${Object.entries(vault.archetypes).map(([name, data]) =>
  `- ${name}: ${data.description}`
).join('\n')}

Select the archetype that best matches their emotional state.
Rate the intensity (0-100) of their emotional expression.

Respond with valid JSON only in this exact format:
{
  "archetype": "One of: ${archetypeList}",
  "intensityScore": 0-100,
  "confidence": 0-100,
  "reasoning": "Brief explanation"
}
`;

  const response = await retryWithBackoff(async () => {
    return await withTimeout(
      ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: analysisPrompt,
        config: {
          systemInstruction: "You are a compassionate spiritual counselor who identifies emotional patterns. Be gentle and accurate.",
          temperature: 0.4,
        }
      }),
      API_TIMEOUT_MS
    );
  });

  const text = response.text;
  if (!text) throw new Error("Failed to analyze emotional state");

  // Parse and extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse response as JSON");

  return JSON.parse(jsonMatch[0]) as SoulAnalysis;
}

/**
 * Get all available archetypes for display
 */
export function getAllArchetypes(): Array<{ key: ArchetypeKey; description: string; color: string; icon: string }> {
  return Object.entries(vault.archetypes).map(([key, data]) => ({
    key: key as ArchetypeKey,
    description: data.description,
    color: data.color,
    icon: data.icon
  }));
}
