/**
 * Reciprocal Rank Fusion (RRF) Merger Implementation
 * 
 * Combines semantic similarity rankings with BM25 keyword rankings using the RRF formula:
 * RRF_score = 1/(k + rank) where k=60 (standard parameter)
 * 
 * Features:
 * - Stable sorting for tied scores
 * - Preserves snippet metadata through fusion process
 * - Handles missing rankings gracefully
 * - Supports different ranking sources (semantic, keyword, fused)
 */

export interface RankedSnippet {
  snippet: RetrievalSnippet;
  rank: number;
  score: number;
  source: 'semantic' | 'keyword' | 'fused';
}

export interface RetrievalSnippet {
  text: string;
  id: string;
  metadata: any;
  scores?: {
    semantic?: number;
    bm25?: number;
    crossEncoder?: number;
    rrf?: number;
  };
  rankings?: {
    semantic?: number;
    bm25?: number;
    final?: number;
  };
}

export interface RRFParameters {
  k: number; // RRF parameter, typically 60
}

export class RRFMerger {
  private readonly k: number;

  constructor(parameters: RRFParameters = { k: 60 }) {
    this.k = parameters.k;
  }



  /**
   * Converts score-based rankings to rank-based rankings
   * Higher scores get better (lower) ranks
   */
  private scoreToRank(
    snippets: Array<{ snippet: RetrievalSnippet; score: number }>,
    source: 'semantic' | 'keyword'
  ): RankedSnippet[] {
    // Sort by score descending (higher scores = better ranks)
    const sorted = [...snippets].sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      // Stable sorting: maintain original order for tied scores
      return snippets.indexOf(a) - snippets.indexOf(b);
    });

    return sorted.map((item, index) => ({
      snippet: {
        ...item.snippet,
        rankings: {
          ...item.snippet.rankings,
          [source]: index + 1 // Ranks start at 1
        }
      },
      rank: index + 1,
      score: item.score,
      source
    }));
  }

  /**
   * Merges two sets of ranked snippets using RRF fusion
   * Handles cases where snippets appear in only one ranking
   */
  fuseRankings(
    semanticRanking: Array<{ snippet: RetrievalSnippet; score: number }>,
    keywordRanking: Array<{ snippet: RetrievalSnippet; score: number }>,
    k?: number
  ): RankedSnippet[] {
    const startTime = performance.now();
    
    // Use provided k or default
    const rrfK = k ?? this.k;

    // Convert scores to ranks
    const semanticRanks = this.scoreToRank(semanticRanking, 'semantic');
    const keywordRanks = this.scoreToRank(keywordRanking, 'keyword');

    // Create maps for efficient lookup
    const semanticMap = new Map<string, RankedSnippet>();
    const keywordMap = new Map<string, RankedSnippet>();

    for (const item of semanticRanks) {
      semanticMap.set(item.snippet.id, item);
    }

    for (const item of keywordRanks) {
      keywordMap.set(item.snippet.id, item);
    }

    // Collect all unique snippet IDs
    const allSnippetIds = new Set([
      ...semanticMap.keys(),
      ...keywordMap.keys()
    ]);

    // Calculate RRF scores for each snippet
    const fusedResults: Array<{
      snippet: RetrievalSnippet;
      rrfScore: number;
      semanticRank?: number;
      keywordRank?: number;
      originalIndex: number;
    }> = [];

    let originalIndex = 0;
    for (const snippetId of allSnippetIds) {
      const semanticItem = semanticMap.get(snippetId);
      const keywordItem = keywordMap.get(snippetId);

      // Get the snippet (prefer semantic if available, otherwise keyword)
      const baseSnippet = semanticItem?.snippet || keywordItem?.snippet;
      if (!baseSnippet) continue;

      // Calculate RRF score
      let rrfScore = 0;
      let semanticRank: number | undefined;
      let keywordRank: number | undefined;

      if (semanticItem) {
        semanticRank = semanticItem.rank;
        rrfScore += 1 / (rrfK + semanticItem.rank);
      }

      if (keywordItem) {
        keywordRank = keywordItem.rank;
        rrfScore += 1 / (rrfK + keywordItem.rank);
      }

      // Preserve and enhance snippet metadata
      const enhancedSnippet: RetrievalSnippet = {
        ...baseSnippet,
        scores: {
          ...baseSnippet.scores,
          semantic: semanticItem?.score,
          bm25: keywordItem?.score,
          rrf: rrfScore
        },
        rankings: {
          ...baseSnippet.rankings,
          semantic: semanticRank,
          bm25: keywordRank
        }
      };

      fusedResults.push({
        snippet: enhancedSnippet,
        rrfScore,
        semanticRank,
        keywordRank,
        originalIndex: originalIndex++
      });
    }

    // Sort by RRF score descending, with stable sorting for ties
    fusedResults.sort((a, b) => {
      if (b.rrfScore !== a.rrfScore) {
        return b.rrfScore - a.rrfScore;
      }
      // Stable sorting: maintain original order for tied scores
      return a.originalIndex - b.originalIndex;
    });

    const fusionTimeMs = performance.now() - startTime;
    
    // Log performance metrics
    console.log(`[RRF Performance] Fused ${allSnippetIds.size} unique snippets in ${fusionTimeMs.toFixed(2)}ms`);

    // Convert to final ranked format
    return fusedResults.map((item, index) => ({
      snippet: {
        ...item.snippet,
        rankings: {
          ...item.snippet.rankings,
          final: index + 1
        }
      },
      rank: index + 1,
      score: item.rrfScore,
      source: 'fused' as const
    }));
  }

  /**
   * Convenience method for simple RRF fusion with just snippet arrays
   * Assumes equal scores for all snippets in each ranking
   */
  fuseSnippetArrays(
    semanticSnippets: RetrievalSnippet[],
    keywordSnippets: RetrievalSnippet[],
    k?: number
  ): RankedSnippet[] {
    // Convert arrays to score-based rankings (position-based scoring)
    const semanticRanking = semanticSnippets.map((snippet, index) => ({
      snippet,
      score: semanticSnippets.length - index // Higher position = higher score
    }));

    const keywordRanking = keywordSnippets.map((snippet, index) => ({
      snippet,
      score: keywordSnippets.length - index // Higher position = higher score
    }));

    return this.fuseRankings(semanticRanking, keywordRanking, k);
  }

  /**
   * Extracts just the snippets from fused rankings in rank order
   * Useful for maintaining compatibility with existing interfaces
   */
  extractSnippets(fusedRankings: RankedSnippet[]): RetrievalSnippet[] {
    return fusedRankings
      .sort((a, b) => a.rank - b.rank)
      .map(item => item.snippet);
  }

  /**
   * Combines semantic and keyword rankings directly using rank positions
   * This is the core ranking combination logic that handles rank-based inputs
   * and produces unified ranking output as required by Requirement 2.4
   */
  combineRankings(
    semanticRanking: Array<{ snippet: RetrievalSnippet; rank: number }>,
    keywordRanking: Array<{ snippet: RetrievalSnippet; rank: number }>,
    k?: number
  ): RankedSnippet[] {
    // Use provided k or default
    const rrfK = k ?? this.k;

    // Create maps for efficient lookup by snippet ID
    const semanticMap = new Map<string, { snippet: RetrievalSnippet; rank: number }>();
    const keywordMap = new Map<string, { snippet: RetrievalSnippet; rank: number }>();

    for (const item of semanticRanking) {
      semanticMap.set(item.snippet.id, item);
    }

    for (const item of keywordRanking) {
      keywordMap.set(item.snippet.id, item);
    }

    // Collect all unique snippet IDs
    const allSnippetIds = new Set([
      ...semanticMap.keys(),
      ...keywordMap.keys()
    ]);

    // Calculate RRF scores for each snippet using rank positions
    const fusedResults: Array<{
      snippet: RetrievalSnippet;
      rrfScore: number;
      semanticRank?: number;
      keywordRank?: number;
      originalIndex: number;
    }> = [];

    let originalIndex = 0;
    for (const snippetId of allSnippetIds) {
      const semanticItem = semanticMap.get(snippetId);
      const keywordItem = keywordMap.get(snippetId);

      // Get the snippet (prefer semantic if available, otherwise keyword)
      const baseSnippet = semanticItem?.snippet || keywordItem?.snippet;
      if (!baseSnippet) continue;

      // Calculate RRF score using rank positions
      let rrfScore = 0;
      let semanticRank: number | undefined;
      let keywordRank: number | undefined;

      if (semanticItem) {
        semanticRank = semanticItem.rank;
        rrfScore += 1 / (rrfK + semanticItem.rank);
      }

      if (keywordItem) {
        keywordRank = keywordItem.rank;
        rrfScore += 1 / (rrfK + keywordItem.rank);
      }

      // Preserve and enhance snippet metadata
      const enhancedSnippet: RetrievalSnippet = {
        ...baseSnippet,
        scores: {
          ...baseSnippet.scores,
          rrf: rrfScore
        },
        rankings: {
          ...baseSnippet.rankings,
          semantic: semanticRank,
          bm25: keywordRank
        }
      };

      fusedResults.push({
        snippet: enhancedSnippet,
        rrfScore,
        semanticRank,
        keywordRank,
        originalIndex: originalIndex++
      });
    }

    // Sort by RRF score descending, with stable sorting for ties
    fusedResults.sort((a, b) => {
      if (b.rrfScore !== a.rrfScore) {
        return b.rrfScore - a.rrfScore;
      }
      // Stable sorting: maintain original order for tied scores
      return a.originalIndex - b.originalIndex;
    });

    // Convert to final ranked format with unified ranking output
    return fusedResults.map((item, index) => ({
      snippet: {
        ...item.snippet,
        rankings: {
          ...item.snippet.rankings,
          final: index + 1
        }
      },
      rank: index + 1,
      score: item.rrfScore,
      source: 'fused' as const
    }));
  }

  /**
   * Gets the RRF parameter k used by this merger
   */
  getK(): number {
    return this.k;
  }
}