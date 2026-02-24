/**
 * Pinecone RAG Service
 * 
 * Semantic Bible verse retrieval using vector embeddings.
 * Queries Pinecone for verses semantically similar to user input.
 */

export interface RetrievedVerse {
  reference: string;
  text: string;
  book: string;
  chapter: number;
  verse: number;
  score: number; // Similarity score (0-1)
}

export interface RAGSearchResult {
  query: string;
  results: RetrievedVerse[];
  totalFound: number;
}

export interface RAGSearchOptions {
  topK?: number; // Number of results (default: 5, max: 10)
  filter?: {
    book?: string; // Filter by book name
    chapter?: number; // Filter by chapter
  };
}

const API_TIMEOUT_MS = 15000; // 15 second timeout for RAG queries

/**
 * Search for Bible verses semantically similar to the query
 */
export async function searchVerses(
  query: string, 
  options: RAGSearchOptions = {}
): Promise<RAGSearchResult> {
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    throw new Error('Query must be a non-empty string');
  }

  const { topK = 5, filter } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch('/api/pinecone-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: query.trim(),
        topK,
        filter
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `RAG search failed with status ${response.status}`);
    }

    return await response.json() as RAGSearchResult;
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('RAG search timed out');
    }
    
    throw error;
  }
}

/**
 * Search for verses relevant to a specific emotional/spiritual context
 * Builds an optimized query from archetype and emotional context
 */
export async function searchVersesForContext(
  archetype: string,
  archetypeDescription: string,
  emotionalContext?: {
    statedFeeling?: string;
    trueNeed?: string;
  },
  topK: number = 5
): Promise<RAGSearchResult> {
  // Build a rich semantic query from the context
  const queryParts: string[] = [];

  // Add the emotional state
  if (emotionalContext?.statedFeeling) {
    queryParts.push(`feeling ${emotionalContext.statedFeeling}`);
  }

  // Add the true need
  if (emotionalContext?.trueNeed) {
    queryParts.push(emotionalContext.trueNeed);
  }

  // Add archetype description as context
  queryParts.push(archetypeDescription);

  // DETAILED RAG LOGGING
  console.log('[RAG] ═══════════════════════════════════════');
  console.log('[RAG] SEMANTIC SEARCH:');
  console.log(`[RAG]   Archetype: ${archetype}`);
  console.log(`[RAG]   Query Parts:`);
  queryParts.forEach((part, i) => console.log(`[RAG]     ${i + 1}. "${part}"`));

  // Combine into a natural query
  const query = queryParts.join('. ');
  console.log(`[RAG]   Full Query: "${query.substring(0, 100)}..."`);
  console.log(`[RAG]   Searching ${topK} from 31,100 verses...`);

  const result = await searchVerses(query, { topK });

  // Log results
  console.log(`[RAG] ───────────────────────────────────────`);
  console.log(`[RAG] TOP ${result.results.length} MATCHES:`);
  result.results.forEach((v, i) => {
    console.log(`[RAG]   ${i + 1}. ${v.reference} (score: ${v.score.toFixed(3)})`);
    console.log(`[RAG]      "${v.text.substring(0, 60)}..."`);
  });
  console.log('[RAG] ═══════════════════════════════════════');

  return result;
}

/**
 * Get the best matching verse from RAG results
 * Returns the highest-scored verse above a minimum threshold
 */
export function getBestMatch(
  results: RetrievedVerse[], 
  minScore: number = 0.7
): RetrievedVerse | null {
  if (!results || results.length === 0) {
    return null;
  }

  // Results are already sorted by score (highest first)
  const best = results[0];
  
  if (best.score >= minScore) {
    return best;
  }

  return null;
}

/**
 * Check if RAG is available (Pinecone is configured)
 */
export async function isRAGAvailable(): Promise<boolean> {
  try {
    // Make a minimal test query
    const result = await searchVerses('peace', { topK: 1 });
    return result.totalFound > 0;
  } catch {
    return false;
  }
}
