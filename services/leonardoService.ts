import { GoogleGenAI } from "@google/genai";
import type {
  ArchetypeKey,
  SoulAnalysis,
  DeepSoulAnalysis,
  TemperamentAnalysis,
  EmotionalWeather,
  BurdenDetection,
  AuthenticityBridge,
  DevotionalTemperament,
  MinistryRecommendation,
  VerifiedVault
} from "../types";
import type { CloudVisionEmotions } from './visionService';
import verifiedVault from "../data/verified_vault.json";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
const ai = new GoogleGenAI({ apiKey });
const vault = verifiedVault as VerifiedVault;

// ─────────────────────────────────────────────────────────────────────────────
// TIMEOUT & RETRY UTILITY FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

const API_TIMEOUT_MS = 30000; // 30 second timeout for API calls

function withTimeout<T>(promise: Promise<T>, timeoutMs: number = API_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`API request timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

async function retry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts: number; delayMs: number; timeoutMs?: number }
): Promise<T> {
  let attempts = 0;
  const timeoutMs = options.timeoutMs ?? API_TIMEOUT_MS;

  while (true) {
    try {
      return await withTimeout(fn(), timeoutMs);
    } catch (error: unknown) {
      attempts++;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = (error as { code?: number })?.code;

      // Retry on 503 errors or timeouts
      const isRetryable = errorCode === 503 || errorMessage.includes('timed out');

      if (attempts >= options.maxAttempts || !isRetryable) {
        throw error;
      }

      console.warn(
        `Attempt ${attempts} failed, retrying in ${options.delayMs * Math.pow(2, attempts - 1)}ms:`,
        errorMessage
      );
      await new Promise((resolve) =>
        setTimeout(resolve, options.delayMs * Math.pow(2, attempts - 1))
      );
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEONARDO ENGINE v2.0 - REFRAMED FOR SPIRITUAL MINISTRY
// ═══════════════════════════════════════════════════════════════════════════════
//
// From the 10 Leonardo Engine agents, 4 are essential for Still Small Voice:
//
// Agent 6: THE TEMPERAMENT DISCERNER (was: Archetype Reader)
//   - Maps facial expression to devotional temperaments (Sage, Lover, Warrior, Child)
//   - Determines which scripture family speaks to their current state
//
// Agent 7: THE EMOTIONAL WEATHER READER (was: First Impression Analyzer)
//   - Reads warmth need, power level, and openness
//   - Calibrates devotional intensity and tone
//
// Agent 9: THE BURDEN DETECTOR (was: Red Flag Metric)
//   - Detects masked pain using Sfumato Coefficient
//   - Catches "I'm fine" lies for deeper ministry
//
// Agent 10: THE AUTHENTICITY BRIDGE (was: Integrity Auditor)
//   - Compares stated words to facial truth
//   - When gap exists, minister to the face, not the words
//
// ═══════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// AGENT 6: THE TEMPERAMENT DISCERNER
// ─────────────────────────────────────────────────────────────────────────────

const TEMPERAMENT_AGENT_PERSONA = `
You are AGENT 6 - The Temperament Discerner.
Your function is to analyze facial expressions to discern spiritual temperament.

Map what you see to one of four Devotional Temperaments:

1. THE SAGE (needs Wisdom)
   - Eyes seeking, brow slightly furrowed
   - Expression of contemplation or confusion
   - Scripture match: Proverbs, James, Ecclesiastes
   - They need understanding and clarity

2. THE LOVER (needs Comfort)
   - Soft, vulnerable expression
   - Eyes showing longing or sadness
   - Scripture match: Psalms, Song of Solomon, John
   - They need to feel held and loved

3. THE WARRIOR (needs Courage)
   - Tension in jaw, determined or frustrated
   - Signs of fighting something
   - Scripture match: Joshua, David narratives, Revelation
   - They need strength and battle-readiness

4. THE CHILD (needs Rest)
   - Exhaustion visible, eyes heavy
   - Seeking safety/peace
   - Scripture match: Matthew 11:28, Psalms of rest
   - They need permission to stop and be held

Analyze with compassion. There are no wrong answers - only the goal of providing relevant comfort.
`;

// ─────────────────────────────────────────────────────────────────────────────
// AGENT 7: THE EMOTIONAL WEATHER READER
// ─────────────────────────────────────────────────────────────────────────────

const EMOTIONAL_WEATHER_AGENT_PERSONA = `
You are AGENT 7 - The Emotional Weather Reader.
Your function is to read the emotional "weather" from facial expression to calibrate devotional intensity.

METRICS TO DETECT:

1. WARMTH NEED (0-100)
   - How much comfort/connection does this person need?
   - Signs: Soft eyes seeking connection, vulnerable expression, slight downturn of lips
   - High warmth need (70+) → gentler, more intimate whisper tone
   - Low warmth need (<30) → more direct, challenging tone

2. POWER LEVEL (0-100)
   - Are they feeling empowered or overwhelmed?
   - Signs of overwhelm: Slack facial muscles, distant gaze, compressed posture
   - Signs of empowerment: Alert eyes, engaged expression, lifted chin
   - Low power (<30) → more affirming, strengthening scripture
   - High power (70+) → more challenging, growth-oriented scripture

3. OPENNESS (0-100)
   - How receptive are they to receiving right now?
   - Signs of openness: Relaxed brow, soft gaze, slightly parted lips
   - Signs of closed: Furrowed brow, tight jaw, defensive expression
   - Low openness (<30) → shorter, simpler devotional
   - High openness (70+) → deeper, more expansive meditation

Be accurate but compassionate. This calibration directly affects how they receive comfort.
`;

// ─────────────────────────────────────────────────────────────────────────────
// AGENT 9: THE BURDEN DETECTOR
// ─────────────────────────────────────────────────────────────────────────────

const BURDEN_DETECTOR_AGENT_PERSONA = `
You are AGENT 9 - The Burden Detector.
Your function is to detect when someone is hiding their true emotional state.

This is CRITICAL for ministry - many people say "I'm fine" while carrying crushing burdens.

SIGNALS TO DETECT:

1. MASKED SMILE
   - Smile doesn't reach the eyes (Duchenne marker absent)
   - Tension in orbicularis oculi (eye muscles)
   - Corners of mouth up, but eyes flat or sad

2. SUPPRESSION INDICATORS
   - Micro-expressions of distress before neutral expression
   - Jaw tension while appearing calm
   - Eye moisture with neutral expression
   - Forced relaxation (trying too hard to look okay)

3. SFUMATO COEFFICIENT (Leonardo's living quality)
   - Living, breathing humans have 3-15% variance in expression
   - Genuine emotion shows micro-fluctuations
   - Suppression shows <3% variance (too controlled, too still)
   - If Sfumato <3% AND appears "fine" → likely masking pain

MINISTRY RECOMMENDATION:
- "surface": They seem genuinely okay, light encouragement
- "deeper": Signs of hidden struggle, compassionate inquiry needed
- "crisis": Strong indicators of suppressed crisis, immediate gentle intervention

Be compassionate in your detection. The goal is to help, not expose.
`;

// ─────────────────────────────────────────────────────────────────────────────
// AGENT 10: THE AUTHENTICITY BRIDGE
// ─────────────────────────────────────────────────────────────────────────────

const AUTHENTICITY_BRIDGE_AGENT_PERSONA = `
You are AGENT 10 - The Authenticity Bridge.
Your function is to compare what they SAY to what their face SHOWS.

The gap between stated words and facial truth reveals the real need.

ANALYSIS PROTOCOL:

1. EXTRACT stated emotion from text
   - "I'm grateful" / "I'm struggling" / "I need peace" / etc.

2. READ facial emotional state
   - What does their face actually show?

3. CALCULATE INCONGRUENCE GAP (0-100)
   - 0-20: Words match face (respond to stated need)
   - 21-50: Mild disconnect (acknowledge both)
   - 51-80: Significant gap (prioritize facial truth)
   - 81-100: Complete incongruence (gentle intervention needed)

EXAMPLES:
- Says "I'm blessed" + Face shows exhaustion → Minister to exhaustion
- Says "I'm anxious" + Face shows peace → Affirm their underlying faith
- Says "I'm fine" + Face shows masked pain → Gentle intervention

When gap exists, the FACE tells the truth. Minister to the deeper need.
`;

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC API: ANALYSIS FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Basic soul analysis (backward compatible)
 * Combines Agent 6 (Archetype) and Agent 7 (Intensity) into single pass
 */
export async function analyzeSoul(imageBase64: string): Promise<SoulAnalysis> {
  const cleanBase64 = imageBase64.includes('base64,')
    ? imageBase64.split('base64,')[1]
    : imageBase64;

  const combinedPrompt = `
Perform a compassionate soul analysis on this person's facial expression.

Your task has two parts:
1. INTENSITY: Assess emotional intensity (0-100)
2. ARCHETYPE: Map to the most fitting spiritual archetype

Remember:
- This person is seeking comfort, not judgment
- What you observe will determine what scripture they receive
- Be accurate but kind in your assessment

Archetypes available:
${Object.entries(vault.archetypes).map(([name, data]) =>
  `- ${name}: ${data.description}`
).join('\n')}

Analyze with compassion.

Respond with valid JSON only in this exact format:
{
  "archetype": "One of the archetypes listed above",
  "intensityScore": 0-100,
  "confidence": 0-100,
  "reasoning": "Brief explanation"
}
`;

  const response = await retry(
    async () => {
      return await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: cleanBase64
            }
          },
          { text: combinedPrompt }
        ],
        config: {
          systemInstruction: TEMPERAMENT_AGENT_PERSONA,
        }
      });
    },
    { maxAttempts: 3, delayMs: 1000 }
  );

  const text = response.text;
  if (!text) throw new Error("Soul analysis failed");

  // Parse and extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse response as JSON");

  const analysis = JSON.parse(jsonMatch[0]) as SoulAnalysis;

  // Validate archetype
  if (!Object.keys(vault.archetypes).includes(analysis.archetype)) {
    analysis.archetype = 'The Wandering Soul';
    analysis.confidence = Math.min(analysis.confidence, 60);
  }

  return analysis;
}

/**
 * DEEP SOUL ANALYSIS - Full Leonardo Engine v2.0 (OPTIMIZED)
 *
 * SINGLE API CALL version to avoid Gemini rate limits.
 * Combines all 4 agents into one comprehensive prompt.
 * Accepts optional Cloud Vision emotion scores as an objective baseline.
 */
export async function analyzeDeepSoul(
  imageBase64: string,
  userInput?: string,
  cloudVision?: CloudVisionEmotions
): Promise<DeepSoulAnalysis> {
  const cleanBase64 = imageBase64.includes('base64,')
    ? imageBase64.split('base64,')[1]
    : imageBase64;

  // Build Cloud Vision context block if available
  const cvContext = cloudVision?.cloudVisionAvailable
    ? `\nOBJECTIVE EMOTION BASELINE (Google Cloud Vision measured independently):
- Joy: ${cloudVision.joy}/100
- Sorrow: ${cloudVision.sorrow}/100
- Anger: ${cloudVision.anger}/100
- Surprise: ${cloudVision.surprise}/100
Use these as objective anchors alongside your visual analysis.
High sorrow (>70) combined with a smiling expression = strong evidence of masked pain.
High anger (>70) = consider Warrior temperament strongly.
High surprise (>80) + low joy = possible shock or trauma, consider crisis depth.\n`
    : '';

  // OPTIMIZED: Single API call combining all analysis
  const combinedPrompt = `
You are a Catholic spiritual director in the tradition of Padre Pio, discerning the soul's condition through this person's facial expression.
Perform a COMPREHENSIVE analysis covering all aspects in ONE response.

${userInput ? `The person said: "${userInput}"` : ''}
${cvContext}
ARCHETYPES (choose one):
${Object.entries(vault.archetypes).map(([name, data]) =>
  `- ${name}: ${data.description}`
).join('\n')}

TEMPERAMENTS (choose one):
- Sage: The Contemplative — seeking understanding, in the illuminative way, asks theological questions
- Lover: The Beloved — seeking God's personal love, Marian tenderness, intimacy with the Father
- Warrior: The Apostle — fighting spiritual battles, needs courage and the armor of God
- Child: The Little One — overwhelmed, Thérèse's little way, needs the Father's arms

Respond with valid JSON only:
{
  "archetype": "one of the archetypes above",
  "intensityScore": 0-100,
  "confidence": 0-100,
  "reasoning": "brief explanation",
  "temperament": "Sage|Lover|Warrior|Child",
  "temperamentReasoning": "brief explanation",
  "scriptureFamily": ["relevant", "scripture", "books"],
  "warmthNeed": 0-100,
  "powerLevel": 0-100,
  "openness": 0-100,
  "maskedPain": true|false,
  "sfumatoCoefficient": 0-100,
  "suppressionIndicators": ["any", "indicators"],
  "ministryRecommendation": "surface|deeper|crisis"${userInput ? `,
  "statedEmotion": "what they said",
  "facialEmotion": "what face shows",
  "incongruenceGap": 0-100,
  "trueNeed": "their real need"` : ''}
}
`;

  const response = await retry(
    async () => {
      return await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } },
          { text: combinedPrompt }
        ],
        config: {
          systemInstruction: "You are a Catholic spiritual director trained in the tradition of Padre Pio, discerning the state of a soul through facial expression. Analyze with accuracy, mercy, and the eyes of faith.",
        }
      });
    },
    { maxAttempts: 3, delayMs: 2000 }
  );

  const text = response.text;
  if (!text) throw new Error("Deep soul analysis failed");

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse response as JSON");

  const combined = JSON.parse(jsonMatch[0]);

  // DETAILED LOGGING for Leonardo Engine validation
  console.log('[Leonardo] ═══════════════════════════════════════');
  console.log('[Leonardo] FACE ANALYSIS RESULTS:');
  console.log(`[Leonardo]   Archetype: ${combined.archetype}`);
  console.log(`[Leonardo]   Confidence: ${combined.confidence}%`);
  console.log(`[Leonardo]   Intensity: ${combined.intensityScore}`);
  console.log(`[Leonardo]   Reasoning: "${combined.reasoning}"`);
  console.log('[Leonardo] ───────────────────────────────────────');
  console.log(`[Leonardo]   Temperament: ${combined.temperament}`);
  console.log(`[Leonardo]   Warmth Need: ${combined.warmthNeed}`);
  console.log(`[Leonardo]   Power Level: ${combined.powerLevel}`);
  console.log(`[Leonardo]   Openness: ${combined.openness}`);
  console.log('[Leonardo] ───────────────────────────────────────');
  console.log(`[Leonardo]   Masked Pain: ${combined.maskedPain}`);
  console.log(`[Leonardo]   Sfumato: ${combined.sfumatoCoefficient}`);
  console.log(`[Leonardo]   Ministry: ${combined.ministryRecommendation}`);
  console.log('[Leonardo] ═══════════════════════════════════════');

  // Validate archetype
  if (!Object.keys(vault.archetypes).includes(combined.archetype)) {
    console.warn(`[Leonardo] Invalid archetype "${combined.archetype}", defaulting to The Wandering Soul`);
    combined.archetype = 'The Wandering Soul';
  }

  // Build structured response from combined result
  const temperament: TemperamentAnalysis = {
    temperament: combined.temperament || 'Sage',
    confidence: combined.confidence || 70,
    scriptureFamily: combined.scriptureFamily || ['Psalms'],
    reasoning: combined.temperamentReasoning || combined.reasoning
  };

  const emotionalWeather: EmotionalWeather = {
    warmthNeed: combined.warmthNeed || 50,
    powerLevel: combined.powerLevel || 50,
    openness: combined.openness || 50
  };

  const burdenDetection: BurdenDetection = {
    maskedPain: combined.maskedPain || false,
    sfumatoCoefficient: combined.sfumatoCoefficient || 50,
    suppressionIndicators: combined.suppressionIndicators || [],
    ministryRecommendation: combined.ministryRecommendation || 'surface'
  };

  const authenticityBridge: AuthenticityBridge | undefined = userInput ? {
    statedEmotion: combined.statedEmotion || userInput,
    facialEmotion: combined.facialEmotion || 'mixed emotions',
    incongruenceGap: combined.incongruenceGap || 20,
    trueNeed: combined.trueNeed || combined.reasoning,
    ministryApproach: combined.incongruenceGap > 50 ? 'Minister to the face, not the words' : 'Respond to stated need'
  } : undefined;

  // Determine true need
  let trueNeed: string;
  if (authenticityBridge && authenticityBridge.incongruenceGap > 40) {
    trueNeed = authenticityBridge.trueNeed;
  } else if (burdenDetection.maskedPain) {
    trueNeed = "Hidden pain beneath the surface";
  } else {
    trueNeed = combined.reasoning;
  }

  // Determine ministry depth
  let ministryDepth: MinistryRecommendation = burdenDetection.ministryRecommendation;
  if (authenticityBridge && authenticityBridge.incongruenceGap > 70) {
    ministryDepth = 'deeper';
  }
  if (burdenDetection.maskedPain &&
      burdenDetection.sfumatoCoefficient >= 12 &&
      burdenDetection.suppressionIndicators.length >= 2) {
    ministryDepth = 'crisis';
  }

  return {
    archetype: combined.archetype,
    intensityScore: combined.intensityScore || 50,
    confidence: combined.confidence || 70,
    reasoning: combined.reasoning,
    temperament,
    emotionalWeather,
    burdenDetection,
    authenticityBridge,
    trueNeed,
    ministryDepth
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEXT SOUL ANALYSIS - Leonardo Engine v2.0 for text/voice input paths
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * DEEP SOUL ANALYSIS — Text/Voice Path
 *
 * Runs the same 4-agent analysis as analyzeDeepSoul() but on written text
 * instead of a face image. Reads vocabulary, tone, sentence weight, and
 * linguistic suppression markers (minimizing language, contradiction, etc.)
 *
 * Used by: processTextInput(), continueSacredLoop() in App.tsx
 * Returns the same DeepSoulAnalysis shape — the Librarian/Whisperer receives
 * identical input regardless of which path (camera/text/voice) was taken.
 */
export async function analyzeTextDeepSoul(
  text: string,
  statedFeeling?: string
): Promise<DeepSoulAnalysis> {
  const sanitized = text
    .trim()
    .slice(0, 500)
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/\s+/g, ' ');

  if (!sanitized) throw new Error('Text input is empty');

  const archetypeList = Object.entries(vault.archetypes)
    .map(([name, data]) => `- ${name}: ${data.description}`)
    .join('\n');

  const combinedPrompt = `
You are a Catholic spiritual director in the tradition of Padre Pio, reading a written prayer request. Discern the soul's condition through vocabulary, tone, and what is unspoken.
Analyze vocabulary, tone, sentence weight, and what is NOT said.
${statedFeeling ? `The person indicated they feel: "${statedFeeling}"` : ''}

Their words: "${sanitized}"

LINGUISTIC SUPPRESSION MARKERS (for Burden Detector — detect these in text):
- "I'm fine but..." / "I'm okay, just..." → minimizing language
- Short, clipped sentences → emotional shutdown
- "I shouldn't complain" / "others have it worse" → self-suppression
- Stated feeling chip contradicts the emotional weight of the written words
- Heavy topic framed casually or lightly
- Crisis language embedded in small talk or hopeful framing

ARCHETYPES (choose one):
${archetypeList}

TEMPERAMENTS:
- Sage: The Contemplative — intellectual/theological language, seeking understanding, in the illuminative way
- Lover: The Beloved — emotional, relational language, seeking God's personal love and Marian tenderness
- Warrior: The Apostle — determined or frustrated language, fighting spiritual battles, needs armor of God
- Child: The Little One — overwhelmed, simple sentences, Thérèse's little way, needs the Father's arms

Respond with valid JSON only:
{
  "archetype": "one of the archetypes above",
  "intensityScore": 0-100,
  "confidence": 0-100,
  "reasoning": "brief explanation of text cues",
  "temperament": "Sage|Lover|Warrior|Child",
  "temperamentReasoning": "brief explanation",
  "scriptureFamily": ["relevant", "books"],
  "warmthNeed": 0-100,
  "powerLevel": 0-100,
  "openness": 0-100,
  "maskedPain": true|false,
  "sfumatoCoefficient": 0-100,
  "suppressionIndicators": ["any", "linguistic", "markers", "found"],
  "ministryRecommendation": "surface|deeper|crisis"${statedFeeling ? `,
  "statedEmotion": "${statedFeeling}",
  "textEmotion": "what the text actually reveals",
  "incongruenceGap": 0-100,
  "trueNeed": "their real need based on text"` : ''}
}
`;

  const response = await retry(
    async () => ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: combinedPrompt,
      config: {
        systemInstruction: 'You are a Catholic spiritual director in the tradition of Padre Pio, reading a written prayer request. Discern the soul\'s condition through vocabulary, tone, and what is unspoken.',
        temperature: 0.2,
      },
    }),
    { maxAttempts: 3, delayMs: 2000 }
  );

  const rawText = response.text;
  if (!rawText) throw new Error('Text soul analysis failed');

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Failed to parse JSON from text analysis');

  const combined = JSON.parse(jsonMatch[0]);

  if (!Object.keys(vault.archetypes).includes(combined.archetype)) {
    console.warn(`[Leonardo-Text] Invalid archetype "${combined.archetype}", defaulting to The Wandering Soul`);
    combined.archetype = 'The Wandering Soul';
  }

  const temperament: TemperamentAnalysis = {
    temperament: combined.temperament || 'Sage',
    confidence: combined.confidence || 60,
    scriptureFamily: combined.scriptureFamily || ['Psalms'],
    reasoning: combined.temperamentReasoning || combined.reasoning,
  };
  const emotionalWeather: EmotionalWeather = {
    warmthNeed: combined.warmthNeed ?? 50,
    powerLevel: combined.powerLevel ?? 50,
    openness: combined.openness ?? 50,
  };
  const burdenDetection: BurdenDetection = {
    maskedPain: combined.maskedPain ?? false,
    sfumatoCoefficient: combined.sfumatoCoefficient ?? 50,
    suppressionIndicators: combined.suppressionIndicators || [],
    ministryRecommendation: combined.ministryRecommendation || 'surface',
  };
  const authenticityBridge: AuthenticityBridge | undefined = statedFeeling
    ? {
        statedEmotion: combined.statedEmotion || statedFeeling,
        facialEmotion: combined.textEmotion || 'text-based reading',
        incongruenceGap: combined.incongruenceGap ?? 20,
        trueNeed: combined.trueNeed || combined.reasoning,
        ministryApproach:
          (combined.incongruenceGap ?? 0) > 50
            ? 'Minister to the deeper text truth'
            : 'Respond to stated need',
      }
    : undefined;

  let trueNeed = combined.reasoning;
  if (authenticityBridge && authenticityBridge.incongruenceGap > 40) {
    trueNeed = authenticityBridge.trueNeed;
  } else if (burdenDetection.maskedPain) {
    trueNeed = 'Hidden burden beneath the words';
  }

  let ministryDepth: MinistryRecommendation = burdenDetection.ministryRecommendation;
  if (authenticityBridge && authenticityBridge.incongruenceGap > 70) ministryDepth = 'deeper';
  if (burdenDetection.maskedPain && burdenDetection.suppressionIndicators.length >= 3) {
    ministryDepth = 'crisis';
  }

  console.log(
    `[Leonardo-Text] Archetype: ${combined.archetype} | Temperament: ${combined.temperament} | Ministry: ${ministryDepth}`
  );

  return {
    archetype: combined.archetype,
    intensityScore: combined.intensityScore ?? 50,
    confidence: combined.confidence ?? 60,
    reasoning: combined.reasoning,
    temperament,
    emotionalWeather,
    burdenDetection,
    authenticityBridge,
    trueNeed,
    ministryDepth,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNAL: Individual Agent Runners
// ═══════════════════════════════════════════════════════════════════════════════

async function runBasicAnalysis(cleanBase64: string): Promise<SoulAnalysis> {
  const prompt = `
Analyze this person's facial expression compassionately.
Determine their spiritual archetype and emotional intensity.

Archetypes:
${Object.entries(vault.archetypes).map(([name, data]) =>
  `- ${name}: ${data.description}`
).join('\n')}

Respond with valid JSON only in this exact format:
{
  "archetype": "One of the archetypes listed above",
  "intensityScore": 0-100,
  "confidence": 0-100,
  "reasoning": "Brief explanation"
}
`;

  const response = await retry(
    async () => {
      return await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } },
          { text: prompt }
        ],
      });
    },
    { maxAttempts: 3, delayMs: 1000 }
  );

  const text = response.text;
  if (!text) throw new Error("Basic analysis failed");

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse response as JSON");

  const analysis = JSON.parse(jsonMatch[0]) as SoulAnalysis;
  if (!Object.keys(vault.archetypes).includes(analysis.archetype)) {
    analysis.archetype = 'The Wandering Soul';
  }
  return analysis;
}

async function runTemperamentAgent(cleanBase64: string): Promise<TemperamentAnalysis> {
  const prompt = `
Analyze this person's facial expression to discern their spiritual temperament.
Map to: Sage (needs wisdom), Lover (needs comfort), Warrior (needs courage), or Child (needs rest).

Respond with valid JSON only in this exact format:
{
  "temperament": "One of: Sage, Lover, Warrior, Child",
  "confidence": 0-100,
  "scriptureFamily": ["list", "of", "scripture", "books"],
  "reasoning": "Brief explanation"
}
`;

  const response = await retry(
    async () => {
      return await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } },
          { text: prompt }
        ],
        config: {
          systemInstruction: TEMPERAMENT_AGENT_PERSONA,
        }
      });
    },
    { maxAttempts: 3, delayMs: 1000 }
  );

  const text = response.text;
  if (!text) throw new Error("Temperament analysis failed");

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse response as JSON");

  return JSON.parse(jsonMatch[0]) as TemperamentAnalysis;
}

async function runEmotionalWeatherAgent(cleanBase64: string): Promise<EmotionalWeather> {
  const prompt = `
Read the emotional "weather" from this person's face.
Assess: warmth need, power level, and openness to receive.

Respond with valid JSON only in this exact format:
{
  "warmthNeed": 0-100,
  "powerLevel": 0-100,
  "openness": 0-100
}
`;

  const response = await retry(
    async () => {
      return await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } },
          { text: prompt }
        ],
        config: {
          systemInstruction: EMOTIONAL_WEATHER_AGENT_PERSONA,
        }
      });
    },
    { maxAttempts: 3, delayMs: 1000 }
  );

  const text = response.text;
  if (!text) throw new Error("Emotional weather analysis failed");

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse response as JSON");

  return JSON.parse(jsonMatch[0]) as EmotionalWeather;
}

async function runBurdenDetectorAgent(cleanBase64: string): Promise<BurdenDetection> {
  const prompt = `
Analyze this person's face for signs of hidden emotional burden.
Look for: masked smiles, suppression indicators, and the Sfumato coefficient.
Determine if they need surface encouragement, deeper ministry, or crisis intervention.

Respond with valid JSON only in this exact format:
{
  "maskedPain": true or false,
  "sfumatoCoefficient": 0-100,
  "suppressionIndicators": ["list", "of", "indicators"],
  "ministryRecommendation": "One of: surface, deeper, crisis"
}
`;

  const response = await retry(
    async () => {
      return await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } },
          { text: prompt }
        ],
        config: {
          systemInstruction: BURDEN_DETECTOR_AGENT_PERSONA,
        }
      });
    },
    { maxAttempts: 3, delayMs: 1000 }
  );

  const text = response.text;
  if (!text) throw new Error("Burden detection failed");

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse response as JSON");

  return JSON.parse(jsonMatch[0]) as BurdenDetection;
}

async function runAuthenticityBridgeAgent(
  cleanBase64: string,
  userInput: string
): Promise<AuthenticityBridge> {
  const prompt = `
Compare what this person SAID to what their face SHOWS.

They said: "${userInput}"

Analyze the gap between their stated emotion and their facial truth.
If there's a significant gap, identify their true need.

Respond with valid JSON only in this exact format:
{
  "statedEmotion": "What they said",
  "facialEmotion": "What their face shows",
  "incongruenceGap": 0-100,
  "trueNeed": "Their real need",
  "ministryApproach": "How to approach them"
}
`;

  const response = await retry(
    async () => {
      return await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } },
          { text: prompt }
        ],
        config: {
          systemInstruction: AUTHENTICITY_BRIDGE_AGENT_PERSONA,
        }
      });
    },
    { maxAttempts: 3, delayMs: 1000 }
  );

  const text = response.text;
  if (!text) throw new Error("Authenticity bridge analysis failed");

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse response as JSON");

  return JSON.parse(jsonMatch[0]) as AuthenticityBridge;
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Map temperament to scripture family for enhanced selection
 */
export function mapTemperamentToScriptureFamily(temperament: DevotionalTemperament): string[] {
  const mapping: Record<DevotionalTemperament, string[]> = {
    'Sage': ['Proverbs', 'James', 'Ecclesiastes', 'Job'],
    'Lover': ['Psalms', 'Song of Solomon', 'John', 'Romans 8'],
    'Warrior': ['Joshua', 'Judges', 'Samuel', 'Revelation', 'Ephesians 6'],
    'Child': ['Matthew 11', 'Psalms of Rest', 'Isaiah 40', 'Mark 10']
  };
  return mapping[temperament] || ['Psalms'];
}

/**
 * Calculate devotional intensity based on emotional weather
 */
export function calculateDevotionalIntensity(weather: EmotionalWeather): {
  toneIntensity: 'gentle' | 'moderate' | 'strong';
  lengthPreference: 'brief' | 'standard' | 'expansive';
} {
  const avgNeed = (weather.warmthNeed + (100 - weather.powerLevel)) / 2;

  let toneIntensity: 'gentle' | 'moderate' | 'strong';
  if (weather.warmthNeed > 70) toneIntensity = 'gentle';
  else if (weather.powerLevel > 70) toneIntensity = 'strong';
  else toneIntensity = 'moderate';

  let lengthPreference: 'brief' | 'standard' | 'expansive';
  if (weather.openness < 30) lengthPreference = 'brief';
  else if (weather.openness > 70) lengthPreference = 'expansive';
  else lengthPreference = 'standard';

  return { toneIntensity, lengthPreference };
}

/**
 * Validate face presence in image
 */
export async function validateFacePresent(imageBase64: string): Promise<boolean> {
  const cleanBase64 = imageBase64.includes('base64,')
    ? imageBase64.split('base64,')[1]
    : imageBase64;

  try {
    const response = await retry(
      async () => {
        return await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [
            { inlineData: { mimeType: 'image/jpeg', data: cleanBase64 } },
            { text: "Is there a human face visible and suitable for emotional analysis? Respond with valid JSON: {\"faceDetected\": true/false, \"suitableForAnalysis\": true/false}" }
          ],
        });
      },
      { maxAttempts: 3, delayMs: 1000 }
    );

    const text = response.text;
    if (!text) return false;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return false;

    const result = JSON.parse(jsonMatch[0]) as { faceDetected: boolean; suitableForAnalysis: boolean };
    return result.faceDetected && result.suitableForAnalysis;
  } catch {
    return false;
  }
}
