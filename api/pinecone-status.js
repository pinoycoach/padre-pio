const PINECONE_API_KEY = process.env.PINECONE_API_KEY || process.env.VITE_PINECONE_API_KEY;
const RAW_HOST = process.env.PINECONE_HOST || process.env.VITE_PINECONE_HOST;
// Normalize host - remove https:// if present, we'll add it ourselves
const PINECONE_HOST = RAW_HOST?.replace(/^https?:\/\//, '');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!PINECONE_API_KEY || !PINECONE_HOST) {
    return res.status(500).json({ 
      error: 'Missing Pinecone configuration',
      configured: false
    });
  }

  try {
    // Get index stats from Pinecone
    const statsRes = await fetch(`https://${PINECONE_HOST}/describe_index_stats`, {
      method: 'POST',
      headers: {
        'Api-Key': PINECONE_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });

    if (!statsRes.ok) {
      const errorText = await statsRes.text();
      return res.status(500).json({ 
        error: 'Failed to get Pinecone stats',
        details: errorText 
      });
    }

    const stats = await statsRes.json();
    
    // Check if kjv namespace exists and has vectors
    const kjvNamespace = stats.namespaces?.kjv;
    const totalVectors = kjvNamespace?.vectorCount || 0;
    const expectedVectors = 31100; // Actual number of verses in KJV Bible index
    
    return res.status(200).json({
      configured: true,
      indexStats: stats,
      kjvNamespace: {
        exists: !!kjvNamespace,
        vectorCount: totalVectors,
        expectedCount: expectedVectors,
        percentComplete: Math.round((totalVectors / expectedVectors) * 100),
        isReady: totalVectors >= expectedVectors * 0.95 // 95% threshold
      }
    });
    
  } catch (error) {
    return res.status(500).json({ 
      error: 'Failed to check Pinecone status',
      details: error.message 
    });
  }
}
