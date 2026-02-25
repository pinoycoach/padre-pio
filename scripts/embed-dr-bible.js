/**
 * PADRE PIO — FULL DOUAY-RHEIMS BIBLE EMBEDDER
 *
 * Source: scrollmapper/bible_databases (GitHub) — DRC.json
 *   "DRC: Douay-Rheims Bible, Challoner Revision"
 *   78 books · 37,255 verses · All deuterocanonical books included
 *
 * Strategy: fetch entire Bible → process ONE BOOK AT A TIME
 *   (embed → upsert → checkpoint). Crashed runs resume from
 *   the last completed book — no re-embedding needed.
 *
 * Run:  node --env-file=.env scripts/embed-dr-bible.js
 * Time: ~25-30 minutes first run, much faster on resume
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;
const PINECONE_API_KEY = process.env.VITE_PINECONE_API_KEY || process.env.PINECONE_API_KEY;
const RAW_HOST = process.env.VITE_PINECONE_HOST || process.env.PINECONE_HOST || '';
const PINECONE_HOST = 'https://' + RAW_HOST.replace(/^https?:\/\//, '');
const NAMESPACE = 'padre-pio';

const EMBED_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key=${GEMINI_API_KEY}`;
const DRC_JSON_URL = 'https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/DRC.json';
const PROGRESS_FILE = join(__dirname, '.dr-embed-progress.json');

const EMBED_BATCH = 25;   // verses per Gemini call
const UPSERT_BATCH = 100; // vectors per Pinecone upsert
const EMBED_DELAY = 800;  // ms between embedding batches
const UPSERT_DELAY = 300; // ms between upsert batches

function slugify(str) {
  return str.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

// ─── Progress / Resume ───────────────────────────────────────────────────────

function loadProgress() {
  if (existsSync(PROGRESS_FILE)) {
    try { return JSON.parse(readFileSync(PROGRESS_FILE, 'utf8')); } catch {}
  }
  return { completedBooks: [], totalVectors: 0 };
}

function saveProgress(progress) {
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// ─── Gemini embedding with retry ─────────────────────────────────────────────

async function embedBatch(texts, retries = 3) {
  const requests = texts.map(t => ({
    model: 'models/gemini-embedding-001',
    content: { parts: [{ text: t }] },
    outputDimensionality: 1024,
  }));

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(EMBED_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests }),
      });
      if (res.status === 429) {
        const wait = attempt * 15000;
        console.log(`\n  Gemini rate limited, waiting ${wait / 1000}s (attempt ${attempt})...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Gemini ${res.status}: ${err.slice(0, 200)}`);
      }
      const data = await res.json();
      return data.embeddings.map(e => e.values);
    } catch (err) {
      if (attempt === retries) throw err;
      const wait = attempt * 5000;
      console.log(`\n  Embed error (attempt ${attempt}): ${err.message.slice(0, 80)}, retrying in ${wait / 1000}s...`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

// ─── Pinecone upsert with retry ──────────────────────────────────────────────

async function upsertBatch(vectors, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
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
        throw new Error(`Pinecone ${res.status}: ${err.slice(0, 200)}`);
      }
      return res.json();
    } catch (err) {
      if (attempt === retries) throw err;
      const wait = attempt * 5000;
      console.log(`\n  Upsert error (attempt ${attempt}): ${err.message.slice(0, 80)}, retrying in ${wait / 1000}s...`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

// ─── Process one book: embed + upsert ────────────────────────────────────────

async function processBook(book, bookIndex, totalBooks) {
  const bookSlug = slugify(book.name);
  const verses = [];

  for (const chapter of book.chapters) {
    for (const v of chapter.verses) {
      const reference = `${book.name} ${chapter.chapter}:${v.verse}`;
      verses.push({
        id: `drc-${bookSlug}-${chapter.chapter}-${v.verse}`,
        text: `${reference} — ${v.text}`,
        metadata: {
          type: 'verse',
          reference,
          text: v.text,
          source: 'Douay-Rheims Challoner Bible (1899)',
          book: book.name,
          chapter: chapter.chapter,
          verse: v.verse,
        }
      });
    }
  }

  console.log(`\n[${bookIndex}/${totalBooks}] ${book.name} — ${verses.length} verses`);

  // Embed
  const vectors = [];
  for (let i = 0; i < verses.length; i += EMBED_BATCH) {
    const batch = verses.slice(i, i + EMBED_BATCH);
    process.stdout.write(`  Embedding ${i + 1}–${Math.min(i + EMBED_BATCH, verses.length)}/${verses.length}...  \r`);
    const embeddings = await embedBatch(batch.map(v => v.text));
    for (let j = 0; j < batch.length; j++) {
      vectors.push({ id: batch[j].id, values: embeddings[j], metadata: batch[j].metadata });
    }
    if (i + EMBED_BATCH < verses.length) {
      await new Promise(r => setTimeout(r, EMBED_DELAY));
    }
  }

  // Upsert (with delay between batches to avoid Pinecone rate limits)
  let upserted = 0;
  for (let i = 0; i < vectors.length; i += UPSERT_BATCH) {
    const batch = vectors.slice(i, i + UPSERT_BATCH);
    await upsertBatch(batch);
    upserted += batch.length;
    process.stdout.write(`  Upserted ${upserted}/${vectors.length} to Pinecone...  \r`);
    if (i + UPSERT_BATCH < vectors.length) {
      await new Promise(r => setTimeout(r, UPSERT_DELAY));
    }
  }

  console.log(`  ✓ ${book.name}: ${vectors.length} vectors done`);
  return vectors.length;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  PADRE PIO — DOUAY-RHEIMS CHALLONER BIBLE EMBEDDER');
  console.log('  Source: scrollmapper/bible_databases — DRC.json');
  console.log('  Strategy: per-book embed+upsert with resume checkpoint');
  console.log('═══════════════════════════════════════════════════════════\n');

  if (!GEMINI_API_KEY) throw new Error('VITE_GEMINI_API_KEY not set');
  if (!PINECONE_API_KEY) throw new Error('VITE_PINECONE_API_KEY or PINECONE_API_KEY not set');
  if (!RAW_HOST) throw new Error('VITE_PINECONE_HOST or PINECONE_HOST not set');

  // Fetch the Bible
  console.log('Fetching Douay-Rheims Challoner Bible from GitHub...');
  const res = await fetch(DRC_JSON_URL);
  if (!res.ok) throw new Error(`Failed to fetch DRC.json: ${res.status}`);
  const bible = await res.json();
  console.log(`✓ "${bible.translation}" — ${bible.books.length} books`);

  // Load progress
  const progress = loadProgress();
  const done = new Set(progress.completedBooks);
  let totalVectors = progress.totalVectors;

  if (done.size > 0) {
    console.log(`\nResuming — ${done.size} books already done (${totalVectors} vectors so far)`);
  }

  const startTime = Date.now();

  for (let i = 0; i < bible.books.length; i++) {
    const book = bible.books[i];

    if (done.has(book.name)) {
      console.log(`[${i + 1}/${bible.books.length}] ${book.name} — done, skipping`);
      continue;
    }

    const count = await processBook(book, i + 1, bible.books.length);
    totalVectors += count;

    // Save checkpoint after each book
    progress.completedBooks.push(book.name);
    progress.totalVectors = totalVectors;
    saveProgress(progress);

    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    console.log(`  Total: ${totalVectors} vectors | ${elapsed}min elapsed`);
  }

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  COMPLETE — ${totalVectors} DR Bible verses indexed`);
  console.log(`  Namespace: ${NAMESPACE} | Time: ${elapsed} minutes`);
  console.log('═══════════════════════════════════════════════════════════\n');

  // Clean up checkpoint
  try { unlinkSync(PROGRESS_FILE); } catch {}
}

main().catch(err => {
  console.error('\nFATAL:', err.message);
  console.error('Progress saved — re-run to resume from last completed book.');
  process.exit(1);
});
