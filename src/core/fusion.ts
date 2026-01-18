/**
 * src/core/fusion.ts
 * Reciprocal Rank Fusion (RRF) algorithm for combining search results
 */

// =============================================================================
// Types
// =============================================================================

export interface RankedResult {
  id: string;
  content: string;
  path: string;
  package: string;
  title: string;
  score: number;
}

export interface FusionResult {
  id: string;
  content: string;
  path: string;
  package: string;
  title: string;
  score: number;
  sources: {
    fulltext?: number;
    vector?: number;
  };
}

/** Configuration options for RRF */
export interface RRFOptions {
  /** Smoothing constant (default: 60, empirically optimal) */
  k?: number;
  /** Weight for fulltext/BM25 results (default: 0.4) */
  fulltextWeight?: number;
  /** Weight for vector/semantic results (default: 0.6) */
  vectorWeight?: number;
}

// =============================================================================
// Reciprocal Rank Fusion
// =============================================================================

/**
 * Combine BM25 (full-text) and vector search results using weighted RRF
 *
 * Formula: RRF(d) = Σ weight * (1/(k + rank(d)))
 *
 * Where k is a constant (typically 60) that controls how much higher-ranked
 * documents are weighted relative to lower-ranked ones.
 *
 * RRF is rank-based (not score-based) which makes it robust to different
 * scoring scales between BM25 and vector similarity.
 *
 * @param fulltextResults - Results from BM25 full-text search
 * @param vectorResults - Results from vector similarity search
 * @param options - RRF configuration options
 * @returns Combined and re-ranked results
 */
export function reciprocalRankFusion(
  fulltextResults: RankedResult[],
  vectorResults: RankedResult[],
  options: RRFOptions = {}
): FusionResult[] {
  const { k = 60, fulltextWeight = 0.4, vectorWeight = 0.6 } = options;

  const scores = new Map<string, {
    score: number;
    doc: RankedResult;
    sources: { fulltext?: number; vector?: number };
  }>();

  // Process fulltext results WITH weight
  fulltextResults.forEach((doc, rank) => {
    const rrfScore = fulltextWeight * (1 / (k + rank + 1));
    const existing = scores.get(doc.id);

    if (existing) {
      existing.score += rrfScore;
      existing.sources.fulltext = rank + 1;
    } else {
      scores.set(doc.id, {
        score: rrfScore,
        doc,
        sources: { fulltext: rank + 1 },
      });
    }
  });

  // Process vector results WITH weight
  vectorResults.forEach((doc, rank) => {
    const rrfScore = vectorWeight * (1 / (k + rank + 1));
    const existing = scores.get(doc.id);

    if (existing) {
      existing.score += rrfScore;
      existing.sources.vector = rank + 1;
    } else {
      scores.set(doc.id, {
        score: rrfScore,
        doc,
        sources: { vector: rank + 1 },
      });
    }
  });

  // Sort by combined score (descending)
  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .map(({ doc, score, sources }) => ({
      id: doc.id,
      content: doc.content,
      path: doc.path,
      package: doc.package,
      title: doc.title,
      score,
      sources,
    }));
}

/**
 * Normalize scores to 0-1 range
 */
export function normalizeScores(results: FusionResult[]): FusionResult[] {
  if (results.length === 0) return results;

  const maxScore = Math.max(...results.map((r) => r.score));
  if (maxScore === 0) return results;

  return results.map((r) => ({
    ...r,
    score: r.score / maxScore,
  }));
}
