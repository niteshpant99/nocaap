import { describe, it, expect } from 'vitest';
import {
  reciprocalRankFusion,
  normalizeScores,
  type RankedResult,
  type FusionResult,
} from '../../src/core/fusion.js';

// Helper to create test results
function makeResult(id: string, score: number): RankedResult {
  return {
    id,
    content: `Content for ${id}`,
    path: `/path/${id}.md`,
    package: 'test-package',
    title: `Title ${id}`,
    score,
  };
}

describe('reciprocalRankFusion', () => {
  it('returns empty array when both inputs are empty', () => {
    const result = reciprocalRankFusion([], []);
    expect(result).toEqual([]);
  });

  it('handles only fulltext results', () => {
    const fulltext = [makeResult('a', 1.0), makeResult('b', 0.8)];
    const result = reciprocalRankFusion(fulltext, []);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('a');
    expect(result[1].id).toBe('b');
    expect(result[0].sources.fulltext).toBe(1);
    expect(result[0].sources.vector).toBeUndefined();
  });

  it('handles only vector results', () => {
    const vector = [makeResult('a', 1.0), makeResult('b', 0.9)];
    const result = reciprocalRankFusion([], vector);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('a');
    expect(result[0].sources.vector).toBe(1);
    expect(result[0].sources.fulltext).toBeUndefined();
  });

  it('combines results appearing in both sources with higher score', () => {
    const fulltext = [makeResult('a', 1.0), makeResult('b', 0.8)];
    const vector = [makeResult('b', 1.0), makeResult('c', 0.9)];
    const result = reciprocalRankFusion(fulltext, vector);

    // 'b' appears in both, should have highest combined score
    expect(result[0].id).toBe('b');
    expect(result[0].sources.fulltext).toBe(2);
    expect(result[0].sources.vector).toBe(1);
  });

  it('applies default weights correctly (0.4 fulltext, 0.6 vector)', () => {
    const fulltext = [makeResult('a', 1.0)];
    const vector = [makeResult('b', 1.0)];
    const result = reciprocalRankFusion(fulltext, vector);

    // At rank 1 (index 0), RRF score = weight * (1 / (k + 1))
    // With k=60: fulltext = 0.4 * (1/61), vector = 0.6 * (1/61)
    // So vector result should score higher
    expect(result[0].id).toBe('b'); // higher weight
    expect(result[1].id).toBe('a');
  });

  it('respects custom weights', () => {
    const fulltext = [makeResult('a', 1.0)];
    const vector = [makeResult('b', 1.0)];
    const result = reciprocalRankFusion(fulltext, vector, {
      fulltextWeight: 0.8,
      vectorWeight: 0.2,
    });

    expect(result[0].id).toBe('a'); // higher weight for fulltext
    expect(result[1].id).toBe('b');
  });

  it('respects custom k value', () => {
    const fulltext = [makeResult('a', 1.0), makeResult('b', 0.5)];
    const result1 = reciprocalRankFusion(fulltext, [], { k: 60 });
    const result2 = reciprocalRankFusion(fulltext, [], { k: 1 });

    // With k=1, rank difference has more impact than k=60
    const scoreDiff60 = result1[0].score - result1[1].score;
    const scoreDiff1 = result2[0].score - result2[1].score;
    expect(scoreDiff1).toBeGreaterThan(scoreDiff60);
  });

  it('preserves document properties in output', () => {
    const fulltext = [makeResult('doc1', 1.0)];
    const result = reciprocalRankFusion(fulltext, []);

    expect(result[0]).toMatchObject({
      id: 'doc1',
      content: 'Content for doc1',
      path: '/path/doc1.md',
      package: 'test-package',
      title: 'Title doc1',
    });
  });

  it('sorts results by descending score', () => {
    const fulltext = [makeResult('c', 0.5), makeResult('a', 1.0), makeResult('b', 0.7)];
    const vector = [makeResult('b', 1.0), makeResult('d', 0.8)];
    const result = reciprocalRankFusion(fulltext, vector);

    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].score).toBeGreaterThanOrEqual(result[i].score);
    }
  });
});

describe('normalizeScores', () => {
  it('returns empty array for empty input', () => {
    const result = normalizeScores([]);
    expect(result).toEqual([]);
  });

  it('normalizes scores to 0-1 range', () => {
    const results: FusionResult[] = [
      { id: 'a', content: '', path: '', package: '', title: '', score: 100, sources: {} },
      { id: 'b', content: '', path: '', package: '', title: '', score: 50, sources: {} },
      { id: 'c', content: '', path: '', package: '', title: '', score: 0, sources: {} },
    ];

    const normalized = normalizeScores(results);
    expect(normalized[0].score).toBe(1);
    expect(normalized[1].score).toBe(0.5);
    expect(normalized[2].score).toBe(0);
  });

  it('handles single result', () => {
    const results: FusionResult[] = [
      { id: 'a', content: '', path: '', package: '', title: '', score: 42, sources: {} },
    ];

    const normalized = normalizeScores(results);
    expect(normalized[0].score).toBe(1);
  });

  it('handles all zero scores', () => {
    const results: FusionResult[] = [
      { id: 'a', content: '', path: '', package: '', title: '', score: 0, sources: {} },
      { id: 'b', content: '', path: '', package: '', title: '', score: 0, sources: {} },
    ];

    const normalized = normalizeScores(results);
    // When max is 0, scores remain unchanged
    expect(normalized[0].score).toBe(0);
    expect(normalized[1].score).toBe(0);
  });

  it('preserves other properties', () => {
    const results: FusionResult[] = [
      {
        id: 'test',
        content: 'Test content',
        path: '/test.md',
        package: 'pkg',
        title: 'Test',
        score: 50,
        sources: { fulltext: 1, vector: 2 },
      },
    ];

    const normalized = normalizeScores(results);
    expect(normalized[0]).toMatchObject({
      id: 'test',
      content: 'Test content',
      path: '/test.md',
      package: 'pkg',
      title: 'Test',
      sources: { fulltext: 1, vector: 2 },
    });
  });
});
