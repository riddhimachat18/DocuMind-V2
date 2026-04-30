/**
 * BM25 Scorer Implementation
 * 
 * Implements the BM25 algorithm for keyword-based relevance scoring with:
 * - Text preprocessing (tokenization, lowercasing, punctuation removal)
 * - Unicode handling for international content
 * - Standard BM25 parameters (k1=1.2, b=0.75)
 * - Score normalization to 0-1 range for RRF compatibility
 */

export interface BM25Parameters {
  k1: number; // Term frequency saturation parameter
  b: number;  // Length normalization parameter
}

export interface DocumentStats {
  termFrequencies: Map<string, number>;
  totalTerms: number;
}

export class BM25Scorer {
  private readonly k1: number;
  private readonly b: number;
  private documentStats: Map<string, DocumentStats> = new Map();
  private averageDocumentLength: number = 0;
  private documentFrequencies: Map<string, number> = new Map();
  private totalDocuments: number = 0;

  constructor(parameters: BM25Parameters = { k1: 1.2, b: 0.75 }) {
    this.k1 = parameters.k1;
    this.b = parameters.b;
  }

  /**
   * Preprocesses text by:
   * - Converting to lowercase
   * - Removing punctuation and special characters
   * - Splitting on whitespace and common delimiters
   * - Handling Unicode characters appropriately
   */
  preprocessText(text: string): string[] {
    if (!text || typeof text !== 'string') {
      return [];
    }

    // Normalize Unicode characters (NFD normalization)
    const normalized = text.normalize('NFD');
    
    // Convert to lowercase
    const lowercased = normalized.toLowerCase();
    
    // Remove punctuation and special characters, keep only letters, numbers, and spaces
    // This regex handles Unicode letters and numbers properly
    const cleaned = lowercased.replace(/[^\p{L}\p{N}\s]/gu, ' ');
    
    // Split on whitespace and filter out empty strings
    const tokens = cleaned.split(/\s+/).filter(token => token.length > 0);
    
    return tokens;
  }

  /**
   * Builds document statistics for BM25 calculation
   * Must be called before calculateScore to prepare the corpus
   */
  buildCorpusStatistics(documents: Array<{ id: string; text: string }>): void {
    this.documentStats.clear();
    this.documentFrequencies.clear();
    this.totalDocuments = documents.length;

    if (this.totalDocuments === 0) {
      this.averageDocumentLength = 0;
      return;
    }

    let totalTermsAcrossAllDocs = 0;
    const termDocumentCounts = new Map<string, number>();

    // First pass: calculate term frequencies for each document
    for (const doc of documents) {
      const tokens = this.preprocessText(doc.text);
      const termFreqs = new Map<string, number>();

      for (const token of tokens) {
        termFreqs.set(token, (termFreqs.get(token) || 0) + 1);
        
        // Track which documents contain this term
        if (!termDocumentCounts.has(token)) {
          termDocumentCounts.set(token, 0);
        }
      }

      // Count unique terms per document for document frequency
      for (const term of termFreqs.keys()) {
        termDocumentCounts.set(term, termDocumentCounts.get(term)! + 1);
      }

      this.documentStats.set(doc.id, {
        termFrequencies: termFreqs,
        totalTerms: tokens.length
      });

      totalTermsAcrossAllDocs += tokens.length;
    }

    // Calculate average document length
    this.averageDocumentLength = totalTermsAcrossAllDocs / this.totalDocuments;

    // Store document frequencies (how many documents contain each term)
    this.documentFrequencies = termDocumentCounts;
  }

  /**
   * Calculates BM25 score for a query against a specific document
   * Returns raw BM25 score (not normalized)
   */
  calculateScore(query: string, documentId: string): number {
    const queryTerms = this.preprocessText(query);
    const docStats = this.documentStats.get(documentId);

    if (!docStats || queryTerms.length === 0) {
      return 0;
    }

    let score = 0;

    for (const term of queryTerms) {
      const termFreq = docStats.termFrequencies.get(term) || 0;
      const docFreq = this.documentFrequencies.get(term) || 0;

      if (termFreq === 0 || docFreq === 0) {
        continue;
      }

      // Calculate IDF: log((N - df + 0.5) / (df + 0.5))
      const idf = Math.log((this.totalDocuments - docFreq + 0.5) / (docFreq + 0.5));

      // Calculate TF component: (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (|d| / avgdl)))
      const docLength = docStats.totalTerms;
      const lengthNorm = 1 - this.b + this.b * (docLength / this.averageDocumentLength);
      const tfComponent = (termFreq * (this.k1 + 1)) / (termFreq + this.k1 * lengthNorm);

      const termScore = idf * tfComponent;
      score += termScore;
    }

    return score; // Allow negative scores - they're mathematically valid in BM25
  }

  /**
   * Normalizes a BM25 score to 0-1 range using min-max normalization
   * Handles both positive and negative BM25 scores for RRF compatibility
   * 
   * Edge cases handled:
   * - All scores identical: returns 1 for positive scores, 0 for zero/negative
   * - NaN or infinite scores: returns 0
   * - Empty score ranges: returns 0
   */
  normalizeScore(score: number, minScore: number, maxScore: number): number {
    // Handle NaN or infinite values
    if (!isFinite(score) || !isFinite(minScore) || !isFinite(maxScore)) {
      return 0;
    }

    // Handle identical min/max (all scores are the same)
    if (maxScore === minScore) {
      // If all scores are positive, give them full relevance
      // If all scores are zero or negative, give them no relevance
      return score > 0 ? 1 : 0;
    }

    // Standard min-max normalization
    const normalized = (score - minScore) / (maxScore - minScore);
    
    // Clamp to [0, 1] range to ensure RRF compatibility
    return Math.max(0, Math.min(1, normalized));
  }

  /**
   * Calculates BM25 scores for all documents against a query and returns normalized scores
   * This is the main method to use for retrieval scoring
   */
  scoreDocuments(
    query: string, 
    documents: Array<{ id: string; text: string }>
  ): Array<{ id: string; score: number; normalizedScore: number; metrics?: { calculationTimeMs: number } }> {
    const startTime = performance.now();

    // Handle empty document set
    if (documents.length === 0) {
      return [];
    }

    // Handle empty or invalid query
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return documents.map(doc => ({
        id: doc.id,
        score: 0,
        normalizedScore: 0
      }));
    }

    // Build corpus statistics
    this.buildCorpusStatistics(documents);

    // Calculate raw scores
    const results = documents.map(doc => ({
      id: doc.id,
      score: this.calculateScore(query, doc.id),
      normalizedScore: 0
    }));

    // Find min and max scores for normalization
    const scores = results.map(r => r.score);
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);

    // Normalize scores
    for (const result of results) {
      result.normalizedScore = this.normalizeScore(result.score, minScore, maxScore);
    }

    const calculationTimeMs = performance.now() - startTime;
    
    // Log performance metrics
    console.log(`[BM25 Performance] Scored ${documents.length} documents in ${calculationTimeMs.toFixed(2)}ms`);

    return results;
  }

  /**
   * Convenience method for RRF compatibility
   * Returns only normalized scores in 0-1 range for fusion algorithms
   */
  scoreForRRF(
    query: string,
    documents: Array<{ id: string; text: string }>
  ): Array<{ id: string; normalizedScore: number }> {
    const results = this.scoreDocuments(query, documents);
    return results.map(r => ({
      id: r.id,
      normalizedScore: r.normalizedScore
    }));
  }
}