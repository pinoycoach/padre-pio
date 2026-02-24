
export interface DevotionalGift {
  id: string;
  occasion: string;
  devotionalText: string; // The whispered message
  scriptureReference: string; // e.g., "Psalm 23:1"
  scriptureText: string; // The actual verse
  imagePrompt: string;
  audioBase64?: string;
  imageUrl?: string;
  archetype?: string; // NEXUS 3.5: Detected archetype
  intensityScore?: number; // NEXUS 3.5: Emotional intensity (0-100)
}

export interface GenerationStep {
  label: string;
  status: 'pending' | 'active' | 'complete';
}

// Archetype types — 8 soul-states Padre Pio directed in the confessional
export type ArchetypeKey =
  | 'The Penitent'
  | 'The Wandering Soul'
  | 'The Suffering Servant'
  | 'The Scrupulous Soul'
  | 'The Desolate Heart'
  | 'The Grieving Soul'
  | 'The Consoled Soul'
  | 'The Wounded Pilgrim';

export interface AnchorVerse {
  reference: string;
  text: string;
  whisper_tone: 'Puck' | 'Kore' | 'Fenrir';
  prompt_context: string;
  image_mood: string;
}

export interface ArchetypeData {
  description: string;
  color: string;
  icon: string;
  anchor_verses: AnchorVerse[];
}

export interface VerifiedVault {
  archetypes: Record<ArchetypeKey, ArchetypeData>;
}

// NEXUS 3.5: Soul Analysis result from Leonardo Engine
export interface SoulAnalysis {
  archetype: ArchetypeKey;
  intensityScore: number;
  confidence: number;
  reasoning: string;
}

// NEXUS 3.5: Grounded Whisper from Librarian Logic
export interface GroundedWhisper {
  archetype: ArchetypeKey;
  anchorVerse: AnchorVerse;
  devotionalText: string;
  imagePrompt: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// LEONARDO ENGINE v2.0 - REFRAMED AGENTS FOR SPIRITUAL MINISTRY
// ═══════════════════════════════════════════════════════════════════════════

// Agent 6: Temperament Discerner (Devotional temperament mapping)
export type DevotionalTemperament = 'Sage' | 'Lover' | 'Warrior' | 'Child';

export interface TemperamentAnalysis {
  temperament: DevotionalTemperament;
  confidence: number;
  scriptureFamily: string[];
  reasoning: string;
}

// Agent 7: Emotional Weather Reader (Ministry calibration)
export interface EmotionalWeather {
  warmthNeed: number;      // 0-100: How much comfort/connection needed
  powerLevel: number;      // 0-100: Empowered (high) vs overwhelmed (low)
  openness: number;        // 0-100: Receptivity to receive right now
}

// Agent 9: Burden Detector (Masked pain detection)
export type MinistryRecommendation = 'surface' | 'deeper' | 'crisis';

export interface BurdenDetection {
  maskedPain: boolean;
  sfumatoCoefficient: number;  // 0-100: Variance in expression (3-15% is healthy)
  suppressionIndicators: string[];
  ministryRecommendation: MinistryRecommendation;
}

// Agent 10: Authenticity Bridge (Word-to-face truth verification)
export interface AuthenticityBridge {
  statedEmotion: string;
  facialEmotion: string;
  incongruenceGap: number;  // 0-100: Gap between words and face
  trueNeed: string;
  ministryApproach: string;
}

// Combined Deep Soul Analysis (All 4 agents)
export interface DeepSoulAnalysis {
  // Original basic analysis
  archetype: ArchetypeKey;
  intensityScore: number;
  confidence: number;
  reasoning: string;

  // Agent 6: Temperament
  temperament: TemperamentAnalysis;

  // Agent 7: Emotional Weather
  emotionalWeather: EmotionalWeather;

  // Agent 9: Burden Detection
  burdenDetection: BurdenDetection;

  // Agent 10: Authenticity (requires text input)
  authenticityBridge?: AuthenticityBridge;

  // Synthesis
  trueNeed: string;
  ministryDepth: MinistryRecommendation;
}
