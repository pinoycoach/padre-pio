// ═══════════════════════════════════════════════════════════════════════════
// STILL SMALL VOICE - CONSTANTS
// Multi-sensory spiritual companion with Da Vinci principles
// ═══════════════════════════════════════════════════════════════════════════

// Feeling chips for quick selection (multi-sensory entry)
export const FEELING_CHIPS = [
  { id: 'anxious', label: 'Anxious', emoji: '😰' },
  { id: 'overwhelmed', label: 'Overwhelmed', emoji: '😩' },
  { id: 'lonely', label: 'Lonely', emoji: '🥺' },
  { id: 'grateful', label: 'Grateful', emoji: '🙏' },
  { id: 'lost', label: 'Lost', emoji: '🧭' },
  { id: 'tired', label: 'Tired', emoji: '😴' },
  { id: 'angry', label: 'Angry', emoji: '😤' },
  { id: 'hopeful', label: 'Hopeful', emoji: '✨' },
  { id: 'sad', label: 'Sad', emoji: '😢' },
  { id: 'peaceful', label: 'Peaceful', emoji: '🕊️' },
  { id: 'doubtful', label: 'Doubtful', emoji: '❓' },
  { id: 'joyful', label: 'Joyful', emoji: '😊' },
] as const;

export type FeelingId = typeof FEELING_CHIPS[number]['id'];

// Text fallback suggestions (contextual prompts)
export const SUGGESTIONS = [
  "I have a big day tomorrow and I'm feeling anxious",
  "I feel lonely and forgotten",
  "I need guidance on a difficult decision",
  "I can't sleep, my mind is racing",
  "I feel like I'm not enough",
  "I'm carrying too much responsibility",
  "I feel angry but can't express it",
  "I'm exhausted from helping everyone",
  "I'm struggling to believe",
  "I feel grateful but also guilty",
  "I'm waiting for something that may never come",
  "I want to celebrate but feel alone",
];

// Sacred Loop loading messages for each stage
export const LOADING_MESSAGES = {
  mirror: [
    "Be still...",
    "Quieting the noise...",
  ],
  diagnosis: [
    "Reading your expression...",
    "Sensing the geometry of your soul...",
    "Discerning your spiritual season...",
    "Listening to what your eyes reveal...",
  ],
  anchor: [
    "Finding the anchor...",
    "Seeking ancient wisdom...",
    "Finding a lamp for your feet...",
  ],
  whisper: [
    "Preparing the whisper...",
    "Listening for the still small voice...",
    "Crafting words of comfort...",
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
// ARCHETYPE SYSTEM (Da Vinci Principles)
// ═══════════════════════════════════════════════════════════════════════════
//
// Based on Leonardo's understanding of the human soul through:
// 1. SFUMATO - The smoky quality of emotion, what lies beneath the surface
// 2. CONTRAPPOSTO - The tension between opposing forces in the soul
// 3. CHIAROSCURO - The play of light and shadow in human expression
//
// Each archetype represents a distinct soul-state that can be discerned
// through facial geometry, micro-expressions, and stated feelings.
// ═══════════════════════════════════════════════════════════════════════════

export const ARCHETYPE_ICONS: Record<string, string> = {
  'Burdened Ruler': '👑',
  'Lost Child': '🧭',
  'Wounded Healer': '💜',
  'Silent Storm': '⛈️',
  'Anxious Achiever': '🏆',
  'Faithful Doubter': '❓',
  'Joyful Servant': '☀️',
  'Weary Warrior': '🛡️',
};

// Archetype color classes (for dynamic styling)
export const ARCHETYPE_COLORS: Record<string, string> = {
  'Burdened Ruler': 'amber',
  'Lost Child': 'sky',
  'Wounded Healer': 'rose',
  'Silent Storm': 'slate',
  'Anxious Achiever': 'orange',
  'Faithful Doubter': 'violet',
  'Joyful Servant': 'emerald',
  'Weary Warrior': 'red',
};

// Feeling-to-Archetype mapping hints (used when combining stated feeling with camera)
export const FEELING_ARCHETYPE_HINTS: Record<FeelingId, string[]> = {
  'anxious': ['Anxious Achiever', 'Lost Child', 'Faithful Doubter'],
  'overwhelmed': ['Burdened Ruler', 'Weary Warrior', 'Wounded Healer'],
  'lonely': ['Lost Child', 'Silent Storm', 'Wounded Healer'],
  'grateful': ['Joyful Servant', 'Wounded Healer'],
  'lost': ['Lost Child', 'Faithful Doubter'],
  'tired': ['Weary Warrior', 'Burdened Ruler', 'Wounded Healer'],
  'angry': ['Silent Storm', 'Weary Warrior'],
  'hopeful': ['Joyful Servant', 'Faithful Doubter'],
  'sad': ['Wounded Healer', 'Silent Storm', 'Lost Child'],
  'peaceful': ['Joyful Servant'],
  'doubtful': ['Faithful Doubter', 'Lost Child'],
  'joyful': ['Joyful Servant'],
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
  | 'input';      // Fallback: Text input mode
