/**
 * PADRE PIO — FULL DOUAY-RHEIMS BIBLE EMBEDDER
 *
 * Source: scrollmapper/bible_databases (GitHub) — DRC.json
 *   "DRC: Douay-Rheims Bible, Challoner Revision"
 *   78 books · 37,255 verses · All deuterocanonical books included
 *   Public domain — free to use
 *
 * Strategy: ONE fetch for the entire Bible (~5MB JSON), then
 *   embed in batches of 25 verses using gemini-embedding-001,
 *   upsert to Pinecone namespace "padre-pio" in batches of 100.
 *
 * Run from the padre-pio project root:
 *   node --env-file=.env scripts/embed-dr-bible.js
 *
 * Estimated time: ~20-25 minutes (1491 embedding batches at ~800ms delay)
 * Estimated vectors added: ~37,255
 * Pinecone free tier limit: 100,000 — current: ~365 — plenty of room.
 */

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;
const PINECONE_API_KEY = process.env.VITE_PINECONE_API_KEY || process.env.PINECONE_API_KEY;
const RAW_HOST = process.env.VITE_PINECONE_HOST || process.env.PINECONE_HOST || '';
const PINECONE_HOST = 'https://' + RAW_HOST.replace(/^https?:\/\//, '');
const NAMESPACE = 'padre-pio';

const EMBED_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key=${GEMINI_API_KEY}`;
const DRC_JSON_URL = 'https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/DRC.json';

const EMBED_BATCH = 25;   // verses per Gemini batchEmbedContents call
const UPSERT_BATCH = 100; // vectors per Pinecone upsert
const DELAY_MS = 800;     // pause between embedding batches (Gemini rate limit)

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slugify(str) {
  return str.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

// ─── Gemini embedding ─────────────────────────────────────────────────────────

async function embedBatch(texts) {
  const requests = texts.map(t => ({
    model: 'models/gemini-embedding-001',
    content: { parts: [{ text: t }] },
    outputDimensionality: 1024,
  }));
  const res = await fetch(EMBED_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini embed failed: ${res.status} — ${err.slice(0, 300)}`);
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
    body: JSON.stringify({ vectors, namespace: NAMESPACE }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Pinecone upsert failed: ${res.status} — ${err.slice(0, 300)}`);
  }
  return res.json();
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  PADRE PIO — DOUAY-RHEIMS CHALLONER BIBLE EMBEDDER');
  console.log('  Source: scrollmapper/bible_databases — DRC.json');
  console.log('  Namespace:', NAMESPACE, '| Host:', PINECONE_HOST.slice(0, 50) + '...');
  console.log('═══════════════════════════════════════════════════════════\n');

  if (!GEMINI_API_KEY) throw new Error('VITE_GEMINI_API_KEY not set');
  if (!PINECONE_API_KEY) throw new Error('VITE_PINECONE_API_KEY or PINECONE_API_KEY not set');
  if (!RAW_HOST) throw new Error('VITE_PINECONE_HOST or PINECONE_HOST not set');

  // ── Step 1: Fetch the entire DR Bible (one HTTP request) ──────────────────
  console.log('Fetching Douay-Rheims Challoner Bible from GitHub...');
  const res = await fetch(DRC_JSON_URL);
  if (!res.ok) throw new Error(`Failed to fetch DRC.json: ${res.status}`);
  const bible = await res.json();
  console.log(`✓ Fetched: "${bible.translation}"`);

  // ── Step 2: Flatten to verse array ────────────────────────────────────────
  console.log('Flattening to verses...');
  const verses = [];
  for (const book of bible.books) {
    const bookSlug = slugify(book.name);
    for (const chapter of book.chapters) {
      for (const v of chapter.verses) {
        const reference = `${book.name} ${chapter.chapter}:${v.verse}`;
        verses.push({
          id: `drc-${bookSlug}-${chapter.chapter}-${v.verse}`,
          // Text fed to embedding model: reference + verse text for better semantic matching
          text: `${reference} — ${v.text}`,
          metadata: {
            type: 'verse',
            reference,                          // e.g. "Genesis 1:1"
            text: v.text,                       // just the verse text (for display)
            source: 'Douay-Rheims Challoner Bible (1899)',
            book: book.name,
            chapter: chapter.chapter,
            verse: v.verse,
          }
        });
      }
    }
  }
  console.log(`✓ Flattened: ${verses.length} verses from ${bible.books.length} books\n`);

  // ── Step 3: Embed in batches ──────────────────────────────────────────────
  console.log(`Embedding ${verses.length} verses (${Math.ceil(verses.length / EMBED_BATCH)} batches of ${EMBED_BATCH})...`);
  console.log('Estimated time: ~20-25 minutes\n');

  const vectors = [];
  const startTime = Date.now();

  for (let i = 0; i < verses.length; i += EMBED_BATCH) {
    const batch = verses.slice(i, i + EMBED_BATCH);
    const texts = batch.map(v => v.text);

    const batchNum = Math.floor(i / EMBED_BATCH) + 1;
    const totalBatches = Math.ceil(verses.length / EMBED_BATCH);
    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    const pct = ((i / verses.length) * 100).toFixed(1);

    process.stdout.write(
      `  Batch ${batchNum}/${totalBatches} (${pct}% · ${elapsed}min) — ${batch[0].metadata.reference}...     \r`
    );

    let embeddings;
    try {
      embeddings = await embedBatch(texts);
    } catch (err) {
      // On rate limit, wait longer and retry once
      if (err.message.includes('429') || err.message.includes('rate')) {
        console.log(`\n  Rate limited at batch ${batchNum}, waiting 30s...`);
        await new Promise(r => setTimeout(r, 30000));
        embeddings = await embedBatch(texts);
      } else {
        throw err;
      }
    }

    for (let j = 0; j < batch.length; j++) {
      vectors.push({
        id: batch[j].id,
        values: embeddings[j],
        metadata: batch[j].metadata,
      });
    }

    // Rate limit pause between batches
    if (i + EMBED_BATCH < verses.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  const embedTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n✓ Embedded ${vectors.length} verses in ${embedTime} minutes\n`);

  // ── Step 4: Upsert to Pinecone ────────────────────────────────────────────
  console.log(`Upserting ${vectors.length} vectors to Pinecone namespace="${NAMESPACE}"...`);
  let upserted = 0;

  for (let i = 0; i < vectors.length; i += UPSERT_BATCH) {
    const batch = vectors.slice(i, i + UPSERT_BATCH);
    await upsertBatch(batch);
    upserted += batch.length;
    process.stdout.write(`  Upserted ${upserted}/${vectors.length}...  \r`);
  }

  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  console.log(`\n\n═══════════════════════════════════════════════════════════`);
  console.log(`  COMPLETE — ${vectors.length} DR Bible verses indexed`);
  console.log(`  Namespace: ${NAMESPACE} | Total time: ${totalTime} minutes`);
  console.log(`\n  Your Pinecone index now contains the full Catholic`);
  console.log(`  Douay-Rheims Bible (DRC) — all 78 books including`);
  console.log(`  deuterocanonicals: Tobit, Judith, Wisdom, Sirach,`);
  console.log(`  Baruch, 1+2 Maccabees, and more.`);
  console.log(`═══════════════════════════════════════════════════════════\n`);
}

main().catch(err => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
