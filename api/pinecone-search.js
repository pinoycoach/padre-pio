/**
 * Pinecone RAG Search API Route
 * Performs semantic search against embedded Bible verses
 */

const PINECONE_API_KEY = process.env.PINECONE_API_KEY || process.env.VITE_PINECONE_API_KEY;
const RAW_HOST = process.env.PINECONE_HOST || process.env.VITE_PINECONE_HOST;
const PINECONE_HOST = RAW_HOST?.replace(/^https?:\/\//, ''); // Normalize host
const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query, topK = 5, filter } = req.body;

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Query is required and must be a string' });
  }

  if (!PINECONE_API_KEY || !PINECONE_HOST || !GEMINI_API_KEY) {
    return res.status(500).json({ 
      error: 'Server configuration error: Missing Pinecone or Gemini API keys'
    });
  }

  try {
    // Step 1: Generate embedding for the query using Gemini
    const embeddingResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/gemini-embedding-001',
          content: { parts: [{ text: query }] },
          outputDimensionality: 1024,
        })
      }
    );

    if (!embeddingResponse.ok) {
      const errorData = await embeddingResponse.json();
      console.error('Embedding error:', errorData);
      return res.status(500).json({ error: 'Failed to generate query embedding' });
    }

    const embeddingData = await embeddingResponse.json();
    const queryVector = embeddingData.embedding.values;

    // Step 2: Query Pinecone for similar verses
    const pineconeBody = {
      vector: queryVector,
      topK: Math.min(topK, 10), // Cap at 10 results
      namespace: 'padre-pio',
      includeMetadata: true
    };

    // Add optional filter (e.g., by book)
    if (filter) {
      pineconeBody.filter = filter;
    }

    const pineconeResponse = await fetch(`https://${PINECONE_HOST}/query`, {
      method: 'POST',
      headers: {
        'Api-Key': PINECONE_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(pineconeBody)
    });

    if (!pineconeResponse.ok) {
      const errorData = await pineconeResponse.json();
      console.error('Pinecone error:', errorData);
      return res.status(500).json({ error: 'Failed to search vector database' });
    }

    const pineconeData = await pineconeResponse.json();

    // Step 3: Format and return results
    const results = (pineconeData.matches || []).map(match => ({
      reference: match.metadata?.reference || match.id,
      text: match.metadata?.text || '',
      book: match.metadata?.book || '',
      chapter: match.metadata?.chapter || 0,
      verse: match.metadata?.verse || 0,
      score: match.score || 0
    }));

    return res.status(200).json({
      query,
      results,
      totalFound: results.length
    });

  } catch (error) {
    console.error('RAG search error:', error);
    return res.status(500).json({ 
      error: 'Internal server error during search',
      details: error.message 
    });
  }
}
