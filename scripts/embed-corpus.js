/**
 * PADRE PIO — CORPUS EMBEDDER
 *
 * Embeds all three corpus files into Pinecone namespace: padre-pio
 *
 *   data/padrepio-quotes.json   (~120 quotes)
 *   data/dr-verses.json         (~130 Douay-Rheims verses)
 *   data/saint-excerpts.json    (~35 PD saint excerpts)
 *
 * Run from the padre-pio project root:
 *   node scripts/embed-corpus.js
 *
 * Requires .env (or environment variables):
 *   VITE_GEMINI_API_KEY
 *   VITE_PINECONE_API_KEY
 *   VITE_PINECONE_HOST  (e.g. https://padre-pio-xxxx.svc.pinecone.io)
 *
 * The Pinecone index must already exist with dimension=768 (text-embedding-004).
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
// No dotenv import needed — use: node --env-file=.env scripts/embed-corpus.js

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');

const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;
const PINECONE_API_KEY = process.env.VITE_PINECONE_API_KEY || process.env.PINECONE_API_KEY;
// Normalize host: strip protocol if present then re-add (matches pinecone-search.js behavior)
const RAW_HOST = process.env.VITE_PINECONE_HOST || process.env.PINECONE_HOST || '';
const PINECONE_HOST = 'https://' + RAW_HOST.replace(/^https?:\/\//, '');
const NAMESPACE = 'padre-pio';

// gemini-embedding-001 is available on v1beta batchEmbedContents
const EMBED_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key=${GEMINI_API_KEY}`;

const BATCH_SIZE = 50; // Gemini batch limit
const UPSERT_BATCH = 100; // Pinecone upsert batch limit
const DELAY_MS = 1500; // Rate-limit pause between Gemini batches

// ─── Load corpus files ───────────────────────────────────────────────────────

function loadQuotes() {
  const raw = JSON.parse(readFileSync(join(dataDir, 'padrepio-quotes.json'), 'utf8'));
  return raw.map(q => ({
    id: q.id,
    text: q.text,
    metadata: {
      type: 'quote',
      reference: `St. Padre Pio — ${q.source}`,  // human-readable reference
      text: q.text,                                // stored for retrieval display
      source: q.source,
      themes: q.themes.join(','),
      keywords: q.keywords.join(','),
    }
  }));
}

function loadDRVerses() {
  const raw = JSON.parse(readFileSync(join(dataDir, 'dr-verses.json'), 'utf8'));
  return raw.map(v => ({
    id: v.id,
    text: `${v.reference} — ${v.text}`,
    metadata: {
      type: 'verse',
      reference: v.reference,   // e.g. "Ps 23:1"
      text: v.text,             // just the verse text (not the reference prefix)
      source: 'Douay-Rheims Bible',
      themes: v.themes.join(','),
      keywords: v.keywords.join(','),
    }
  }));
}

function loadSaintExcerpts() {
  const raw = JSON.parse(readFileSync(join(dataDir, 'saint-excerpts.json'), 'utf8'));
  return raw.map(e => ({
    id: e.id,
    text: `${e.saint}: ${e.text}`,
    metadata: {
      type: 'excerpt',
      reference: e.saint,       // e.g. "St. Thérèse of Lisieux"
      text: e.text,             // the excerpt text
      source: e.source,
      saint: e.saint,
      themes: e.themes.join(','),
      keywords: e.keywords.join(','),
    }
  }));
}

// Also load the verified vault verses so they're searchable via RAG
function loadVaultVerses() {
  const raw = JSON.parse(readFileSync(join(dataDir, 'verified_vault.json'), 'utf8'));
  const items = [];
  for (const [archetypeKey, archetypeData] of Object.entries(raw.archetypes)) {
    for (const [idx, verse] of archetypeData.anchor_verses.entries()) {
      items.push({
        id: `vault-${archetypeKey.replace(/\s+/g, '-').toLowerCase()}-${idx}`,
        text: `${verse.reference} — ${verse.text}`,
        metadata: {
          type: 'verse',
          reference: verse.reference,                    // e.g. "Ps 23:1"
          text: verse.text,                              // just the verse text
          source: 'Douay-Rheims Bible (Verified Vault)',
          archetype: archetypeKey,
          whisper_tone: verse.whisper_tone,
          prompt_context: verse.prompt_context,
          themes: archetypeKey.toLowerCase().replace(/\s+/g, '-'),
          keywords: verse.keywords || '',
        }
      });
    }
  }
  return items;
}

// ─── Embedding ───────────────────────────────────────────────────────────────

async function embedBatch(texts) {
  const requests = texts.map(t => ({
    model: 'models/gemini-embedding-001',
    content: { parts: [{ text: t }] },
    outputDimensionality: 1024,
  }));

  const res = await fetch(EMBED_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini embed failed: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.embeddings.map(e => e.values);
}

// ─── Pinecone upsert ─────────────────────────────────────────────────────────

async function upsertBatch(vectors) {
  const res = await fetch(`${PINECONE_HOST}/vectors/upsert`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Api-Key': PINECONE_API_KEY,
    },
    body: JSON.stringify({ vectors, namespace: NAMESPACE })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Pinecone upsert failed: ${res.status} ${err}`);
  }

  return res.json();
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function embedAndUpsert(label, items) {
  console.log(`\n[${label}] Processing ${items.length} items...`);

  const vectors = [];

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const texts = batch.map(item => item.text);

    process.stdout.write(`  Embedding batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(items.length / BATCH_SIZE)}... `);

    try {
      const embeddings = await embedBatch(texts);
      for (let j = 0; j < batch.length; j++) {
        vectors.push({
          id: batch[j].id,
          values: embeddings[j],
          metadata: batch[j].metadata,
        });
      }
      console.log(`OK (${embeddings.length} embeddings)`);
    } catch (err) {
      console.error(`FAILED: ${err.message}`);
      throw err;
    }

    // Respect rate limits
    if (i + BATCH_SIZE < items.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  // Upsert to Pinecone in batches
  console.log(`  Upserting ${vectors.length} vectors to Pinecone namespace="${NAMESPACE}"...`);
  for (let i = 0; i < vectors.length; i += UPSERT_BATCH) {
    const batch = vectors.slice(i, i + UPSERT_BATCH);
    await upsertBatch(batch);
    process.stdout.write(`  Upserted ${Math.min(i + UPSERT_BATCH, vectors.length)}/${vectors.length}\r`);
  }

  console.log(`\n[${label}] Done — ${vectors.length} vectors upserted.`);
  return vectors.length;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  PADRE PIO — CORPUS EMBEDDER');
  console.log('  Namespace:', NAMESPACE);
  console.log('  Host:', PINECONE_HOST);
  console.log('═══════════════════════════════════════════════════════');

  if (!GEMINI_API_KEY) throw new Error('VITE_GEMINI_API_KEY not set');
  if (!PINECONE_API_KEY) throw new Error('VITE_PINECONE_API_KEY or PINECONE_API_KEY not set');
  if (!PINECONE_HOST) throw new Error('VITE_PINECONE_HOST or PINECONE_HOST not set');

  const quotes = loadQuotes();
  const drVerses = loadDRVerses();
  const saintExcerpts = loadSaintExcerpts();
  const vaultVerses = loadVaultVerses();

  const total =
    await embedAndUpsert('Padre Pio Quotes', quotes) +
    await embedAndUpsert('DR Verses (Additional)', drVerses) +
    await embedAndUpsert('Saint Excerpts (PD)', saintExcerpts) +
    await embedAndUpsert('Verified Vault Verses', vaultVerses);

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  COMPLETE — ${total} total vectors in Pinecone`);
  console.log(`  Namespace: ${NAMESPACE}`);
  console.log('═══════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
