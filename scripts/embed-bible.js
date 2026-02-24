const PINECONE_API_KEY = process.env.PINECONE_API_KEY || process.env.VITE_PINECONE_API_KEY;
const PINECONE_HOST = process.env.PINECONE_HOST || process.env.VITE_PINECONE_HOST;
const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;

// Using a different, reliable KJV source
const KJV_URL = 'https://cdn.jsdelivr.net/gh/thiagobodruk/bible@master/json/en_kjv.json';

async function main() {
  console.log('Fetching KJV Bible...');
  const res = await fetch(KJV_URL);
  const bible = await res.json();
  
  const verses = [];
  for (const book of bible) {
    const bookName = book.name;
    for (let chapterIdx = 0; chapterIdx < book.chapters.length; chapterIdx++) {
      const chapter = book.chapters[chapterIdx];
      for (let verseIdx = 0; verseIdx < chapter.length; verseIdx++) {
        verses.push({
          reference: `${bookName} ${chapterIdx + 1}:${verseIdx + 1}`,
          text: chapter[verseIdx],
          book: bookName,
          chapter: chapterIdx + 1,
          verse: verseIdx + 1
        });
      }
    }
  }
  
  console.log(`Found ${verses.length} verses. Starting embedding...`);
  
  const BATCH_SIZE = 50;
  for (let i = 0; i < verses.length; i += BATCH_SIZE) {
    const batch = verses.slice(i, i + BATCH_SIZE);
    
    const embeddingRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: batch.map(v => ({
            model: 'models/text-embedding-004',
            content: { parts: [{ text: `${v.reference}: ${v.text}` }] }
          }))
        })
      }
    );
    
    const embeddingData = await embeddingRes.json();
    
    if (!embeddingData.embeddings) {
      console.error('Embedding error:', embeddingData);
      continue;
    }
    
    const vectors = batch.map((v, idx) => ({
      id: v.reference.replace(/[^a-zA-Z0-9]/g, '_'),
      values: embeddingData.embeddings[idx].values,
      metadata: { reference: v.reference, text: v.text, book: v.book, chapter: v.chapter, verse: v.verse }
    }));
    
    await fetch(`https://${PINECONE_HOST}/vectors/upsert`, {
      method: 'POST',
      headers: {
        'Api-Key': PINECONE_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ vectors, namespace: 'kjv' })
    });
    
    console.log(`Processed ${Math.min(i + BATCH_SIZE, verses.length)}/${verses.length}`);
    
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log('Done!');
}

main().catch(console.error);