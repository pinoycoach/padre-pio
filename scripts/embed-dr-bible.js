/**
 * PADRE PIO — FULL DOUAY-RHEIMS BIBLE EMBEDDER
 *
 * Fetches all 73 books of the Douay-Rheims Bible (1899) from bible-api.com,
 * embeds them with Gemini embedding-001, and upserts into Pinecone.
 *
 * Includes all 7 deuterocanonical books absent from the KJV:
 *   Tobit, Judith, 1 Maccabees, 2 Maccabees, Wisdom, Sirach (Ecclesiasticus), Baruch
 *
 * Run from the padre-pio project root:
 *   node --env-file=.env scripts/embed-dr-bible.js
 *
 * Estimated time: ~15-20 minutes (1329 chapter fetches + ~1244 embedding batches)
 * Estimated vectors: ~31,100 verses
 * Pinecone free tier limit: 100,000 vectors (current: ~365 — plenty of room)
 *
 * Progress is logged to console and a resume checkpoint is saved to
 * scripts/.dr-embed-progress.json so you can restart interrupted runs.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;
const PINECONE_API_KEY = process.env.VITE_PINECONE_API_KEY || process.env.PINECONE_API_KEY;
const RAW_HOST = process.env.VITE_PINECONE_HOST || process.env.PINECONE_HOST || '';
const PINECONE_HOST = 'https://' + RAW_HOST.replace(/^https?:\/\//, '');
const NAMESPACE = 'padre-pio';

const EMBED_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key=${GEMINI_API_KEY}`;
const BIBLE_API_BASE = 'https://bible-api.com';
const TRANSLATION = 'douayrheims';

const EMBED_BATCH = 25;   // verses per Gemini batch
const UPSERT_BATCH = 100; // vectors per Pinecone upsert
const PARALLEL_FETCH = 4; // chapters to fetch in parallel
const DELAY_EMBED_MS = 800;  // pause between embedding batches (rate limit)
const DELAY_FETCH_MS = 300;  // pause between chapter fetch groups

const PROGRESS_FILE = join(__dirname, '.dr-embed-progress.json');

// ─── All 73 Douay-Rheims Books ──────────────────────────────────────────────
// Format: [apiName, displayName, abbreviation, chapterCount]
// apiName is what bible-api.com accepts in the URL (URL-encoded if needed)
const BOOKS = [
  // Old Testament (46 books)
  ['genesis', 'Genesis', 'Gn', 50],
  ['exodus', 'Exodus', 'Ex', 40],
  ['leviticus', 'Leviticus', 'Lv', 27],
  ['numbers', 'Numbers', 'Nm', 36],
  ['deuteronomy', 'Deuteronomy', 'Dt', 34],
  ['joshua', 'Joshua', 'Jos', 24],
  ['judges', 'Judges', 'Jgs', 21],
  ['ruth', 'Ruth', 'Ru', 4],
  ['1+samuel', '1 Samuel', '1 Sm', 31],
  ['2+samuel', '2 Samuel', '2 Sm', 24],
  ['1+kings', '1 Kings', '1 Kgs', 22],
  ['2+kings', '2 Kings', '2 Kgs', 25],
  ['1+chronicles', '1 Chronicles', '1 Chr', 29],
  ['2+chronicles', '2 Chronicles', '2 Chr', 36],
  ['ezra', 'Ezra', 'Ezr', 10],
  ['nehemiah', 'Nehemiah', 'Neh', 13],
  ['tobit', 'Tobit', 'Tb', 14],           // Deuterocanonical
  ['judith', 'Judith', 'Jdt', 16],         // Deuterocanonical
  ['esther', 'Esther', 'Est', 16],
  ['1+maccabees', '1 Maccabees', '1 Mc', 16],  // Deuterocanonical
  ['2+maccabees', '2 Maccabees', '2 Mc', 15],  // Deuterocanonical
  ['job', 'Job', 'Jb', 42],
  ['psalms', 'Psalms', 'Ps', 150],
  ['proverbs', 'Proverbs', 'Prv', 31],
  ['ecclesiastes', 'Ecclesiastes', 'Eccl', 12],
  ['song+of+solomon', 'Song of Songs', 'Sg', 8],
  ['wisdom', 'Wisdom', 'Wis', 19],        // Deuterocanonical
  ['sirach', 'Sirach', 'Sir', 51],         // Deuterocanonical (Ecclesiasticus)
  ['isaiah', 'Isaiah', 'Is', 66],
  ['jeremiah', 'Jeremiah', 'Jer', 52],
  ['lamentations', 'Lamentations', 'Lam', 5],
  ['baruch', 'Baruch', 'Bar', 6],          // Deuterocanonical
  ['ezekiel', 'Ezekiel', 'Ez', 48],
  ['daniel', 'Daniel', 'Dn', 14],
  ['hosea', 'Hosea', 'Hos', 14],
  ['joel', 'Joel', 'Jl', 3],
  ['amos', 'Amos', 'Am', 9],
  ['obadiah', 'Obadiah', 'Ob', 1],
  ['jonah', 'Jonah', 'Jon', 4],
  ['micah', 'Micah', 'Mi', 7],
  ['nahum', 'Nahum', 'Na', 3],
  ['habakkuk', 'Habakkuk', 'Hab', 3],
  ['zephaniah', 'Zephaniah', 'Zep', 3],
  ['haggai', 'Haggai', 'Hg', 2],
  ['zechariah', 'Zechariah', 'Zec', 14],
  ['malachi', 'Malachi', 'Mal', 4],
  // New Testament (27 books)
  ['matthew', 'Matthew', 'Mt', 28],
  ['mark', 'Mark', 'Mk', 16],
  ['luke', 'Luke', 'Lk', 24],
  ['john', 'John', 'Jn', 21],
  ['acts', 'Acts', 'Acts', 28],
  ['romans', 'Romans', 'Rom', 16],
  ['1+corinthians', '1 Corinthians', '1 Cor', 16],
  ['2+corinthians', '2 Corinthians', '2 Cor', 13],
  ['galatians', 'Galatians', 'Gal', 6],
  ['ephesians', 'Ephesians', 'Eph', 6],
  ['philippians', 'Philippians', 'Phil', 4],
  ['colossians', 'Colossians', 'Col', 4],
  ['1+thessalonians', '1 Thessalonians', '1 Thes', 5],
  ['2+thessalonians', '2 Thessalonians', '2 Thes', 3],
  ['1+timothy', '1 Timothy', '1 Tm', 6],
  ['2+timothy', '2 Timothy', '2 Tm', 4],
  ['titus', 'Titus', 'Ti', 3],
  ['philemon', 'Philemon', 'Phlm', 1],
  ['hebrews', 'Hebrews', 'Heb', 13],
  ['james', 'James', 'Jas', 5],
  ['1+peter', '1 Peter', '1 Pt', 5],
  ['2+peter', '2 Peter', '2 Pt', 3],
  ['1+john', '1 John', '1 Jn', 5],
  ['2+john', '2 John', '2 Jn', 1],
  ['3+john', '3 John', '3 Jn', 1],
  ['jude', 'Jude', 'Jude', 1],
  ['revelation', 'Revelation', 'Rv', 22],
];

const TOTAL_CHAPTERS = BOOKS.reduce((sum, b) => sum + b[3], 0);
const ESTIMATED_VERSES = 31102; // approximate total for all 73 books

// ─── Progress / Resume ───────────────────────────────────────────────────────

function loadProgress() {
  if (existsSync(PROGRESS_FILE)) {
    try {
      return JSON.parse(readFileSync(PROGRESS_FILE, 'utf8'));
    } catch { /* ignore */ }
  }
  return { completedBooks: [], totalVectors: 0 };
}

function saveProgress(progress) {
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// ─── Bible API fetch ─────────────────────────────────────────────────────────

async function fetchChapter(bookApiName, bookDisplay, abbr, chapterNum, retries = 3) {
  const url = `${BIBLE_API_BASE}/${bookApiName}+${chapterNum}?translation=${TRANSLATION}`;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 404) return []; // chapter doesn't exist in this translation
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      if (!data.verses || data.verses.length === 0) return [];
      return data.verses.map(v => ({
        id: `dr-${abbr.replace(/\s+/g, '').toLowerCase()}-${v.chapter}-${v.verse}`,
        text: `${bookDisplay} ${v.chapter}:${v.verse} — ${v.text.trim()}`,
        metadata: {
          type: 'verse',
          reference: `${bookDisplay} ${v.chapter}:${v.verse}`,
          text: v.text.trim(),
          source: 'Douay-Rheims Bible (1899)',
          book: bookDisplay,
          chapter: v.chapter,
          verse: v.verse,
        }
      }));
    } catch (err) {
      if (attempt === retries) {
        console.warn(`    ⚠ Skipping ${bookDisplay} ${chapterNum} after ${retries} attempts: ${err.message}`);
        return [];
      }
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  return [];
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
    body: JSON.stringify({ vectors, namespace: NAMESPACE }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Pinecone upsert failed: ${res.status} ${err}`);
  }
  return res.json();
}

// ─── Process one book ────────────────────────────────────────────────────────

async function processBook(apiName, displayName, abbr, chapterCount, bookIndex) {
  console.log(`\n[${bookIndex}/${BOOKS.length}] ${displayName} (${chapterCount} chapters)`);

  // Fetch all chapters in parallel groups
  const allVerses = [];
  for (let c = 1; c <= chapterCount; c += PARALLEL_FETCH) {
    const chapterNums = [];
    for (let j = c; j < Math.min(c + PARALLEL_FETCH, chapterCount + 1); j++) {
      chapterNums.push(j);
    }
    const results = await Promise.all(
      chapterNums.map(cn => fetchChapter(apiName, displayName, abbr, cn))
    );
    results.forEach(verses => allVerses.push(...verses));
    process.stdout.write(`  Fetched chapters ${c}–${Math.min(c + PARALLEL_FETCH - 1, chapterCount)} of ${chapterCount}     \r`);
    if (c + PARALLEL_FETCH <= chapterCount) {
      await new Promise(r => setTimeout(r, DELAY_FETCH_MS));
    }
  }

  console.log(`  Fetched ${allVerses.length} verses from ${displayName}`);
  if (allVerses.length === 0) return 0;

  // Embed in batches
  const vectors = [];
  for (let i = 0; i < allVerses.length; i += EMBED_BATCH) {
    const batch = allVerses.slice(i, i + EMBED_BATCH);
    const texts = batch.map(v => v.text);
    process.stdout.write(`  Embedding ${i + 1}–${Math.min(i + EMBED_BATCH, allVerses.length)}/${allVerses.length}...  \r`);
    const embeddings = await embedBatch(texts);
    for (let j = 0; j < batch.length; j++) {
      vectors.push({ id: batch[j].id, values: embeddings[j], metadata: batch[j].metadata });
    }
    if (i + EMBED_BATCH < allVerses.length) {
      await new Promise(r => setTimeout(r, DELAY_EMBED_MS));
    }
  }

  // Upsert to Pinecone
  let upserted = 0;
  for (let i = 0; i < vectors.length; i += UPSERT_BATCH) {
    const batch = vectors.slice(i, i + UPSERT_BATCH);
    await upsertBatch(batch);
    upserted += batch.length;
    process.stdout.write(`  Upserted ${upserted}/${vectors.length} to Pinecone...  \r`);
  }

  console.log(`  ✓ ${displayName}: ${vectors.length} vectors upserted`);
  return vectors.length;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  PADRE PIO — FULL DOUAY-RHEIMS BIBLE EMBEDDER');
  console.log('  73 books · ~31,100 verses · Pinecone namespace: padre-pio');
  console.log(`  Total chapters to fetch: ${TOTAL_CHAPTERS}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  if (!GEMINI_API_KEY) throw new Error('VITE_GEMINI_API_KEY not set');
  if (!PINECONE_API_KEY) throw new Error('VITE_PINECONE_API_KEY or PINECONE_API_KEY not set');
  if (!RAW_HOST) throw new Error('VITE_PINECONE_HOST or PINECONE_HOST not set');

  const progress = loadProgress();
  const skipped = new Set(progress.completedBooks);
  let totalVectors = progress.totalVectors;

  if (skipped.size > 0) {
    console.log(`Resuming from checkpoint — ${skipped.size} books already done (${totalVectors} vectors so far)`);
  }

  const startTime = Date.now();

  for (let i = 0; i < BOOKS.length; i++) {
    const [apiName, displayName, abbr, chapterCount] = BOOKS[i];
    if (skipped.has(displayName)) {
      console.log(`[${i + 1}/${BOOKS.length}] ${displayName} — already done, skipping`);
      continue;
    }

    const count = await processBook(apiName, displayName, abbr, chapterCount, i + 1);
    totalVectors += count;

    // Save progress after each book
    progress.completedBooks.push(displayName);
    progress.totalVectors = totalVectors;
    saveProgress(progress);

    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    const remaining = BOOKS.length - i - 1 - skipped.size;
    console.log(`  Progress: ${totalVectors} vectors total | ${elapsed}min elapsed | ~${remaining} books left`);
  }

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  COMPLETE — ${totalVectors} DR Bible verses indexed`);
  console.log(`  Namespace: ${NAMESPACE}`);
  console.log(`  Time: ${elapsed} minutes`);
  console.log('\n  Tip: Your Pinecone index now contains the full Catholic');
  console.log('  Douay-Rheims Bible including all 7 deuterocanonical books.');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Clean up progress file on success
  try {
    const { unlinkSync } = await import('fs');
    unlinkSync(PROGRESS_FILE);
  } catch { /* ignore */ }
}

main().catch(err => {
  console.error('\nFATAL:', err.message);
  console.error('Progress has been saved. Re-run the script to resume from where it left off.');
  process.exit(1);
});
