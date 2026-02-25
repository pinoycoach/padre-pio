// ═══════════════════════════════════════════════════════════════════════════
// PADRE PIO — CONSTANTS
// Catholic spiritual direction companion
// ═══════════════════════════════════════════════════════════════════════════

// Feeling chips for quick selection (multi-sensory entry)
export const FEELING_CHIPS = [
  { id: 'anxious', label: 'Anxious', emoji: '😰' },
  { id: 'overwhelmed', label: 'Overwhelmed', emoji: '😩' },
  { id: 'lonely', label: 'Lonely', emoji: '🥺' },
  { id: 'grateful', label: 'Grateful', emoji: '🙏' },
  { id: 'guilty', label: 'Guilty', emoji: '😔' },
  { id: 'lost', label: 'Lost', emoji: '🧭' },
  { id: 'tired', label: 'Tired', emoji: '😴' },
  { id: 'hopeful', label: 'Hopeful', emoji: '✨' },
  { id: 'sad', label: 'Sad', emoji: '😢' },
  { id: 'scrupulous', label: 'Scrupulous', emoji: '😟' },
  { id: 'doubtful', label: 'Doubtful', emoji: '❓' },
  { id: 'peaceful', label: 'Peaceful', emoji: '🕊️' },
] as const;

export type FeelingId = typeof FEELING_CHIPS[number]['id'];

// Text fallback suggestions (contextual prompts)
export const SUGGESTIONS = [
  "I keep falling into the same sin and feel ashamed",
  "I feel nothing when I pray — God seems far away",
  "I am carrying a cross I didn't choose",
  "I'm afraid I'm not forgiven",
  "I've been away from the Church and don't know how to return",
  "I'm grieving and struggling to find hope",
  "I feel overwhelmed and don't know how to trust God right now",
  "I'm exhausted from fighting the same battle over and over",
  "I feel guilty but I'm not sure I'm truly sorry",
  "I'm in the dark — spiritually dry and empty",
  "I'm suffering and I don't understand why God allows it",
  "I feel close to God today and want to stay here",
];

// Sacred Loop loading messages for each stage
export const LOADING_MESSAGES = {
  mirror: [
    "Be still...",
    "Quieting the noise...",
  ],
  diagnosis: [
    "Reading your soul...",
    "Discerning your spiritual season...",
    "Sensing what lies beneath the words...",
    "Listening for what your heart reveals...",
  ],
  anchor: [
    "Seeking a word for your journey...",
    "Opening the treasury...",
    "Finding a lamp for your path...",
  ],
  whisper: [
    "Preparing the word...",
    "Listening for the Father's voice...",
    "Crafting words of truth and comfort...",
  ]
};

// Legacy mode selector (kept for text fallback)
export const GIFT_MODES = [
  { id: 'peace', label: 'Peace', icon: '🕊️', desc: 'For anxiety and stress' },
  { id: 'wisdom', label: 'Wisdom', icon: '🕯️', desc: 'For guidance and clarity' },
  { id: 'rest', label: 'Rest', icon: '✨', desc: 'For sleep and comfort' },
] as const;

export type GiftMode = typeof GIFT_MODES[number]['id'];

// ═══════════════════════════════════════════════════════════════════════════
// ARCHETYPE SYSTEM
// Based on the 8 soul-states Padre Pio actually directed in the confessional.
// ═══════════════════════════════════════════════════════════════════════════

export const ARCHETYPE_ICONS: Record<string, string> = {
  'The Penitent':          '🕯️',
  'The Wandering Soul':    '🧭',
  'The Suffering Servant': '✝️',
  'The Scrupulous Soul':   '😟',
  'The Desolate Heart':    '🌑',
  'The Grieving Soul':     '🌹',
  'The Consoled Soul':     '☀️',
  'The Wounded Pilgrim':   '🚶',
};

// Archetype color classes (for dynamic styling)
export const ARCHETYPE_COLORS: Record<string, string> = {
  'The Penitent':          'amber',
  'The Wandering Soul':    'sky',
  'The Suffering Servant': 'red',
  'The Scrupulous Soul':   'violet',
  'The Desolate Heart':    'slate',
  'The Grieving Soul':     'rose',
  'The Consoled Soul':     'emerald',
  'The Wounded Pilgrim':   'orange',
};

// Feeling-to-Archetype mapping hints (used when combining stated feeling with camera)
export const FEELING_ARCHETYPE_HINTS: Record<FeelingId, string[]> = {
  'anxious':    ['The Scrupulous Soul', 'The Wandering Soul', 'The Desolate Heart'],
  'overwhelmed':['The Suffering Servant', 'The Wounded Pilgrim', 'The Penitent'],
  'lonely':     ['The Wandering Soul', 'The Desolate Heart', 'The Grieving Soul'],
  'grateful':   ['The Consoled Soul', 'The Wounded Pilgrim'],
  'guilty':     ['The Penitent', 'The Scrupulous Soul'],
  'lost':       ['The Wandering Soul', 'The Desolate Heart'],
  'tired':      ['The Suffering Servant', 'The Wounded Pilgrim'],
  'hopeful':    ['The Consoled Soul', 'The Wandering Soul'],
  'sad':        ['The Grieving Soul', 'The Desolate Heart', 'The Wandering Soul'],
  'scrupulous': ['The Scrupulous Soul', 'The Penitent'],
  'doubtful':   ['The Desolate Heart', 'The Wandering Soul'],
  'peaceful':   ['The Consoled Soul'],
};

// Voice mapping for TTS based on whisper_tone
export const VOICE_MAP: Record<string, string> = {
  'Puck': 'Puck',     // Soft, gentle - for comfort
  'Kore': 'Kore',     // Deep, grounding - for wisdom
  'Fenrir': 'Fenrir', // Very deep, slow - for rest
};

// Camera capture settings
export const CAMERA_CONFIG = {
  captureDelay: 3000,        // 3 seconds
  countdownStart: 3,
  facingMode: 'user',        // Front camera
  idealWidth: 640,
  idealHeight: 480,
};

// View states for the Sacred Loop
export type ViewState =
  | 'welcome'     // NEW: Initial welcome with feeling selection
  | 'mirror'      // Screen 1: Camera capture
  | 'diagnosis'   // Screen 2: Soul analysis
  | 'anchor'      // Screen 3: Scripture preview
  | 'whisper'     // Screen 4: Final reveal
  | 'input'       // Fallback: Text input mode
  | 'novena';     // Screen 5: Novena tracker
