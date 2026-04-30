# Requirements Document

## Introduction

This feature upgrades the existing keyword-based retrieval system in DocuMind's BRD generation pipeline to implement hybrid retrieval. The system currently uses simple keyword scoring to fetch 8 snippets per BRD section from ChromaDB. The upgrade will combine BM25 keyword scoring with existing semantic embeddings using Reciprocal Rank Fusion (RRF) to improve retrieval quality while maintaining the same function signatures.

## Glossary

- **BM25_Scorer**: Component that calculates BM25 relevance scores for text snippets
- **RRF_Merger**: Component that combines semantic and keyword rankings using Reciprocal Rank Fusion
- **Hybrid_Retrieval_System**: The upgraded retrieval system combining semantic and keyword search
- **ChromaDB_Client**: Existing vector database client for semantic embeddings
- **Retrieval_Pipeline**: The complete process from query to ranked snippet results
- **Cross_Encoder_Reranker**: Component that applies cross-encoder scoring to re-rank hybrid retrieval candidates
- **Quality_Scoring_System**: Independent BRD quality assessment system using separate evaluator model
- **Quality_Evaluator**: Independent judge model that evaluates BRD quality across multiple criteria

## Requirements

### Requirement 1: BM25 Keyword Scoring Integration

**User Story:** As a BRD generation system, I want to calculate BM25 scores for text snippets, so that I can improve keyword-based relevance ranking.

#### Acceptance Criteria

1. THE BM25_Scorer SHALL calculate BM25 scores for all retrieved snippets using term frequency and inverse document frequency
2. WHEN a section query is processed, THE BM25_Scorer SHALL tokenize query terms and snippet text using consistent preprocessing
3. THE BM25_Scorer SHALL use standard BM25 parameters (k1=1.2, b=0.75) for score calculation
4. THE BM25_Scorer SHALL handle empty queries and snippets gracefully by returning zero scores
5. THE BM25_Scorer SHALL normalize scores to a 0-1 range for consistent fusion with semantic scores

### Requirement 2: Reciprocal Rank Fusion Implementation

**User Story:** As a retrieval system, I want to merge semantic and keyword rankings using RRF, so that I can leverage both retrieval methods effectively.

#### Acceptance Criteria

1. THE RRF_Merger SHALL combine semantic similarity rankings with BM25 keyword rankings using the formula: RRF_score = 1/(k + rank)
2. THE RRF_Merger SHALL use k=60 as the standard RRF parameter for rank fusion
3. WHEN merging rankings, THE RRF_Merger SHALL handle tied scores by maintaining stable ordering
4. THE RRF_Merger SHALL produce a single unified ranking from the two input rankings
5. THE RRF_Merger SHALL preserve snippet metadata and IDs through the fusion process

### Requirement 3: Enhanced Candidate Retrieval

**User Story:** As a retrieval pipeline, I want to fetch 20 candidates before fusion, so that I can return the top 8 most relevant results after hybrid scoring.

#### Acceptance Criteria

1. THE Hybrid_Retrieval_System SHALL retrieve 20 candidate snippets from ChromaDB for semantic scoring
2. THE Hybrid_Retrieval_System SHALL calculate BM25 scores for the same 20 candidate snippets
3. WHEN both scores are available, THE Hybrid_Retrieval_System SHALL apply RRF fusion to rank all candidates
4. THE Hybrid_Retrieval_System SHALL return the top 8 snippets after fusion ranking
5. THE Hybrid_Retrieval_System SHALL maintain the existing function signature for retrieveForSection

### Requirement 4: Backward Compatibility Preservation

**User Story:** As an existing system component, I want the retrieval interface to remain unchanged, so that dependent components continue to function without modification.

#### Acceptance Criteria

1. THE Hybrid_Retrieval_System SHALL maintain the exact function signature of retrieveForSection
2. THE Hybrid_Retrieval_System SHALL return the same data structure format as the current implementation
3. WHEN called with existing parameters, THE Hybrid_Retrieval_System SHALL process requests without breaking changes
4. THE Hybrid_Retrieval_System SHALL preserve all existing caching mechanisms and TTL behavior
5. THE Hybrid_Retrieval_System SHALL maintain compatibility with selectedFiles filtering functionality

### Requirement 5: Performance Optimization

**User Story:** As a Cloud Function, I want hybrid retrieval to complete within acceptable time limits, so that BRD generation remains responsive.

#### Acceptance Criteria

1. THE Hybrid_Retrieval_System SHALL complete retrieval operations within 2 seconds for typical queries
2. WHEN processing 20 candidates, THE BM25_Scorer SHALL calculate scores in under 100 milliseconds
3. THE RRF_Merger SHALL complete fusion operations in under 50 milliseconds
4. THE Hybrid_Retrieval_System SHALL utilize existing caching to avoid redundant ChromaDB queries
5. THE Hybrid_Retrieval_System SHALL handle concurrent section retrievals without performance degradation

### Requirement 6: Error Handling and Fallback

**User Story:** As a robust system, I want graceful degradation when hybrid components fail, so that BRD generation continues with reduced functionality.

#### Acceptance Criteria

1. IF BM25 scoring fails, THEN THE Hybrid_Retrieval_System SHALL fall back to semantic-only retrieval
2. IF semantic retrieval fails, THEN THE Hybrid_Retrieval_System SHALL fall back to keyword-only retrieval using the existing scoreSnippet function
3. WHEN RRF fusion encounters errors, THE Hybrid_Retrieval_System SHALL return semantic rankings as the primary result
4. THE Hybrid_Retrieval_System SHALL log all fallback events for monitoring and debugging
5. THE Hybrid_Retrieval_System SHALL never return empty results when valid snippets are available in the database

### Requirement 7: BM25 Text Preprocessing

**User Story:** As a text processing component, I want consistent tokenization and normalization, so that BM25 scoring produces accurate relevance measures.

#### Acceptance Criteria

1. THE BM25_Scorer SHALL convert all text to lowercase before processing
2. THE BM25_Scorer SHALL remove punctuation and special characters during tokenization
3. THE BM25_Scorer SHALL split text on whitespace and common delimiters
4. THE BM25_Scorer SHALL handle Unicode characters appropriately for international content
5. THE BM25_Scorer SHALL apply the same preprocessing to both queries and document text

### Requirement 8: Integration with Existing ChromaDB Workflow

**User Story:** As an enhanced retrieval system, I want to leverage existing ChromaDB connections and queries, so that I can add BM25 scoring without duplicating infrastructure.

#### Acceptance Criteria

1. THE Hybrid_Retrieval_System SHALL use the existing fetchAllSnippets function to retrieve candidates
2. THE Hybrid_Retrieval_System SHALL preserve all existing ChromaDB query filters and conditions
3. WHEN ChromaDB returns semantic similarity scores, THE Hybrid_Retrieval_System SHALL normalize them for RRF fusion
4. THE Hybrid_Retrieval_System SHALL maintain the existing project-based and file-based filtering logic
5. THE Hybrid_Retrieval_System SHALL respect the existing cache invalidation mechanisms

### Requirement 9: Cross-Encoder Re-ranking Integration

**User Story:** As a BRD generation system, I want to apply cross-encoder re-ranking after hybrid retrieval, so that I can further improve relevance scoring before passing results to the BRD generator.

#### Acceptance Criteria

1. WHEN hybrid retrieval returns 20 candidates, THE Cross_Encoder_Reranker SHALL score each candidate against the section query using a lightweight cross-encoder model
2. THE Cross_Encoder_Reranker SHALL use a Node.js compatible cross-encoder model with no Python dependencies
3. THE Cross_Encoder_Reranker SHALL sort all 20 candidates by cross-encoder relevance scores in descending order
4. THE Cross_Encoder_Reranker SHALL return the top 8 highest-scoring snippets to maintain compatibility with generateBrd.ts expectations
5. THE Cross_Encoder_Reranker SHALL preserve the exact output interface and data structure expected by the BRD generation pipeline
6. IF cross-encoder scoring fails, THEN THE Hybrid_Retrieval_System SHALL fall back to returning the top 8 results from RRF fusion
7. THE Cross_Encoder_Reranker SHALL complete re-ranking operations within 500 milliseconds for 20 candidates
8. THE Cross_Encoder_Reranker SHALL handle empty or malformed queries gracefully by returning RRF-ranked results

### Requirement 10: Two-Pass BRD Section Generation

**User Story:** As a BRD generation system, I want to implement a two-pass reflection loop for section generation, so that I can improve content quality by critiquing and rewriting draft sections.

#### Acceptance Criteria

1. THE BRD_Section_Generator SHALL generate each BRD section using a two-pass approach instead of the current single-pass method
2. WHEN generating a section, THE BRD_Section_Generator SHALL first create a draft section using the existing generation logic as Pass 1
3. THE BRD_Section_Generator SHALL make a second Gemini API call in Pass 2 to critique the draft for vague language, missing requirements, and weak evidence links
4. THE BRD_Section_Generator SHALL rewrite the section based on the critique feedback in the same Pass 2 API call
5. THE BRD_Section_Generator SHALL allocate a total token budget of 2000 tokens across both passes for each section
6. THE BRD_Section_Generator SHALL preserve the existing evidence array building and storage mechanisms without modification
7. THE BRD_Section_Generator SHALL maintain the same function signatures and return formats as the current generateSection implementation
8. THE BRD_Section_Generator SHALL handle API failures gracefully by falling back to the Pass 1 draft if Pass 2 critique and rewrite fails

### Requirement 11: Independent Quality Scoring System

**User Story:** As a BRD quality assessment system, I want to use an independent evaluator model separate from the BRD generator, so that I can provide unbiased quality scoring with detailed criteria evaluation.

#### Acceptance Criteria

1. THE Quality_Scoring_System SHALL use a separate Gemini API call with an independent evaluator system prompt instead of the same model that generated the BRD
2. THE Quality_Evaluator SHALL act as an independent judge that evaluates BRD quality without knowledge of the generation process
3. THE Quality_Evaluator SHALL assess four explicit scoring criteria: completeness, clarity, consistency, and evidence linking
4. WHEN evaluating completeness, THE Quality_Evaluator SHALL verify that all required BRD fields and sections are present and substantive
5. WHEN evaluating clarity, THE Quality_Evaluator SHALL assess whether language is specific, unambiguous, and uses precise terminology
6. WHEN evaluating consistency, THE Quality_Evaluator SHALL identify contradictions between different sections and conflicting requirements
7. WHEN evaluating evidence, THE Quality_Evaluator SHALL verify that every claim and requirement is linked to a specific source snippet with proper attribution
8. THE Quality_Evaluator SHALL return scores as JSON in the format: { completeness: number, clarity: number, consistency: number, evidence: number, overall: number, reasoning: string }
9. THE Quality_Evaluator SHALL provide scores on a 0-100 scale for each criterion and the overall assessment
10. THE Quality_Evaluator SHALL include a reasoning string that explains the scoring rationale and identifies specific areas for improvement
11. THE Quality_Scoring_System SHALL replace the existing rule-based scoring logic in scoreQuality.ts while maintaining the same function interface
12. THE Quality_Scoring_System SHALL handle API failures gracefully by falling back to the existing deterministic scoring method

### Requirement 12: Schema Validation with Auto-Retry

**User Story:** As a BRD generation system, I want to validate each generated section against a predefined TypeScript schema, so that I can ensure consistent output structure and automatically retry generation when validation fails.

#### Acceptance Criteria

1. THE BRD_Section_Generator SHALL validate each generated section against the TypeScript schema: { requirement_id: string, description: string, acceptance_criteria: string[], priority: "MUST" | "SHOULD" | "COULD", evidence: { snippet_id: string, source: string }[], stakeholder: string }
2. WHEN a section is generated, THE BRD_Section_Generator SHALL perform schema validation before storing the section content
3. IF validation fails on the first attempt, THEN THE BRD_Section_Generator SHALL automatically retry generation once with validation errors appended to the generation prompt
4. IF validation fails on the second attempt, THEN THE BRD_Section_Generator SHALL flag the section with status "NEEDS_REVIEW" instead of storing invalid output
5. THE BRD_Section_Generator SHALL log all validation failures with specific error details for debugging and monitoring
6. THE BRD_Section_Generator SHALL never silently save sections that fail schema validation
7. THE BRD_Section_Generator SHALL preserve the existing function signatures and return formats while adding validation logic
8. THE BRD_Section_Generator SHALL handle schema validation errors gracefully without breaking the overall BRD generation process