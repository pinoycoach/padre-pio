# Padre Pio — Handover Notes for Claude Chat

## What This Is
A Claude Code → Claude Chat handover document covering everything built, the current state of the app, the vision, and what comes next.

---

## Project Overview
**Padre Pio** is an AI-powered Catholic spiritual direction app. It reads the user's emotional/spiritual state (via camera, text, or voice), maps it to one of 8 soul-state archetypes, retrieves semantically matched scripture from the full Douay-Rheims Bible (37,620 vectors in Pinecone), generates a personalized prayer grounded in Padre Pio's theology, and delivers it as a parchment prayer card with optional TTS audio in Padre Pio's voice.

**Live URL**: `padre-pio-sooty.vercel.app`
**Repo**: `github.com/pinoycoach/padre-pio`
**Stack**: React + TypeScript + Vite + Tailwind, Vercel serverless, Gemini (analysis + embedding), Pinecone (vector DB), Inworld (TTS)

---

## What Has Been Built (Phases 1–3)

### Phase 1 — Foundation (forked from still-small-voice)
- React SPA with camera capture, text input, voice input (Gemini audio transcription)
- Gemini-powered deep soul analysis → archetype classification
- Prayer generation (50-word devotional + scripture grounding)
- Inworld TTS audio generation (Padre Pio voice)
- Audio visualizer, play/pause, MP3 download
- Crisis detection (pre-flight regex on text + sfumatoCoefficient threshold)
- National Suicide Prevention Lifeline + Crisis Text Line integration
- Vercel Edge Functions for API proxying (pinecone-search, inworld-tts, gemini)

### Phase 2 — Catholic Identity + Corpus
- **8 soul-state archetypes**: The Burdened Soul, The Desolate Heart, The Restless Seeker, The Wounded Penitent, The Anxious Spirit, The Grieving Heart, The Doubting Thomas, The Grateful Pilgrim
- **Padre Pio persona**: confessional tone, theology of redemptive suffering, stigmata references
- **Corpus embedded in Pinecone** (namespace: `padre-pio`, 1024-dim, gemini-embedding-001):
  - 120 Padre Pio quotes (padrepio-quotes.json)
  - 130 DR sample verses (dr-verses.json)
  - 35 public domain saint excerpts (saint-excerpts.json)
  - ~80 verified vault verses (verified_vault.json)
  - **Total Phase 2: 365 vectors**

### Phase 3 — Parchment + Full Bible + Novenas
- **CSS Parchment Prayer Card**: Whisper screen redesigned as warm aged-paper card (EB Garamond italic, brown ink, cross divider). Zero image API cost.
- **Downloadable Prayer Card**: `services/parchmentService.ts` — pure Canvas API renders 1080x1350 PNG (parchment background, paper texture, prayer text, scripture, Padre Pio footer). Download via "Card" button.
- **Full Douay-Rheims Bible**: 78 books, 37,255 verses indexed from scrollmapper/bible_databases DRC.json. Script: `scripts/embed-dr-bible.js`. **Total: 37,620 vectors in Pinecone.**
- **Novenas**: `data/novenas.json` with 2 full 9-day novenas:
  1. Novena to St. Padre Pio (Faith, Hope, Charity, Purity, Suffering, Purgatory, Sinners, Church, Final Perseverance)
  2. Efficacious Novena to the Sacred Heart (Padre Pio's signature daily prayer)
- **Novena tracker**: Day-by-day UI, progress bar (9 dots), localStorage persistence, accessible from welcome screen (prominent card with BookOpen icon)
- **3-button whisper layout**: New | Card (PNG download) | Audio (MP3 download)
- **Google Fonts**: Cinzel, EB Garamond, Dancing Script, Lato loaded in index.html

---

## Architecture

### Key Files
| File | Purpose |
|------|---------|
| `App.tsx` | Main SPA — all views (welcome, mirror, diagnosis, anchor, whisper, novena), state, handlers |
| `constants.ts` | ViewState type, 8 archetypes, feeling chips, suggestions, loading messages |
| `services/geminiService.ts` | SVG archetype fallback images, generateWhisperImage (no API by default) |
| `services/leonardoService.ts` | Deep soul analysis via Gemini (archetype + sfumatoCoefficient) |
| `services/librarianService.ts` | RAG: Pinecone search, Gemini synthesis, grounded whisper prayer |
| `services/inworldService.ts` | TTS audio via Inworld API |
| `services/parchmentService.ts` | Canvas to PNG parchment card renderer |
| `services/audioService.ts` | Gemini audio transcription + recorder |
| `services/visionService.ts` | Cloud Vision emotion detection from camera |
| `api/pinecone-search.js` | Vercel Edge Function — embeds query + searches Pinecone |
| `api/inworld-tts.js` | Vercel Edge Function — proxies TTS request to Inworld |
| `scripts/embed-corpus.js` | Embeds quotes + sample verses + excerpts + vault (365 vectors) |
| `scripts/embed-dr-bible.js` | Embeds full 78-book DR Bible (37,255 vectors) with per-book checkpoint |
| `data/novenas.json` | 2 full 9-day novenas with daily prayer, scripture, meditation |
| `data/padrepio-quotes.json` | 120 Padre Pio quotes with themes/keywords |
| `data/dr-verses.json` | 130 curated DR verses (sample set) |
| `data/saint-excerpts.json` | 35 public domain saint excerpts |
| `data/verified_vault.json` | Archetype-mapped anchor verses with whisper tones |

### Environment Variables (Vercel + .env)
| Variable | Service |
|----------|---------|
| `VITE_GEMINI_API_KEY` | Google Gemini (analysis, embedding, audio transcription) |
| `VITE_PINECONE_API_KEY` | Pinecone vector DB |
| `VITE_PINECONE_HOST` | Pinecone index host URL |
| `VITE_INWORLD_API_KEY` | Inworld TTS (base64-encoded key) |
| `VITE_INWORLD_VOICE_ID` | Inworld voice ID (currently "Luna") |
| `VITE_CLOUD_VISION_API_KEY` | Google Cloud Vision (camera emotion detection) |

**Important**: `VITE_` prefix vars are baked into the JS bundle at build time. They MUST be set in Vercel BEFORE deploying. Missing = `void 0` in bundle.

### Pinecone Configuration
- **Index**: 1024 dimensions, cosine similarity
- **Namespace**: `padre-pio`
- **Model**: `gemini-embedding-001` with `outputDimensionality: 1024`
- **Total vectors**: 37,620
- **Free tier limit**: 100,000 vectors (plenty of room)

---

## Known Issues / Technical Debt
1. **Bundle size** (~590KB minified) — single chunk, no code splitting. Could split novenas + parchment into lazy-loaded chunks.
2. **Inworld voice ID** — currently "Luna" (female). A male Padre Pio voice would be more authentic. Inworld may offer custom voice cloning.
3. **`VITE_INWORLD_VOICE_ID=Luna`** has a leading space in `.env` (minor, works despite it).
4. **Server folder** (`server/`) has unrelated TypeScript errors (assemblyai, ws, dotenv imports) — leftover from still-small-voice fork. Not used in production.
5. **No user accounts** — all state is localStorage (novena progress). This is intentional for privacy but limits cross-device sync.
6. **TTS graceful degradation** — if Inworld fails, silently shows text-only prayer. No error banner. This is correct behavior.

---

## Monetization Architecture (Ready to Implement)

### Free Tier (costs ~$0.001/prayer)
- Text/voice soul analysis (Gemini text API)
- DR Bible scripture matching (Pinecone free tier)
- Parchment prayer card (Canvas render — $0.00)
- Prayer card PNG download ($0.00)
- Novenas with day tracker ($0.00)

### Premium Tier ($3.99/month — proposed)
- Camera soul reading (Gemini Vision ~$0.01/analysis)
- Hear Padre Pio's voice / TTS audio (Inworld ~$0.02/prayer)
- Audio MP3 download
- Additional saints (future)
- Priority: implement paywall around camera + TTS using Stripe or RevenueCat

### Implementation
- Gate `startCamera()` and `generateInworldTTSAudio()` behind a `isPremium` flag
- Add Stripe Checkout or RevenueCat for subscription management
- Store subscription status in localStorage (or a simple KV store like Vercel KV)
- Free users see "Upgrade to hear Padre Pio speak" on the play button

---

## What Comes Next (Phase 4+)

### Phase 4: Multi-Saint Spiritual Direction
- St. Therese of Lisieux — the Little Way (for scrupulosity, small daily suffering)
- St. John of the Cross — Dark Night of the Soul (for spiritual dryness)
- St. Faustina — Divine Mercy (for guilt, despair, fear of judgment)
- Each saint: own corpus (quotes + writings), own Inworld voice, own archetype weights, own novena
- "Choose your spiritual director" selector on welcome screen

### Phase 5: Confession & Examen Prep
- Guided examination of conscience (Ten Commandments framework, DR text)
- NOT replacing confession — preparing for it
- Act of contrition generator personalized to examined sins
- "When was your last confession?" gentle prompt

### Phase 6: Community & Parish
- Anonymous prayer intention sharing
- Parish white-label (custom branding + parish-specific content)
- Priest dashboard: see anonymized spiritual state trends in the parish

---

## What We've Achieved That Hallow Cannot Do
1. **AI soul discernment** — reads your face/text/voice, not a menu selection
2. **Full Catholic Bible as semantic memory** — 37,620 DR verses matched by meaning, not keywords
3. **Theology of suffering** — Padre Pio's stigmata spirituality, not wellness content
4. **Generated prayer** — fresh every time, grounded in real scripture + real Padre Pio quotes
5. **Downloadable parchment cards** — zero cost, shareable, beautiful
6. **Interactive novenas** — not audio playback, real day-by-day commitment tracking
7. **Crisis intervention** — built into the spiritual experience, not an afterthought
8. **Deuterocanonical books** — full Catholic canon (Tobit, Wisdom, Sirach, Baruch, Maccabees)
9. **Zero-cost free tier** — a meaningful spiritual experience at $0/prayer

---

## Git History (key commits)
```
f634f0a feat: downloadable parchment prayer card + prominent novena button
85fe251 fix(embed): per-book processing with retry + resume checkpoint
afa9d64 fix(embed): use scrollmapper DRC.json (bible-api.com doesn't support DR)
cd29cc2 feat(phase3): parchment prayer card, novenas tracker, full DR Bible embed script
c413440 [Phase 2 fixes: crisis banner, TTS graceful degradation, metadata fix, cleanup]
3379cc5 Add Slot Decision Panel — market worthiness check for finite Merch slots
06e3385 Set temperature 0 for scoring agents, 0.7 for synthesis narrative
991833f Fix: resize + compress images client-side before upload
cc6c084 Set maxDuration 300 — Vercel Pro, supports large batch analysis
c287e1d Build POD Vinci v1.0 — 8-agent Commercial Resonance Analyzer
```

---

## Non-Negotiables
- **Crisis detection always runs** — before any AI processing
- **No data stored permanently** — no accounts, no tracking, no selling data
- **AI never dismisses suffering** — no "just pray about it" for genuine crisis
- **Suicide prevention resources always visible** when crisis is detected
- **Public domain only** — DR Bible, Padre Pio quotes (died 1968, writings in PD where applicable)
- **No replacement for sacraments** — this supplements, never substitutes
